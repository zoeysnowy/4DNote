import fs from 'node:fs';
import path from 'node:path';

const KNOWN_EVENTS = [
  'tui:init',
  'tui:changeView',

  // Instance events we wire in ToastUIReactCalendar
  'tui:event:clickEvent',
  'tui:event:selectDateTime',
  'tui:event:beforeCreateEvent',
  'tui:event:beforeUpdateEvent',
  'tui:event:beforeDeleteEvent',
  'tui:event:afterRenderEvent',
  'tui:event:clickDayName',
  'tui:event:clickMoreEventsBtn',
  'tui:event:clickTimezonesCollapseBtn',
];

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function pct(part, total) {
  if (!total) return '0.0';
  return ((part / total) * 100).toFixed(1);
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/dev-usage-report.mjs <dev_usage.json>');
    process.exitCode = 2;
    return;
  }

  const filePath = path.resolve(process.cwd(), arg);
  const log = readJson(filePath);
  const counts = (log && log.counts) || {};

  const used = KNOWN_EVENTS.filter((k) => (counts[k] ?? 0) > 0);
  const unused = KNOWN_EVENTS.filter((k) => (counts[k] ?? 0) === 0);

  // Extra: any events recorded that aren't in our checklist
  const recordedKeys = Object.keys(counts);
  const unknown = recordedKeys
    .filter((k) => counts[k] > 0)
    .filter((k) => !KNOWN_EVENTS.includes(k))
    .sort();

  const usedCount = used.length;
  const total = KNOWN_EVENTS.length;

  console.log('Dev Usage Report (instrumentation-based)');
  console.log('---------------------------------------');
  console.log(`Used events:   ${usedCount}/${total} (${pct(usedCount, total)}%)`);

  const totalHits = recordedKeys.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
  const knownHits = KNOWN_EVENTS.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
  console.log(`Total hits:    ${totalHits}`);
  console.log(`Known hits:    ${knownHits}`);

  console.log('\nUsed (non-zero):');
  used.forEach((k) => console.log(`- ${k}: ${counts[k]}`));

  console.log('\nUnused (zero):');
  unused.forEach((k) => console.log(`- ${k}`));

  if (unknown.length) {
    console.log('\nRecorded but not in checklist:');
    unknown.forEach((k) => console.log(`- ${k}: ${counts[k]}`));
  }

  if (Array.isArray(log?.samples) && log.samples.length) {
    console.log('\nSample count:', log.samples.length);
  }
}

main();
