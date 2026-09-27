// Evaluate the fixed 20 scenes sequentially and save results in eval/runs/.
// Run from the project directory in your terminal.
// Provide SHIYIN_INVITE through a hidden terminal prompt; EVAL_TOKEN is read from .env.
// Local evaluation: node eval/run.mjs http://localhost:5178 local
// Then run: node eval/report.mjs eval/runs/<file>.json [eval/runs/baseline.json]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// Read EVAL_TOKEN from the local .env if it is not already set; deployment initialization creates it.
try { const m = readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^EVAL_TOKEN=(.+)$/m); if (m && !process.env.EVAL_TOKEN) process.env.EVAL_TOKEN = m[1].trim(); } catch {}
const base = (process.argv[2] || 'http://localhost:5178').replace(/\/$/, '');
const tag = process.argv[3] || 'run';
const only = Number(process.env.EVAL_N || 0);
const prompts = JSON.parse(readFileSync(new URL('./prompts.json', import.meta.url), 'utf8')).slice(0, only || undefined);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let cookie = '';
const H = () => ({ 'Content-Type': 'application/json', Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(process.env.EVAL_TOKEN ? { 'X-Eval-Token': process.env.EVAL_TOKEN } : {}) });

if (process.env.SHIYIN_INVITE) {
  const r = await fetch(base + '/api/login', { method: 'POST', headers: H(), body: JSON.stringify({ code: process.env.SHIYIN_INVITE }) });
  if (!r.ok) { console.error('Invitation code login failed:', r.status); process.exit(1); }
  cookie = String(r.headers.get('set-cookie') || '').split(';')[0];
}
const health = await fetch(base + '/api/health').then(r => r.json()).catch(() => ({}));
console.log(`Evaluation ${base} · Model ${health.model || '?'} · ${prompts.length} scenes`);
const out = { tag, base, model: health.model, at: new Date().toISOString(), runs: [] };
mkdirSync(new URL('./runs/', import.meta.url), { recursive: true });
const file = new URL(`./runs/${new Date().toISOString().slice(0, 10)}-${tag}.json`, import.meta.url);
for (const [i, mood] of prompts.entries()) {
  const t0 = Date.now();
  const r = await fetch(base + '/api/arrange', { method: 'POST', headers: H(), body: JSON.stringify({ mood }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.log(`✗ ${mood}：${j.error || r.status} (stopped)`); out.stopped = { mood, code: r.status, error: j.error }; break; }
  let res = null;
  for (let k = 0; k < 150; k++) { await sleep(5000); res = await fetch(base + '/api/job?id=' + j.job, { headers: H() }).then(x => x.json()).catch(() => null); if (res && res.status !== 'running') break; }
  out.runs.push({ mood, ms: Date.now() - t0, status: res?.status, error: res?.error, plan: res?.plan });
  console.log(`${i + 1}/${prompts.length} ${res?.status === 'done' ? '✓' : '✗'} ${mood}（${Math.round((Date.now() - t0) / 1000)}s）`);
  writeFileSync(file, JSON.stringify(out, null, 1));
  await sleep(11000);   // Respect the Nginx limit of six requests per minute.
}
console.log('Results: ' + file.pathname);
