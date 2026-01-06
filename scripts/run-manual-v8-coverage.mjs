import { spawn } from 'node:child_process';
import http from 'node:http';

function cmd(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
  return child;
}

function waitFor(url, timeoutMs = 60_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }

      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        setTimeout(tick, 500);
      });
    };

    tick();
  });
}

async function main() {
  // 1) Build with sourcemaps (required for mapping coverage back to TS sources)
  const buildCode = await run(cmd('npm'), ['run', 'build', '--', '--sourcemap']);
  if (buildCode !== 0) process.exit(buildCode);

  // 2) Start preview server
  // Use Vite preview directly to avoid leaving npm wrapper processes around.
  const preview = start(cmd('npx'), ['vite', 'preview', '--port', '4173', '--strictPort', '--host', '127.0.0.1']);

  const stopPreview = () => {
    try {
      preview.kill();
    } catch {
      // ignore
    }
  };

  process.on('exit', stopPreview);
  process.on('SIGINT', () => {
    stopPreview();
    process.exit(130);
  });

  await waitFor('http://127.0.0.1:4173/');

  // 3) Run Playwright manual coverage collection (headed + pause)
  const pwCode = await run(cmd('npx'), ['playwright', 'test', '-c', 'playwright.config.ts', 'playwright/manual-coverage.spec.ts']);

  // 4) Stop server
  stopPreview();

  if (pwCode !== 0) process.exit(pwCode);

  // 5) Generate report
  const reportCode = await run(cmd('node'), ['scripts/v8-coverage-report.mjs']);
  process.exit(reportCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
