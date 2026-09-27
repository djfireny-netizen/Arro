// Regression suite: node test/regress.mjs "$PWD"; uses the mock model without API credits.
// Mock model and real browser coverage for P0 changes and the existing main workflow.
// Requires Playwright and Chromium: npm i -D playwright && npx playwright install chromium
const { chromium } = await import('playwright').catch(() => import(process.env.PLAYWRIGHT_MJS || 'playwright'));
import { spawn } from 'node:child_process';
const REPO = process.argv[2] || new URL('..', import.meta.url).pathname;
const PORT = 5199;
const srv = spawn('node', ['server.mjs'], { cwd: REPO, env: { ...process.env, PROVIDER: 'mock', PORT: String(PORT), INVITE_CODES: 'TEST-CODE-1', HOST: '127.0.0.1' } });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
await new Promise(r => setTimeout(r, 1200));
const results = []; const ok = (name, cond, info = '') => { results.push([cond ? '✓' : '✗', name, info]); };
const browser = await chromium.launch({ executablePath: undefined }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
const B = `http://127.0.0.1:${PORT}`;
try {
  await page.goto(B);
  ok('Login page requests an invitation code', (await page.textContent('body')).includes('请输入邀请码'));
  await page.fill('#c', 'wrong'); await page.click('#b'); await page.waitForTimeout(400);
  ok('Invalid invitation code is rejected', (await page.textContent('#e')).includes('不对'));
  await page.fill('#c', 'test-code-1'); await page.click('#b'); await page.waitForLoadState('load'); await page.waitForTimeout(1500);
  const top = await page.textContent('.brand');
  ok('Header shows version 1.0 and AI generation label', top.includes('1.0') && top.includes('AI 生成') && !top.includes('原型'), top.trim());
  ok('Footer discloses AI-generated content', (await page.textContent('body')).includes('编曲内容由人工智能生成'));
  // Generate a mock full-song plan.
  await page.getByRole('textbox', { name: '描述一个画面或心情' }).fill('深夜一个人开车穿过城市');
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes('第二轮改了什么'), null, { timeout: 30000 });
  const body = await page.textContent('body');
  ok('Draft and self-revision status is shown', body.includes('初稿 + 自我修改'));
  const total = await page.textContent('#songTotal');
  const sec = (m => +m[1] * 60 + +m[2])(total.match(/(\d+):(\d\d)/));
  ok('Full song lasts at least 2:30', sec >= 150, total);
  const cap = await page.textContent('#progCap');
  const pcs = await page.$$eval('#prog .pc', x => x.length);
  ok('All eight chorus chords are shown', cap.includes('8 个和弦') && pcs === 8, `${cap} / ${pcs} 张`);
  const ex = await page.textContent('#explain');
  ok('Explanation covers all chords without stock wording', ex.includes('副歌 8 个和弦') && !/很爱用|城市感/.test(ex), ex.slice(0, 120));
  // The explanation retains the concept after brightness changes.
  // Inspect MIDI export archive contents.
  const z = await page.evaluate(() => { const {buildExport,state}=__shiyin; const f = buildExport(state.arr); const s = new TextDecoder('latin1').decode(f.data); return { name: f.name, hasNote: new TextDecoder().decode(f.data).includes('AI生成内容标识'), aigc: s.includes('"Label":"1"') , size: f.data.length }; });
  ok('MIDI export contains AIGC metadata and disclosure', z.aigc && z.hasNote, JSON.stringify(z));
  const mid = await page.evaluate(() => { const {midiFile,state,LAYERS}=__shiyin; const b = midiFile(state.arr, LAYERS, state.S, 'SYTEST'); const t = new TextDecoder().decode(b); return { mthd: t.startsWith('MThd'), id: t.includes('SYTEST'), txt: t.includes('本作品由人工智能生成') }; });
  ok('Individual MIDI has a valid header and disclosure', mid.mthd && mid.id && mid.txt, JSON.stringify(mid));
  // Render a one-second test buffer, append the marker, and inspect WAV structure.
  const wav = await page.evaluate(() => {
    const sr = 44100, b = new AudioBuffer({ numberOfChannels: 2, length: sr, sampleRate: sr });
    b.getChannelData(0).fill(0.2); b.getChannelData(1).fill(-0.2);
    const t = __shiyin.withAigcTone(b), bytes = __shiyin.wavBytes(t, 'SYWAV');
    const v = new DataView(bytes.buffer), str = (o, n) => String.fromCharCode(...bytes.slice(o, o + n));
    const riff = v.getUint32(4, true), dataLen = v.getUint32(40, true);
    // Find nonzero marker samples after the original audio.
    const tail = t.getChannelData(0).slice(sr + Math.round(0.8 * sr)), beeps = [];
    let on = false, start = 0; for (let i = 0; i < tail.length; i++) { const a = Math.abs(tail[i]) > 0.02; if (a && !on) { on = true; start = i; } if (!a && on && tail.slice(i, i + 200).every(x => Math.abs(x) <= 0.02)) { on = false; beeps.push(Math.round((i - start) / sr * 1000)); } }
    return { riffOk: riff === bytes.length - 8, fmt: str(8, 4) + str(12, 4), list: str(44 + dataLen, 4) + str(52 + dataLen, 4), json: new TextDecoder().decode(bytes.slice(44 + dataLen)).includes('"ProduceID":"SYWAV"'), extra: (t.length - sr) / sr, beeps };
  });
  ok('WAV has a valid structure and LIST/INFO AIGC metadata', wav.riffOk && wav.fmt === 'WAVEfmt ' && wav.list === 'LISTINFO' && wav.json, JSON.stringify({ ...wav, beeps: undefined }));
  const pattern = wav.beeps.map(ms => ms > 150 ? '长' : '短').join('');
  ok('End marker plays short-long-short-short', pattern === '短长短短', wav.beeps.join('ms ') + 'ms');
  // Legacy flow: switch to a four-bar loop and edit a chord to restore the engine explanation.
  await page.click('text=4 小节循环'); await page.waitForTimeout(300);
  await page.evaluate(() => { const a = __shiyin.state.arr; a.prog = a.prog.map(p => ({ ...p, deg: (p.deg + 1) % 7 })); __shiyin.render(['chords']); });
  const pcs2 = await page.$$eval('#prog .pc', x => x.length);
  ok('Manual chord edit shows only the current four chords', pcs2 === 4, String(pcs2));
  // The interface accurately explains section lengths other than 4/8 bars.
  const odd = await page.evaluate(async () => {
    const r = await fetch('/api/arrange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mood: '测试' }) }).then(x => x.json());
    let j; for (let i = 0; i < 20; i++) { await new Promise(s => setTimeout(s, 500)); j = await fetch('/api/job?id=' + r.job).then(x => x.json()); if (j.status !== 'running') break; }
    const p = j.plan; p.sections[p.sections.length - 1].bars = 2;
    const a = __shiyin.fromSongPlan(p, null, {}).arr; return a.review.filter(x => x.includes('网页核对'));
  });
  ok('Non-4/8 bar counts are disclosed accurately', odd.length === 1 && odd[0].includes('2 小节'), odd.join(''));
  ok('No browser errors', errs.length === 0, errs.join(' | ').slice(0, 300));
} catch (e) { ok('Test execution error', false, String(e.message).slice(0, 300)); }
await browser.close(); srv.kill();
for (const r of results) console.log(r.join(' '), );
const bad = results.filter(r => r[0] === '✗').length;
console.log(bad ? `\n${bad} checks failed` : `\nAll ${results.length} checks passed`);
if (bad) console.log(log.slice(-800));
process.exit(bad ? 1 : 0);
