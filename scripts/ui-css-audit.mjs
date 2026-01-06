/*
  UI CSS Audit

  Generates a categorized inventory of all CSS classes under src/(all folders)/*.css,
  flags likely-dead CSS rules/classes, and reports high-similarity CSS files.

  Usage:
    node scripts/ui-css-audit.mjs
    node scripts/ui-css-audit.mjs --fix

  Notes:
  - "Used" detection is conservative: any occurrence of a class token anywhere
    in src/(all folders)/*.(ts|tsx|js|jsx|html) counts as used.
  - "Fix" only removes simple, high-confidence dead rules.
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';

const repoRoot = path.resolve(process.cwd());
const srcRoot = path.join(repoRoot, 'src');
const outDoc = path.join(repoRoot, 'docs', 'architecture', 'UI_CSS_CLASSIFICATION.md');
const outGuide = path.join(repoRoot, 'docs', 'architecture', 'UI_CSS_REVIEW_GUIDE.md');

const args = new Set(process.argv.slice(2));
const shouldFix = args.has('--fix');
const includeVendor = args.has('--include-vendor');

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.html']);
const CSS_EXTS = new Set(['.css']);

const EXTERNAL_CLASS_PREFIXES = [
  'ant-',
  'rc-',
  'tippy-',
  'emoji-',
  'em-',
  'gridstack',
  'grid-stack',
  'react-flow',
  'toastui-',
  'tui-',
  'lm_',
];

function isExternalClass(className) {
  return EXTERNAL_CLASS_PREFIXES.some(p => className.startsWith(p));
}

async function walkFiles(dir) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Optionally skip vendor-heavy dirs
      if (!includeVendor) {
        if (dir === srcRoot && entry.name === 'lib') continue;
        if (entry.name === 'vendor') continue;
      }
      results.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function relFromRepo(absPath) {
  return toPosix(path.relative(repoRoot, absPath));
}

function categoryForCssFile(relPath) {
  const p = relPath.toLowerCase();
  if (p.startsWith('src/lib/tui.calendar/')) return 'Vendor / ToastUI Calendar';
  if (p.startsWith('src/lib/')) return 'Vendor / Other';
  if (p.startsWith('src/pages/themedemo/')) return 'Pages / ThemeDemo';
  if (p.startsWith('src/pages/home/')) return 'Pages / Home';
  if (p.startsWith('src/pages/event/')) return 'Pages / Event';
  if (p.startsWith('src/pages/calendar/')) return 'Pages / Calendar';

  if (p.startsWith('src/features/calendar/')) return 'Features / Calendar';
  if (p.startsWith('src/features/event/')) return 'Features / Event';
  if (p.startsWith('src/features/plan/')) return 'Features / Plan';
  if (p.startsWith('src/features/tag/')) return 'Features / Tag';
  if (p.startsWith('src/features/timelog/')) return 'Features / TimeLog';
  if (p.startsWith('src/features/dashboard/')) return 'Features / Dashboard';
  if (p.startsWith('src/features/timer/')) return 'Features / Timer';
  if (p.startsWith('src/features/contact/')) return 'Features / Contact';

  if (p.startsWith('src/components/shared/floatingtoolbar/')) return 'Components / FloatingToolbar';
  if (p.startsWith('src/components/shared/')) return 'Components / Shared';
  if (p.startsWith('src/components/common/')) return 'Components / Common';
  if (p.startsWith('src/components/')) return 'Components / Other';

  if (p.startsWith('src/styles/')) return 'Styles / Global';

  if (p === 'src/app.css') return 'App / Shell';
  if (p === 'src/index.css') return 'App / Entry';
  return 'Other';
}

function extractClassNamesFromSelector(selector) {
  // Conservative: only capture valid identifiers after '.'
  // e.g. .foo, .foo-bar, ._x, .-x
  // Avoid trailing '-' (often comes from prefix selectors like .toastui-calendar-*)
  const classRegex = /\.(-?[_a-zA-Z]+[\w-]*[\w])/g;
  const classes = new Set();
  for (;;) {
    const m = classRegex.exec(selector);
    if (!m) break;
    const name = m[1];
    classes.add(name);
  }
  return classes;
}

function normalizeDeclValue(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractDeclarationSets(cssText, fromFile) {
  // Used for similarity detection; ignores selectors.
  // Uses PostCSS AST so it works for minified CSS and avoids false positives.
  const pairs = new Set();
  const props = new Set();

  let root;
  try {
    root = postcss.parse(cssText, { from: fromFile });
  } catch {
    return { pairs, props };
  }

  root.walkDecls((decl) => {
    const prop = String(decl.prop || '').toLowerCase().trim();
    if (!prop) return;
    const value = normalizeDeclValue(String(decl.value ?? ''));

    props.add(prop);

    // Skip highly-unique values (urls, data URIs) to avoid drowning similarity.
    if (/\burl\(/i.test(value)) return;
    if (value.length > 80) return;

    pairs.add(`${prop}:${value}`);
  });

  return { pairs, props };
}

function extractClassNamesFromCss(cssText, fromFile) {
  // Extract class names only from rule selectors (never from URLs/import strings).
  const classes = new Set();
  let root;
  try {
    root = postcss.parse(cssText, { from: fromFile });
  } catch {
    return classes;
  }

  root.walkRules((rule) => {
    const selector = rule.selector?.trim();
    if (!selector) return;
    for (const c of extractClassNamesFromSelector(selector)) classes.add(c);
  });
  return classes;
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function inferKindFromRelCss(relPath) {
  const base = path.posix.basename(relPath).toLowerCase();
  const p = relPath.toLowerCase();

  if (p.startsWith('src/lib/tui.calendar/')) return 'vendor-calendar';
  if (p.startsWith('src/lib/')) return 'vendor';

  if (base.includes('picker')) return 'picker';
  if (base.includes('modal')) return 'modal';
  if (base.includes('menu')) return 'menu';
  if (base.includes('toolbar')) return 'toolbar';
  if (base.includes('slate')) return 'slate';
  if (base.includes('card')) return 'card';
  if (base.includes('panel')) return 'panel';
  if (base.includes('sidebar')) return 'sidebar';
  if (base.includes('tab')) return 'tabs';
  if (base.includes('calendar')) return 'calendar';
  if (p.includes('/charts/')) return 'charts';
  if (base.includes('input')) return 'inputs';
  if (base.includes('layout') || p.includes('/layout/')) return 'layout';
  if (p.startsWith('src/styles/')) return 'global-styles';

  return 'other';
}

function isVendorRel(relPath) {
  const p = relPath.toLowerCase();
  return p.startsWith('src/lib/');
}

function toMarkdownLink(relPath) {
  // Keep this as plain markdown text; VS Code will linkify relative paths in markdown.
  return relPath;
}

function computeUnionFind(items) {
  const parent = new Map(items.map(x => [x, x]));
  const find = (x) => {
    const p = parent.get(x);
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const groups = () => {
    const g = new Map();
    for (const x of items) {
      const r = find(x);
      const list = g.get(r) ?? [];
      list.push(x);
      g.set(r, list);
    }
    return Array.from(g.values()).map(list => list.slice().sort((a, b) => a.localeCompare(b)));
  };
  return { union, groups };
}

function topSharedLocalClasses(files, minFiles = 3, limit = 12) {
  // files: array of { rel, classes } where classes are sorted.
  const counts = new Map();
  for (const f of files) {
    const local = f.classes.filter(c => !isExternalClass(c));
    for (const c of new Set(local)) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  const shared = Array.from(counts.entries())
    .filter(([, n]) => n >= minFiles)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
  return shared;
}

function extractUiPrimitivesFromClasses(files) {
  // Heuristic: identify common state+structure tokens you likely want to unify.
  const wanted = new Set([
    'active',
    'selected',
    'disabled',
    'loading',
    'empty',
    'error',
    'success',
    'overlay',
    'modal',
    'modal-content',
    'modal-header',
    'modal-footer',
    'close-btn',
    'close-button',
    'btn',
    'btn-primary',
    'btn-secondary',
    'btn-cancel',
    'btn-save',
    'search-input',
    'search-input-wrapper',
    'picker-header',
    'picker-footer',
    'picker-actions',
  ]);

  const hit = new Map();
  for (const f of files) {
    for (const c of f.classes) {
      if (!wanted.has(c)) continue;
      const set = hit.get(c) ?? new Set();
      set.add(f.rel);
      hit.set(c, set);
    }
  }

  return Array.from(hit.entries())
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([c, filesSet]) => ({ c, files: Array.from(filesSet).sort((a, b) => a.localeCompare(b)) }));
}

function extractImportCssSpecifiers(codeText) {
  const specs = [];
  const importRegex = /import\s+(?:[^'";]+\s+from\s+)?['"]([^'"]+\.css)['"];?/g;
  for (;;) {
    const m = importRegex.exec(codeText);
    if (!m) break;
    specs.push(m[1]);
  }
  // CommonJS require
  const requireRegex = /require\(\s*['"]([^'"]+\.css)['"]\s*\)/g;
  for (;;) {
    const m = requireRegex.exec(codeText);
    if (!m) break;
    specs.push(m[1]);
  }
  return specs;
}

function extractCssAtImports(cssText) {
  const specs = [];
  const importRegex = /@import\s+['"]([^'"]+\.css)['"]/g;
  for (;;) {
    const m = importRegex.exec(cssText);
    if (!m) break;
    specs.push(m[1]);
  }
  return specs;
}

function resolveCssSpecifier(spec, importerAbs) {
  // Returns absolute path if resolvable to repo files; else null.
  if (spec.startsWith('@frontend/')) {
    const rest = spec.slice('@frontend/'.length);
    return path.join(repoRoot, 'src', rest);
  }
  if (spec.startsWith('/src/')) {
    return path.join(repoRoot, spec.slice(1));
  }
  if (spec.startsWith('./') || spec.startsWith('../')) {
    return path.resolve(path.dirname(importerAbs), spec);
  }
  return null;
}

function extractUsedClassesFromCode(codeText) {
  const used = new Set();

  const addFromClassAttr = (value) => {
    value
      .split(/\s+/)
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(c => used.add(c));
  };

  // JSX/TSX className="..."
  for (const m of codeText.matchAll(/className\s*=\s*['"]([^'"]+)['"]/g)) {
    addFromClassAttr(m[1]);
  }

  // JSX/TSX className={'...'} or {"..."}
  for (const m of codeText.matchAll(/className\s*=\s*\{\s*['"]([^'"]+)['"]\s*\}/g)) {
    addFromClassAttr(m[1]);
  }

  // HTML class="..."
  for (const m of codeText.matchAll(/\bclass\s*=\s*['"]([^'"]+)['"]/g)) {
    addFromClassAttr(m[1]);
  }

  // classList.add('a', 'b')
  for (const m of codeText.matchAll(/classList\.add\(([^)]+)\)/g)) {
    for (const sm of m[1].matchAll(/['"]([^'"]+)['"]/g)) {
      addFromClassAttr(sm[1]);
    }
  }

  // querySelector('.foo') / closest('.foo')
  for (const m of codeText.matchAll(/\b(querySelectorAll|querySelector|closest)\(\s*['"]\.([_a-zA-Z][\w-]*)/g)) {
    used.add(m[2]);
  }

  // getElementsByClassName('foo')
  for (const m of codeText.matchAll(/getElementsByClassName\(\s*['"]([^'"]+)['"]/g)) {
    addFromClassAttr(m[1]);
  }

  return used;
}

function extractAllTokens(codeText) {
  // Conservative: treat any token-like identifier as "used" marker.
  const tokens = new Set();
  for (const m of codeText.matchAll(/\b[_a-zA-Z][\w-]{2,}\b/g)) {
    tokens.add(m[0]);
  }
  return tokens;
}

function canAutoRemoveRule(selector, localClassesInSelector) {
  // Only auto-remove very simple selectors to avoid breaking dynamic cases.
  // - no comma selectors
  // - selector length reasonable
  // - selector contains at least one local class
  // - no attribute selectors / no :global
  if (!selector) return false;
  if (selector.includes(',')) return false;
  if (selector.includes('[')) return false;
  if (selector.includes(':global')) return false;
  if (localClassesInSelector.length === 0) return false;
  if (selector.length > 120) return false;

  // Avoid removing vendor overrides
  if (/\.(ant-|rc-|tippy-|emoji-|em-)/.test(selector)) return false;

  return true;
}

async function main() {
  const allFiles = await walkFiles(srcRoot);
  const cssFiles = allFiles.filter(f => CSS_EXTS.has(path.extname(f)));
  const codeFiles = allFiles.filter(f => CODE_EXTS.has(path.extname(f)));
  const rootHtml = path.join(repoRoot, 'index.html');
  try {
    await fs.access(rootHtml);
    codeFiles.push(rootHtml);
  } catch {
    // ignore
  }

  const codeTextAll = [];
  const usedClasses = new Set();
  const usedTokens = new Set();

  for (const f of codeFiles) {
    const txt = await fs.readFile(f, 'utf8');
    codeTextAll.push(txt);
    for (const c of extractUsedClassesFromCode(txt)) usedClasses.add(c);
    for (const t of extractAllTokens(txt)) usedTokens.add(t);
  }

  // Build css import reference map (excluding ThemeDemo raw audit; it doesn't import css by specifier)
  const referencedCss = new Set();
  const cssImporters = new Map(); // cssAbs -> Set(importerRel)

  for (const f of codeFiles) {
    if (!CODE_EXTS.has(path.extname(f))) continue;
    const txt = await fs.readFile(f, 'utf8');
    const specs = extractImportCssSpecifiers(txt);
    for (const spec of specs) {
      const resolved = resolveCssSpecifier(spec, f);
      if (!resolved) continue;
      if (!resolved.endsWith('.css')) continue;
      const abs = resolved;
      referencedCss.add(abs);
      const set = cssImporters.get(abs) ?? new Set();
      set.add(relFromRepo(f));
      cssImporters.set(abs, set);
    }
  }

  // @import chains inside CSS
  for (const cssFile of cssFiles) {
    const cssText = await fs.readFile(cssFile, 'utf8');
    const specs = extractCssAtImports(cssText);
    for (const spec of specs) {
      const resolved = resolveCssSpecifier(spec, cssFile);
      if (!resolved) continue;
      referencedCss.add(resolved);
      const set = cssImporters.get(resolved) ?? new Set();
      set.add(relFromRepo(cssFile));
      cssImporters.set(resolved, set);
    }
  }

  // Always treat index.css as entry even if import parsing misses it
  referencedCss.add(path.join(srcRoot, 'index.css'));

  // Inventory per file
  const perFile = [];
  const classToFiles = new Map(); // className -> Set(relCss)
  const filePairs = []; // for similarity

  for (const cssFile of cssFiles) {
    const rel = relFromRepo(cssFile);
    const cssText = await fs.readFile(cssFile, 'utf8');
    const classes = extractClassNamesFromCss(cssText, cssFile);
    const { pairs, props } = extractDeclarationSets(cssText, cssFile);

    for (const c of classes) {
      const s = classToFiles.get(c) ?? new Set();
      s.add(rel);
      classToFiles.set(c, s);
    }

    perFile.push({
      abs: cssFile,
      rel,
      category: categoryForCssFile(rel),
      isReferenced: referencedCss.has(cssFile),
      importers: Array.from(cssImporters.get(cssFile) ?? []),
      classes: Array.from(classes).sort((a, b) => a.localeCompare(b)),
      classCount: classes.size,
      pairs,
      props,
      size: cssText.length,
    });

    filePairs.push({ rel, pairs, props });
  }

  // Similarity scan (file-level)
  const similar = [];
  for (let i = 0; i < filePairs.length; i++) {
    for (let j = i + 1; j < filePairs.length; j++) {
      const a = filePairs[i];
      const b = filePairs[j];
      // Quick pruning: only compare within same major bucket (components/features/pages/styles/vendor)
      const aTop = a.rel.split('/').slice(0, 2).join('/');
      const bTop = b.rel.split('/').slice(0, 2).join('/');
      if (aTop !== bTop) continue;

      // Skip vendor-to-vendor comparisons unless explicitly requested
      if (!includeVendor) {
        if (a.rel.toLowerCase().startsWith('src/lib/')) continue;
        if (b.rel.toLowerCase().startsWith('src/lib/')) continue;
      }

      const scoreProps = jaccard(a.props, b.props);
      const scorePairs = jaccard(a.pairs, b.pairs);

      // Use prop-level similarity as primary signal (tolerates different tokens/colors)
      if (scoreProps >= 0.78 && a.props.size >= 15 && b.props.size >= 15) {
        similar.push({ a: a.rel, b: b.rel, scoreProps, scorePairs });
      }
    }
  }
  similar.sort((x, y) => (y.scoreProps - x.scoreProps) || (y.scorePairs - x.scorePairs));

  // Review-guide similarity edges (more permissive, but scoped by kind and size)
  const reviewEdges = [];
  const relToMeta = new Map(perFile.map(f => [f.rel, f]));
  const candidatesForGuide = perFile
    // Always exclude vendor from consolidation guide to keep review focused and safe.
    .filter(f => !isVendorRel(f.rel))
    .map(f => ({ rel: f.rel, kind: inferKindFromRelCss(f.rel), props: f.props, pairs: f.pairs }));

  const byKind = new Map();
  for (const f of candidatesForGuide) {
    const list = byKind.get(f.kind) ?? [];
    list.push(f);
    byKind.set(f.kind, list);
  }

  for (const [kind, list] of byKind.entries()) {
    if (kind === 'vendor' || kind === 'vendor-calendar') continue;
    if (list.length < 2) continue;
    // Pairwise inside kind only; keep it light by pruning tiny files.
    const filtered = list.filter(x => x.props.size >= 10);
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const a = filtered[i];
        const b = filtered[j];
        const scoreProps = jaccard(a.props, b.props);
        const scorePairs = jaccard(a.pairs, b.pairs);
        if (scoreProps >= 0.62 && a.props.size >= 12 && b.props.size >= 12) {
          reviewEdges.push({ kind, a: a.rel, b: b.rel, scoreProps, scorePairs });
        }
      }
    }
  }
  reviewEdges.sort((x, y) => (y.scoreProps - x.scoreProps) || (y.scorePairs - x.scorePairs));

  // Dead rule scan + optional fix
  const deadRuleReport = []; // {file, selector, classes}
  const unusedClassReport = new Map(); // fileRel -> {unusedLocal, totalLocal}

  for (const file of perFile) {
    // Estimate unused at class-name level
    const localClasses = file.classes.filter(c => !isExternalClass(c));
    const unusedLocal = localClasses.filter(c => !usedTokens.has(c));
    unusedClassReport.set(file.rel, { unusedLocal, totalLocal: localClasses.length });

    if (!shouldFix) continue;

    // Fix: remove only simple dead rules via PostCSS AST (handles @media nesting, etc.)
    const cssText = await fs.readFile(file.abs, 'utf8');
    const root = postcss.parse(cssText, { from: file.abs });
    let modified = false;

    root.walkRules((rule) => {
      const selector = rule.selector?.trim();
      if (!selector) return;

      const selectorClasses = Array.from(extractClassNamesFromSelector(selector));
      const localInSelector = selectorClasses.filter(c => !isExternalClass(c));
      const allLocalUnused = localInSelector.length > 0 && localInSelector.every(c => !usedTokens.has(c));

      if (allLocalUnused && canAutoRemoveRule(selector, localInSelector)) {
        modified = true;
        deadRuleReport.push({ file: file.rel, selector, classes: localInSelector });
        rule.remove();
      }
    });

    if (modified) {
      await fs.writeFile(file.abs, root.toString(), 'utf8');
    }
  }

  // Build markdown doc
  const byCategory = new Map();
  for (const f of perFile) {
    const list = byCategory.get(f.category) ?? [];
    list.push(f);
    byCategory.set(f.category, list);
  }

  const categories = Array.from(byCategory.keys()).sort((a, b) => a.localeCompare(b));

  const lines = [];
  lines.push('# UI CSS 分类与清理报告');
  lines.push('');
  lines.push(`> 生成时间：${new Date().toISOString()}`);
  lines.push('');
  lines.push('## 0. 摘要');
  lines.push('');
  lines.push(`- 扫描 CSS：${cssFiles.length} 个（范围：src/**/*.css${includeVendor ? '，包含 src/lib vendor' : '，默认排除 src/lib vendor'}）`);
  lines.push(`- 扫描代码：${codeFiles.length} 个（用于“保守使用判定”）`);
  lines.push(`- 自动删除规则：${deadRuleReport.length} 条${shouldFix ? '' : '（仅 --fix 时会实际删除）'}`);
  lines.push(`- 高相似文件对：${Math.min(similar.length, 40)} 条（按 prop 相似度排序，最多展示 40）`);
  lines.push('');
  lines.push('本文件为自动整理结果：');
  lines.push('- 全量列出 `src/**/*.css` 中出现过的 **CSS class 选择器**（包含对 Ant/Tippy 等三方组件的覆盖类）。');
  lines.push('- 给出“疑似死代码”扫描（按 class 粒度）与“高置信可自动删除的死规则”记录。');
  lines.push('- 给出 CSS 文件相似度（高相似可合并候选）。');
  lines.push('');
  lines.push('## 1. 范围与方法');
  lines.push('');
  lines.push(`- **CSS 文件范围**：扫描 \`src/**/*.css\`${includeVendor ? '（包含 src/lib 供应商代码）' : '（默认跳过 src/lib 供应商代码；用 --include-vendor 可包含）'}。`);
  lines.push('- **class 抽取方式**：通过 PostCSS 解析，仅从“规则选择器”提取 `.class-name`（避免误把 url/文件扩展名当成 class）。');
  lines.push('- **使用判定（保守）**：只要 class 名在 `src/**/*.{ts,tsx,js,jsx,html}` 任意位置出现过（含注释/字符串/模板字面量），就认为“可能被使用”，避免误删。');
  lines.push('- **自动清理（仅在 --fix）**：只删除“简单且高置信”的规则（单 selector、无逗号、无属性选择器、且 selector 中所有本地 class 都未出现过）。');
  lines.push('');

  lines.push('## 2. 分类清单（按文件）');
  lines.push('');

  for (const cat of categories) {
    lines.push(`### ${cat}`);
    lines.push('');
    const files = byCategory.get(cat).slice().sort((a, b) => a.rel.localeCompare(b.rel));

    for (const f of files) {
      const ref = f.isReferenced ? 'referenced' : 'not-referenced-by-static-import';
      const importerInfo = f.importers.length ? `（importers: ${f.importers.join(', ')}）` : '';
      lines.push(`- ${f.rel}  | classes: ${f.classCount} | ${ref} ${importerInfo}`);
      if (f.classes.length) {
        lines.push('  - class list: ' + f.classes.join(', '));
      } else {
        lines.push('  - class list: (none)');
      }
    }
    lines.push('');
  }

  lines.push('## 3. 疑似死代码（class 级别）');
  lines.push('');
  lines.push('说明：这里是“**class 名从未在代码中出现过**”的候选（仍可能是动态生成/运行期注入），用于人工复核与未来简化。');
  lines.push('');

  const deadByFile = [];
  for (const [fileRel, info] of unusedClassReport.entries()) {
    if (!info.unusedLocal.length) continue;
    deadByFile.push({ fileRel, unused: info.unusedLocal, totalLocal: info.totalLocal });
  }
  deadByFile.sort((a, b) => b.unused.length - a.unused.length);

  for (const item of deadByFile) {
    lines.push(`- ${item.fileRel} | unused local classes: ${item.unused.length}/${item.totalLocal}`);
    lines.push(`  - ${item.unused.join(', ')}`);
  }
  if (!deadByFile.length) {
    lines.push('- （未发现 0 命中 class）');
  }
  lines.push('');

  lines.push('## 4. 已自动删除的死规则（仅 --fix 时会有）');
  lines.push('');
  if (!deadRuleReport.length) {
    lines.push('- （本次未自动删除任何规则）');
  } else {
    const removedByFile = new Map();
    for (const r of deadRuleReport) {
      const list = removedByFile.get(r.file) ?? [];
      list.push(r);
      removedByFile.set(r.file, list);
    }
    const files = Array.from(removedByFile.keys()).sort((a, b) => a.localeCompare(b));
    for (const file of files) {
      const rules = removedByFile.get(file);
      lines.push(`- ${file} | removed: ${rules.length}`);
      const seen = new Set();
      for (const r of rules) {
        const key = `${r.selector}||${r.classes.join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(`  - selector: ${r.selector} | local-classes: ${r.classes.join(', ')}`);
      }
    }
  }
  lines.push('');

  lines.push('## 5. 高相似 CSS 文件（未来可合并候选）');
  lines.push('');
  if (!similar.length) {
    lines.push('- （未发现高相似度文件对）');
  } else {
    for (const s of similar.slice(0, 40)) {
      lines.push(
        `- props ${(s.scoreProps * 100).toFixed(1)}% / values ${(s.scorePairs * 100).toFixed(1)}%  ${s.a}  ↔  ${s.b}`,
      );
    }
  }
  lines.push('');

  lines.push('## 6. 全局索引（class → 定义文件）');
  lines.push('');
  lines.push('说明：同名 class 可能在多个文件里出现（覆盖/重复/冲突风险）。');
  lines.push('');

  const allClasses = Array.from(classToFiles.keys()).sort((a, b) => a.localeCompare(b));
  for (const c of allClasses) {
    const files = Array.from(classToFiles.get(c)).sort((a, b) => a.localeCompare(b));
    lines.push(`- .${c} → ${files.join(', ')}`);
  }

  await fs.mkdir(path.dirname(outDoc), { recursive: true });
  await fs.writeFile(outDoc, lines.join('\n'), 'utf8');

  // Build a short, human-review-friendly guide
  const guide = [];
  guide.push('# UI CSS 审阅与合并指南');
  guide.push('');
  guide.push(`> 生成时间：${new Date().toISOString()}`);
  guide.push('');
  guide.push('这份指南的目标是：把“几千行 class 列表”变成一个可执行的审阅顺序，并给出**可合并候选组**。');
  guide.push('');
  guide.push('## 1) 你要干嘛（最短路径）');
  guide.push('');
  guide.push('把 CSS 整理成“可复用的几套规则”，并且降低重复/冲突风险。建议按下面顺序做：');
  guide.push('');
  guide.push('- 先只看 **合并候选组**（本文件第 2 节），挑 1 组最明显的开始。');
  guide.push('- 对这一组做“抽公共部分”的草案：哪些规则应该成为一个 shared CSS（不用立刻改代码）。');
  guide.push('- 再用大报告做核对：同名 class 是否在多处重复定义、是否有冲突。');
  guide.push('');
  guide.push('相关大报告：');
  guide.push(`- ${toMarkdownLink(relFromRepo(outDoc))}`);
  guide.push('');
  guide.push('## 2) 合并候选组（按组件类型聚合）');
  guide.push('');
  guide.push('说明：这里的“相似”基于 CSS 属性集合（props）相似度；阈值偏保守但比大报告更宽松，方便你先抓住重复结构。');
  guide.push('');

  const kindOrder = [
    'picker',
    'modal',
    'menu',
    'toolbar',
    'panel',
    'card',
    'tabs',
    'slate',
    'calendar',
    'inputs',
    'layout',
    'charts',
    'global-styles',
    'other',
  ];

  const kindToFiles = new Map();
  for (const f of perFile) {
    // Always exclude vendor from guide.
    if (isVendorRel(f.rel)) continue;
    const kind = inferKindFromRelCss(f.rel);
    const list = kindToFiles.get(kind) ?? [];
    list.push(f);
    kindToFiles.set(kind, list);
  }

  const allReviewRels = new Set();
  for (const e of reviewEdges) {
    allReviewRels.add(e.a);
    allReviewRels.add(e.b);
  }

  for (const kind of kindOrder) {
    const files = (kindToFiles.get(kind) ?? []).slice().sort((a, b) => a.rel.localeCompare(b.rel));
    if (!files.length) continue;
    guide.push(`### ${kind}`);
    guide.push('');

    const edges = reviewEdges.filter(e => e.kind === kind).slice(0, 12);
    if (edges.length) {
      const uf = computeUnionFind(Array.from(new Set(edges.flatMap(e => [e.a, e.b]))));
      for (const e of edges) uf.union(e.a, e.b);
      const clusters = uf.groups().filter(g => g.length >= 2);
      if (clusters.length) {
        guide.push('- 合并候选簇：');
        for (const cluster of clusters.slice(0, 6)) {
          guide.push(`  - ${cluster.map(toMarkdownLink).join('  |  ')}`);
        }
        guide.push('');
      }

      guide.push('- 高相似文件对（Top）：');
      for (const e of edges.slice(0, 6)) {
        guide.push(`  - props ${(e.scoreProps * 100).toFixed(1)}% / values ${(e.scorePairs * 100).toFixed(1)}%  ${toMarkdownLink(e.a)}  ↔  ${toMarkdownLink(e.b)}`);
      }
      guide.push('');
    }

    const shared = topSharedLocalClasses(files, 3, 10);
    if (shared.length) {
      guide.push('- 这一类里最常见的本地 class（提示你哪些可做“统一语义/统一样式”）：');
      guide.push(`  - ${shared.map(([c, n]) => `${c}×${n}`).join(', ')}`);
      guide.push('');
    }

    // Only list files if they appear in some edge, to keep guide short.
    const interesting = files.filter(f => allReviewRels.has(f.rel));
    if (interesting.length) {
      guide.push('- 建议优先看的文件（出现在相似度候选里）：');
      for (const f of interesting.slice(0, 12)) {
        guide.push(`  - ${toMarkdownLink(f.rel)}`);
      }
      guide.push('');
    }
  }

  guide.push('## 3) “该抽成一套规则”的快速检查点');
  guide.push('');
  guide.push('你不需要逐行看 CSS。审阅时只需要回答这些问题：');
  guide.push('');
  guide.push('- **状态语义是否一致**：同样的状态是否总叫 `active/selected/disabled/loading`？');
  guide.push('- **结构是否一致**：是否反复出现 “header/body/footer + actions + close button + overlay”？');
  guide.push('- **交互容器是否一致**：Tippy/Popover/Dropdown 的 padding、圆角、阴影、边框是否重复写？');
  guide.push('- **输入框/搜索框是否一致**：search-input / wrapper / icon 是否在多处重复实现？');
  guide.push('- **空状态是否一致**：empty-state / empty-icon / empty-hint 是否重复？');
  guide.push('');

  const primitives = extractUiPrimitivesFromClasses(perFile.filter(f => !isVendorRel(f.rel)));
  const topPrimitives = primitives.filter(x => x.files.length >= 3).slice(0, 14);
  if (topPrimitives.length) {
    guide.push('### 常见“可统一”的 class（出现于多个文件）');
    guide.push('');
    for (const p of topPrimitives) {
      guide.push(`- .${p.c} → ${p.files.slice(0, 8).join(', ')}${p.files.length > 8 ? ' ...' : ''}`);
    }
    guide.push('');
  }

  guide.push('## 4) 下一步我可以帮你做什么');
  guide.push('');
  guide.push('- 如果你选定一个簇（比如 picker），我可以：');
  guide.push('  - 把这簇里“重复度最高的规则块”提取成一个 shared CSS 草案（先不改行为，只做样式引用替换）。');
  guide.push('  - 做一次非常保守的死代码清单（只输出候选，不自动删，且永远跳过 vendor）。');
  guide.push('');

  await fs.mkdir(path.dirname(outGuide), { recursive: true });
  await fs.writeFile(outGuide, guide.join('\n'), 'utf8');

  // Console summary
  const removed = deadRuleReport.length;
  console.log(`[ui-css-audit] CSS files: ${cssFiles.length}`);
  console.log(`[ui-css-audit] Output: ${relFromRepo(outDoc)}`);
  console.log(`[ui-css-audit] Guide: ${relFromRepo(outGuide)}`);
  console.log(`[ui-css-audit] Auto-removed dead rules: ${removed}${shouldFix ? '' : ' (run with --fix to remove)'} `);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
