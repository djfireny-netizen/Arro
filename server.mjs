import { createJobJournal } from './storage/jobs.mjs';
import { revisionContext } from './core/revision.mjs';
// Arro local HTTP service.
// Serve the interface and call model APIs while keeping credentials on the server.
// Run with node server.mjs; requires Node.js 18 or later, with no runtime dependencies.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual, randomUUID, randomBytes } from 'node:crypto';
import { planIssues } from './song-contract.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));

// Load .env.
const envPath = path.join(DIR, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 5178);
const HOST = process.env.HOST || '0.0.0.0';

// ===== Public deployment protections =====
// Daily generation limits per IP and site-wide, plus a concurrency limit.
const PER_IP = Number(process.env.RATE_LIMIT_PER_IP || 0);        // 0 means unlimited.
const PER_DAY = Number(process.env.RATE_LIMIT_PER_DAY || 0);      // 0 means unlimited.
const MAX_CONC = Number(process.env.MAX_CONCURRENT || 4);
const ALLOWED = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const jobs=await createJobJournal(process.env.ARRO_JOB_DIR||path.join(DIR,'.arro-data'),{maxRunning:MAX_CONC});
const hash=text=>createHash('sha256').update(text).digest('hex');
function clientIP(req) {
  if (TRUST_PROXY) {
    const x = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (x) return x;
  }
  return req.socket.remoteAddress || '?';
}
// A matching X-Eval-Token bypasses the per-IP daily quota; the site-wide quota remains active.
const EVAL_TOKEN = process.env.EVAL_TOKEN || '';
const isEval = req => EVAL_TOKEN.length >= 16 && String(req.headers['x-eval-token'] || '') === EVAL_TOKEN;
function quota(ip, evalRun) {
  const used=jobs.usage(hash(ip));
  if(PER_DAY&&used.site>=PER_DAY)return '今天全站的大模型额度用完了。当前作品已保留，明天可以再试。';
  if(PER_IP&&!evalRun&&used.ip>=PER_IP)return `今天已使用 ${PER_IP} 次生成。当前作品已保留，也可以主动选择本地编曲。`;
  return null;
}
function originOK(req) {
  if (!ALLOWED.length) return true;
  const o = String(req.headers.origin || req.headers.referer || '');
  return ALLOWED.some(a => o === a || o.startsWith(a + '/'));
}

// ===== Set comma-separated INVITE_CODES in .env to enable invitation login =====
// Login lasts 90 days; removing a code invalidates sessions created with that code.
const INVITE = (process.env.INVITE_CODES || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const tok = c => createHash('sha256').update('shiyin-invite:' + c).digest('hex').slice(0, 40);
const TOKENS = INVITE.map(tok);
const fails = new Map();
setInterval(() => fails.clear(), 10 * 60 * 1000).unref();
function cookie(req, name) {
  const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : '';
}
function authed(req) {
  if (!INVITE.length) return true;
  const t = cookie(req, 'sy_inv');
  return t.length === 40 && TOKENS.some(x => timingSafeEqual(Buffer.from(x), Buffer.from(t)));
}
function jobOwner(req,res){
  let session=cookie(req,'arro_session');
  if(!/^[a-f0-9]{64}$/.test(session)){
    session=randomBytes(32).toString('hex');
    res.setHeader('Set-Cookie',`arro_session=${session}; Path=/; Max-Age=7776000; HttpOnly; SameSite=Lax${TRUST_PROXY||req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);
  }
  return hash('arro-job-owner:'+cookie(req,'sy_inv')+':'+session);
}
function loginPage() {
  const icp = process.env.ICP_NUMBER || '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ARRO · 编曲台</title>
<link rel="icon" type="image/png" sizes="32x32" href="/brand/arro-icon-v4-32.png">
<link rel="icon" type="image/svg+xml" href="/brand/arro-icon-v4.svg">
<link rel="apple-touch-icon" sizes="180x180" href="/brand/arro-icon-v4-180.png">
<style>
:root{--bg:#e4e5e0;--card:#f3f3ef;--ink:#18191b;--mute:#6b6d70;--line:#c9cac4;--acc:#18191b;--accInk:#f3f3ef;--err:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#141516;--card:#1d1e20;--ink:#ecece8;--mute:#9a9c9f;--line:#34363a;--acc:#ecece8;--accInk:#141516;--err:#ff8a80}}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px}
.card{width:100%;max-width:360px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px 24px}
h1{font-size:22px;margin:0 0 18px;letter-spacing:.02em}h1 img{display:block;width:140px;height:auto}p{margin:0 0 20px;color:var(--mute);font-size:14px}
input{width:100%;font:inherit;font-size:17px;letter-spacing:.08em;text-transform:uppercase;padding:11px 12px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--ink);outline:none}
input:focus{border-color:var(--ink)}
button{width:100%;margin-top:12px;font:inherit;font-weight:600;padding:11px;border:0;border-radius:9px;background:var(--acc);color:var(--accInk);cursor:pointer}
button:disabled{opacity:.5}
.err{color:var(--err);font-size:13px;min-height:20px;margin-top:10px}
footer{margin-top:24px;font-size:12px;color:var(--mute)}footer a{color:inherit}
</style></head><body>
<form class="card" id="f"><h1><img src="/brand/arro-wordmark-v4.svg" alt="ARRO" width="140" height="44"></h1><p>目前是邀请制，请输入邀请码</p>
<input id="c" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="邀请码" autofocus>
<button id="b">进入</button><div class="err" id="e"></div></form>
${icp ? `<footer><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">${icp.replace(/</g, '&lt;')}</a></footer>` : ''}
<script>
f.onsubmit=async ev=>{ev.preventDefault();e.textContent='';b.disabled=true;
try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:c.value})});
const j=await r.json().catch(()=>({}));if(r.ok){location.replace('/');return}e.textContent=j.error||'进不去，请稍后再试'}
catch(_){e.textContent='网络好像断了，请再试一次'}b.disabled=false;c.select()};
</script></body></html>`;
}

// Reload ai.mjs after changes without restarting the service.
import { statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
let aiMod = null, aiStamp = 0;
async function AI() {
  const f = path.join(DIR, 'ai.mjs'), m = statSync(f).mtimeMs;
  if (!aiMod || m !== aiStamp) { aiMod = await import(pathToFileURL(f).href + '?v=' + m); aiStamp = m; }
  return aiMod;
}

function send(res, code, data, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    // Only these public brand assets are available before invitation login.
    const brandFiles = {
      '/brand/arro-wordmark-v4.svg': 'image/svg+xml',
      '/brand/arro-icon-v4.svg': 'image/svg+xml',
      '/brand/arro-icon-v4-32.png': 'image/png',
      '/brand/arro-icon-v4-180.png': 'image/png',
    };
    if ((req.method === 'GET' || req.method === 'HEAD') && Object.hasOwn(brandFiles, url.pathname)) {
      const bytes = await readFile(path.join(DIR, 'site', url.pathname.slice(1)));
      res.writeHead(200, { 'Content-Type': brandFiles[url.pathname], 'Content-Length': bytes.length,
        'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    }
    const { P, KEY, PROVIDER, arrange, refine, reviseClip, withTelemetry } = await AI();
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const ip = clientIP(req), n = fails.get(ip) || 0;
      if (n >= 10) return send(res, 429, { error: '试错太多次了，请 10 分钟后再来' });
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 500) break; }
      let code = '';
      try { code = String(JSON.parse(raw || '{}').code || '').trim().toUpperCase().slice(0, 64); } catch {}
      if (!INVITE.length || !INVITE.includes(code)) { fails.set(ip, n + 1); return send(res, 401, { error: '邀请码不对' }); }
      const secure = TRUST_PROXY || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `sy_inv=${tok(code)}; Path=/; Max-Age=${90 * 86400}; HttpOnly; SameSite=Lax${secure}`);
      console.log(`[Login] ${code.slice(0, 3)}*** from ${ip}`);
      return send(res, 200, { ok: true });
    }
    if (!authed(req) && url.pathname !== '/credits' && url.pathname !== '/api/health') {
      if (url.pathname.startsWith('/api/')) return send(res, 401, { error: '请先输入邀请码（刷新页面）' });
      return send(res, url.pathname === '/' || url.pathname === '/index.html' ? 200 : 401, loginPage(), 'text/html; charset=utf-8');
    }
    const owner=jobOwner(req,res);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const page = await readFile(path.join(DIR, 'index.html'), 'utf8');
      return send(res, 200,
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + page + '</body></html>',
        'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && ['/core/project.mjs', '/core/commands.mjs', '/core/revision.mjs', '/core/document.mjs', '/storage/projects.mjs'].includes(url.pathname)) {
      return send(res, 200, await readFile(path.join(DIR, url.pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname.startsWith('/samples/')) {
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.join(DIR, rel);
      if (!file.startsWith(path.join(DIR, 'samples')) || !/\.(mp3|md)$/.test(file) || !existsSync(file)) return send(res, 404, { error: 'not found' });
      res.writeHead(200, { 'Content-Type': file.endsWith('.mp3') ? 'audio/mpeg' : 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return res.end(await readFile(file));
    }
    if (req.method === 'GET' && url.pathname === '/credits') {
      const md = await readFile(path.join(DIR, 'samples', 'CREDITS.zh-CN.md'), 'utf8');
      const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      return send(res, 200, '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>采样来源与授权</title><style>body{font:15px/1.7 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#18191b;background:#e4e5e0}pre{white-space:pre-wrap}</style></head><body><pre>' + esc + '</pre></body></html>', 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { service: 'shiyin', version: '1.1.0', ok: Boolean(KEY && P.model), provider: PROVIDER, label: P.label, model: P.model || '(未设置)', keyEnv: P.keyEnv, icp: process.env.ICP_NUMBER || '', police: process.env.POLICE_NUMBER || '' });
    }
    if (req.method === 'POST' && ['/api/arrange', '/api/refine', '/api/revise-clip'].includes(url.pathname)) {
      if (!KEY) return send(res, 400, { error: `还没有设置 ${P.keyEnv}` });
      if (!P.model) return send(res, 400, { error: '还没有设置模型名称' });
      if (!originOK(req)) return send(res, 403, { error: '来源不被允许' });
      const ip=clientIP(req);
      const refining = url.pathname === '/api/refine', scoped = url.pathname === '/api/revise-clip';
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > (scoped ? 12582912 : refining ? 131072 : 4000)) return send(res, 413, { error: '请求内容过长' }); }
      let body;
      try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: '请求格式错误' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: '请求格式错误' });
      if (refining && planIssues(body.plan).length) return send(res, 400, { error: '原方案未通过数据检查' });
      if(scoped) {
        try { revisionContext(body.project,body.scope); } catch { return send(res,400,{error:'工程或修改范围无效，请重新选择片段'}); }
        if(typeof body.direction!=='string'||!body.direction.trim()||body.direction.length>500) return send(res,400,{error:'请用 500 字以内描述修改方向'});
      }
      const mood = String(body.mood || '').slice(0, 120).trim();
      const style = /^[a-z]{2,16}$/.test(String(body.style || '')) ? String(body.style) : null;
      if (!mood && !scoped) return send(res, 400, { error: '请先描述一个画面' });
      const requestId=body.requestId??randomUUID();
      if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId))return send(res,400,{error:'请求编号无效'});
      const {requestId:_,...payload}=body;
      const fingerprint=hash(JSON.stringify([url.pathname,payload]));
      const existing=jobs.find(owner,requestId,fingerprint);
      if(existing)return send(res,200,{job:existing.id,reused:true});
      const {job,created}=await jobs.prepare({owner,requestId,hash:fingerprint,type:url.pathname,projectId:scoped?body.project.projectId:null,ip:hash(ip)},()=>quota(ip,isEval(req)));
      if(!created)return send(res,200,{job:job.id,reused:true});
      const id=job.id;
      const onStage=stage=>{jobs.update(id,{stage}).catch(()=>console.error('Unable to persist job stage'));};
      const calls=[];
      const task=withTelemetry(call=>{calls.push(call);jobs.update(id,{calls:[...calls]}).catch(()=>console.error('Unable to persist usage'));},()=>scoped?reviseClip(body.project,{trackId:body.scope.trackId,clipId:body.scope.clipId},body.direction):refining?refine(body.plan,mood,String(body.direction||'').slice(0,500),onStage):arrange(mood,style,onStage));
      task.then(plan=>jobs.update(id,{status:'done',plan,ms:Date.now()-job.t0}))
        .catch(error=>jobs.update(id,{status:'error',error:String(error?.message||error).slice(0,500),ms:Date.now()-job.t0}).catch(()=>console.error('Unable to persist job completion')));
      return send(res,200,{job:id});
    }
    if (req.method === 'GET' && url.pathname === '/api/job') {
      const job = url.searchParams.has('requestId')?jobs.find(owner,url.searchParams.get('requestId')):jobs.get(owner,url.searchParams.get('id') || '');
      if (!job) return send(res, 404, { error: '任务不存在或已过期' });
      return send(res, 200, { status: job.status, stage: job.stage, plan: job.plan, ms: job.ms || (Date.now() - job.t0), error: job.error, model: P.model });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    send(res, e.status||502, { error: String(e.message || e) });
  }
});

server.requestTimeout = 330000;
server.listen(PORT, HOST, async () => {
  const { P, KEY } = await AI();
  console.log(`\n  Arro is running at http://localhost:${PORT}`);
  if (INVITE.length) console.log(`  Invitation codes enabled (${INVITE.length})`);
  console.log(`  Model: ${P.label} (${P.model || 'model not configured'})${KEY ? '' : ` — ${P.keyEnv} is not configured; only the local engine is available`}\n`);
});
