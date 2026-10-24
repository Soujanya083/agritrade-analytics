// Checks that every source cited by the Companion Planting feature still opens.
//   node agribid/scripts/checkSourceLinks.mjs            report only
//   node agribid/scripts/checkSourceLinks.mjs --write    also stamp `verifiedOn: 'today'` on every link that opened
//
// Needs internet. Some publishers (ScienceDirect, ResearchGate, Wiley, Springer) refuse automated requests with
// 403/429: those are "blocked", which means "open it in a browser", not "broken". A timeout or network error is a
// "warning" (the site may just be slow). Only a real 404/410/5xx counts as BROKEN and makes the script exit 1.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const write = process.argv.includes('--write');
const today = new Date().toISOString().slice(0, 10);
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'companionSources.js');
const original = readFileSync(file, 'utf8');
const lines = original.split('\n');
const entries = lines
  .map((line, index) => {
    const id = /^\s{2}(\w+): \{/.exec(line);
    const url = /url: '([^']+)'/.exec(line);
    return id && url ? { id: id[1], url: url[1], index } : null;
  })
  .filter(Boolean);

async function check({ id, url }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (link check)' } });
    if (res.ok) return { id, url, state: 'ok', status: res.status };
    if ([401, 403, 429].includes(res.status)) return { id, url, state: 'blocked', status: res.status };
    return { id, url, state: 'BROKEN', status: res.status };
  } catch (error) {
    return { id, url, state: 'warning', status: error.name };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const entry of entries) { // sequential and polite
  const r = { ...(await check(entry)), index: entry.index };
  results.push(r);
  console.log(`${r.state.padEnd(8)} ${String(r.status).padEnd(10)} ${r.id}`);
}

if (write) {
  results.filter((r) => r.state === 'ok').forEach((r) => {
    const line = lines[r.index];
    lines[r.index] = /verifiedOn: '[^']*'/.test(line)
      ? line.replace(/verifiedOn: '[^']*'/, `verifiedOn: '${today}'`)
      : line.replace(/ \},?\s*$/, (end) => `, verifiedOn: '${today}'${end}`);
  });
  writeFileSync(file, lines.join('\n'));
  console.log(`\nStamped verifiedOn: ${today} on ${results.filter((r) => r.state === 'ok').length} sources.`);
}

const count = (state) => results.filter((r) => r.state === state).length;
const broken = results.filter((r) => r.state === 'BROKEN');
console.log(`\n${results.length} links: ${count('ok')} ok, ${count('blocked')} blocked (open manually), ${count('warning')} warnings (timeout or network), ${broken.length} broken.`);
if (broken.length) {
  console.log('Fix or remove these in companionSources.js (and any pair that cites them):');
  broken.forEach((r) => console.log(` - ${r.id}: ${r.url}`));
  process.exit(1);
}
