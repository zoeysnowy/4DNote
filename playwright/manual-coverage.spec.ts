import fs from 'node:fs';
import path from 'node:path';

import { test } from '@playwright/test';

test('manual V8 coverage (interact, then resume)', async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false });
  await page.coverage.startCSSCoverage({ resetOnNavigation: false });

  await page.goto('/');

  // You will interact manually in the browser. When done, resume the test.
  // In the Playwright Inspector, press "Resume".
  await page.pause();

  const js = await page.coverage.stopJSCoverage();
  const css = await page.coverage.stopCSSCoverage();

  const outDir = path.resolve(process.cwd(), '.coverage');
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, 'v8-js.json'), JSON.stringify(js, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'v8-css.json'), JSON.stringify(css, null, 2), 'utf8');
});
