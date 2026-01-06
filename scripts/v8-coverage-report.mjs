import fs from 'node:fs';
import path from 'node:path';

import { createCoverageMap } from 'istanbul-lib-coverage';
import v8toIstanbul from 'v8-to-istanbul';

const repoRoot = process.cwd();
const v8Path = path.resolve(repoRoot, '.coverage', 'v8-js.json');

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function relFromRepo(filePath) {
  const rel = path.relative(repoRoot, filePath);
  return toPosix(rel);
}

function urlToBuiltFile(urlStr) {
  try {
    const u = new URL(urlStr);
    // Vite preview serves built assets from /assets/*
    if (u.pathname.startsWith('/assets/')) {
      const disk = path.resolve(repoRoot, 'build', u.pathname.slice(1));
      return disk;
    }
    return null;
  } catch {
    return null;
  }
}

function pct(covered, total) {
  if (!total) return 0;
  return Math.round((covered / total) * 1000) / 10;
}

function summarizeGroup(coverageMap, filterFn) {
  let linesTotal = 0;
  let linesCovered = 0;
  let branchesTotal = 0;
  let branchesCovered = 0;
  let functionsTotal = 0;
  let functionsCovered = 0;

  for (const file of coverageMap.files()) {
    const rel = toPosix(file);
    if (!filterFn(rel)) continue;

    const s = coverageMap.fileCoverageFor(file).toSummary();
    linesTotal += s.lines.total;
    linesCovered += s.lines.covered;
    branchesTotal += s.branches.total;
    branchesCovered += s.branches.covered;
    functionsTotal += s.functions.total;
    functionsCovered += s.functions.covered;
  }

  return {
    lines: { total: linesTotal, covered: linesCovered, pct: pct(linesCovered, linesTotal) },
    branches: { total: branchesTotal, covered: branchesCovered, pct: pct(branchesCovered, branchesTotal) },
    functions: { total: functionsTotal, covered: functionsCovered, pct: pct(functionsCovered, functionsTotal) },
  };
}

async function main() {
  if (!fs.existsSync(v8Path)) {
    console.error(`Missing ${toPosix(path.relative(repoRoot, v8Path))}`);
    console.error('Run: npm run coverage:manual');
    process.exitCode = 2;
    return;
  }

  const v8 = JSON.parse(fs.readFileSync(v8Path, 'utf8'));

  const coverageMap = createCoverageMap({});
  let convertedScripts = 0;

  for (const entry of v8) {
    const builtFile = urlToBuiltFile(entry.url);
    if (!builtFile) continue;
    if (!fs.existsSync(builtFile)) continue;

    const converter = v8toIstanbul(builtFile, 0, { source: fs.readFileSync(builtFile, 'utf8') });
    await converter.load();
    converter.applyCoverage(entry.functions);

    const ist = converter.toIstanbul();
    coverageMap.merge(ist);
    convertedScripts += 1;
  }

  // Normalize paths to repo-relative (istanbul may include absolute paths)
  const normalized = createCoverageMap({});
  for (const file of coverageMap.files()) {
    const abs = path.isAbsolute(file) ? file : path.resolve(repoRoot, file);
    const rel = relFromRepo(abs);
    if (rel.startsWith('..')) continue;
    normalized.addFileCoverage({ ...coverageMap.fileCoverageFor(file).toJSON(), path: rel });
  }

  const appFilter = (rel) => rel.startsWith('src/') && !rel.startsWith('src/lib/tui.calendar/');
  const tuiFilter = (rel) => rel.startsWith('src/lib/tui.calendar/');

  const app = summarizeGroup(normalized, appFilter);
  const tui = summarizeGroup(normalized, tuiFilter);

  const outDir = path.resolve(repoRoot, 'coverage');
  fs.mkdirSync(outDir, { recursive: true });

  const summary = {
    generatedAt: new Date().toISOString(),
    convertedScripts,
    app,
    tui,
  };

  fs.writeFileSync(path.join(outDir, 'v8-coverage-summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log('V8 Coverage Summary (sourcemap-mapped)');
  console.log('-----------------------------------');
  console.log(`Converted scripts: ${convertedScripts}`);
  console.log('');
  console.log(`4DNote app code (src/* excluding src/lib/tui.calendar/*):`);
  console.log(`- Lines:     ${app.lines.covered}/${app.lines.total} (${app.lines.pct}%)`);
  console.log(`- Functions: ${app.functions.covered}/${app.functions.total} (${app.functions.pct}%)`);
  console.log(`- Branches:  ${app.branches.covered}/${app.branches.total} (${app.branches.pct}%)`);
  console.log('');
  console.log(`Vendored TUI code (src/lib/tui.calendar/*):`);
  console.log(`- Lines:     ${tui.lines.covered}/${tui.lines.total} (${tui.lines.pct}%)`);
  console.log(`- Functions: ${tui.functions.covered}/${tui.functions.total} (${tui.functions.pct}%)`);
  console.log(`- Branches:  ${tui.branches.covered}/${tui.branches.total} (${tui.branches.pct}%)`);
  console.log('');
  console.log(`Wrote: ${toPosix(path.relative(repoRoot, path.join(outDir, 'v8-coverage-summary.json')))}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
