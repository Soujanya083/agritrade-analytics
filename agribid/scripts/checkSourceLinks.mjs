// Checks that every source cited by the Companion Planting feature still opens.
//   node agribid/scripts/checkSourceLinks.mjs
// Needs internet. Some publishers (ScienceDirect, ResearchGate, Wiley, Springer) refuse automated
// requests with 403/429: those are reported as "blocked", which means "open it in a browser", not "broken".
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'companionSources.js');
const text = readFileSync(file, 'utf8');
const entries = text.split('\n')
  .map((line) => {
    const id = /^\s{2}(\w+): \{/.exec(line);
    const url = /url: '([^']+)'/.exec(line);
    return id && url ? { id: id[1], url: url[1] } : null;
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
    return { id, url, state: 'ERROR', status: error.name };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const entry of entries) { // sequential and polite
  const r = await check(entry);
  results.push(r);
  console.log(`${r.state.padEnd(8)} ${String(r.status).padEnd(6)} ${r.id}`);
}
const bad = results.filter((r) => r.state === 'BROKEN' || r.state === 'ERROR');
console.log(`\n${results.length} links: ${results.filter((r) => r.state === 'ok').length} ok, ${results.filter((r) => r.state === 'blocked').length} blocked (open manually), ${bad.length} broken.`);
if (bad.length) { console.log('Fix or remove these in companionSources.js (and any pair that cites them):'); bad.forEach((r) => console.log(` - ${r.id}: ${r.url}`)); process.exit(1); }
