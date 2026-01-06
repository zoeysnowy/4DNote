import { spawn } from 'node:child_process';
import http from 'node:http';

function shouldUseShell(command) {
  // On Windows, npm/npx are typically .cmd shims. Spawning them with shell=false
  // often throws EINVAL. Using shell=true delegates to cmd.exe.
  return process.platform === 'win32';
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: shouldUseShell(command), ...options });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', shell: shouldUseShell(command), ...options });
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
  const buildCode = await run('npm', ['run', 'build', '--', '--sourcemap']);
  if (buildCode !== 0) process.exit(buildCode);

  // 2) Start preview server
  // Use Vite preview directly to avoid leaving npm wrapper processes around.
  const preview = start('npx', ['vite', 'preview', '--port', '4173', '--strictPort', '--host', '127.0.0.1']);

  const stopPreview = () => {
    try {
      if (process.platform === 'win32' && preview.pid) {
        // Kill the entire process tree (cmd.exe -> node -> vite preview)
        spawn('taskkill', ['/PID', String(preview.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
      } else {
        preview.kill();
      }
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
  const pwCode = await run('npx', ['playwright', 'test', '-c', 'playwright.config.ts', 'playwright/manual-coverage.spec.ts']);

  // 4) Stop server
  stopPreview();

  if (pwCode !== 0) process.exit(pwCode);

  // 5) Generate report
  const reportCode = await run(process.execPath, ['scripts/v8-coverage-report.mjs']);
  process.exit(reportCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
