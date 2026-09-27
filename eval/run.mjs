// 跑一轮评测：固定 20 个意象，依次调用编曲台生成，把结果存到 eval/runs/
// 用法（在你的 Mac 终端，项目文件夹里）：
//   SHIYIN_INVITE=你的邀请码 node eval/run.mjs https://你的编曲台域名 标签   （评测口令自动从 .env 读取）
//   本地调试：node eval/run.mjs http://localhost:5178 本地
// 然后：node eval/report.mjs eval/runs/<文件>.json [eval/runs/基线.json]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// EVAL_TOKEN 没在命令行给出时，从本机 .env 读（deploy/git部署-初始化.sh 会写进去）
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
  if (!r.ok) { console.error('邀请码登录失败：', r.status); process.exit(1); }
  cookie = String(r.headers.get('set-cookie') || '').split(';')[0];
}
const health = await fetch(base + '/api/health').then(r => r.json()).catch(() => ({}));
console.log(`评测 ${base} · 模型 ${health.model || '?'} · ${prompts.length} 个意象`);
const out = { tag, base, model: health.model, at: new Date().toISOString(), runs: [] };
mkdirSync(new URL('./runs/', import.meta.url), { recursive: true });
const file = new URL(`./runs/${new Date().toISOString().slice(0, 10)}-${tag}.json`, import.meta.url);
for (const [i, mood] of prompts.entries()) {
  const t0 = Date.now();
  const r = await fetch(base + '/api/arrange', { method: 'POST', headers: H(), body: JSON.stringify({ mood }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.log(`✗ ${mood}：${j.error || r.status}（停止）`); out.stopped = { mood, code: r.status, error: j.error }; break; }
  let res = null;
  for (let k = 0; k < 150; k++) { await sleep(5000); res = await fetch(base + '/api/job?id=' + j.job, { headers: H() }).then(x => x.json()).catch(() => null); if (res && res.status !== 'running') break; }
  out.runs.push({ mood, ms: Date.now() - t0, status: res?.status, error: res?.error, plan: res?.plan });
  console.log(`${i + 1}/${prompts.length} ${res?.status === 'done' ? '✓' : '✗'} ${mood}（${Math.round((Date.now() - t0) / 1000)}s）`);
  writeFileSync(file, JSON.stringify(out, null, 1));
  await sleep(11000);   // 照顾 nginx 的每分钟 6 次限流
}
console.log('结果：' + file.pathname);
