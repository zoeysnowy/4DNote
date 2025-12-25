const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/debug-brace-scan.cjs <relative-path>');
  process.exit(2);
}

const filePath = path.isAbsolute(target) ? target : path.join(process.cwd(), target);
const text = fs.readFileSync(filePath, 'utf8');

let line = 1;
let col = 0;

let inSingle = false;
let inDouble = false;
let inTemplate = false;
let inLineComment = false;
let inBlockComment = false;
let escape = false;

/** @type {{line:number,col:number,preview:string}[]} */
const stack = [];

const checkpoints = new Set([77, 200, 500, 800, 1200, 1600, 2000, 2400, 2600, 2700, 2750, 2764, 2765, 2770, 2780, 2810, 2830]);
let lastReportedLine = 1;

function previewAt(index) {
  return text
    .slice(index, Math.min(text.length, index + 140))
    .split('\n')[0]
    .replace(/\t/g, '↹');
}

for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  const next = text[i + 1];

  if (ch === '\n') {
    if (checkpoints.has(line) && lastReportedLine !== line) {
      lastReportedLine = line;
      const top = stack
        .slice(-3)
        .map(s => `${s.line}:${s.col}`)
        .join(' <- ');
      console.log(`[depth@${line}] ${stack.length}${top ? ` | top ${top}` : ''}`);
    }
    line += 1;
    col = 0;
    inLineComment = false;
    continue;
  }

  col += 1;

  if (inLineComment) continue;

  if (inBlockComment) {
    if (ch === '*' && next === '/') {
      inBlockComment = false;
      i += 1;
      col += 1;
    }
    continue;
  }

  if (!inSingle && !inDouble && !inTemplate) {
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      col += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      col += 1;
      continue;
    }
  }

  if (inSingle) {
    if (!escape && ch === "'") inSingle = false;
    escape = !escape && ch === '\\';
    continue;
  }
  if (inDouble) {
    if (!escape && ch === '"') inDouble = false;
    escape = !escape && ch === '\\';
    continue;
  }
  if (inTemplate) {
    if (!escape && ch === '`') inTemplate = false;
    escape = !escape && ch === '\\';
    continue;
  }

  escape = false;

  if (ch === "'") {
    inSingle = true;
    continue;
  }
  if (ch === '"') {
    inDouble = true;
    continue;
  }
  if (ch === '`') {
    inTemplate = true;
    continue;
  }

  if (ch === '{') {
    stack.push({ line, col, preview: previewAt(i) });
    continue;
  }

  if (ch === '}') {
    if (stack.length) {
      stack.pop();
    }
  }
}

console.log(`${path.relative(process.cwd(), filePath)} unmatched '{': ${stack.length}`);
console.log(
  `EOF states: single=${inSingle} double=${inDouble} template=${inTemplate} lineComment=${inLineComment} blockComment=${inBlockComment}`
);
for (const item of stack.slice(-40)) {
  console.log(`- ${item.line}:${item.col}  ${item.preview}`);
}
