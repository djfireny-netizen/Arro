// Regression suite: node test/regress.mjs "$PWD"; uses the mock model without API credits.
// Mock model and real browser coverage for P0 changes and the existing main workflow.
// Requires Playwright and Chromium: npm i -D playwright && npx playwright install chromium
const { chromium } = await import('playwright').catch(() => import(process.env.PLAYWRIGHT_MJS || 'playwright'));
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const REPO = process.argv[2] || new URL('..', import.meta.url).pathname;
const PORT = 5199;
const srv = spawn('node', ['server.mjs'], { cwd: REPO, env: { ...process.env, PROVIDER: 'mock', ARRANGE_PASSES: '1', PORT: String(PORT), INVITE_CODES: 'TEST-CODE-1', HOST: '127.0.0.1' } });
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
  const publicBrand = await page.evaluate(async () => {
    const paths = ['/brand/arro-wordmark-v4.svg', '/brand/arro-icon-v4.svg', '/brand/arro-icon-v4-32.png', '/brand/arro-icon-v4-180.png'];
    const results = await Promise.all(paths.map(async path => {
      const r = await fetch(path); const bytes = new Uint8Array(await r.arrayBuffer());
      return r.ok && (path.endsWith('.svg') ? r.headers.get('content-type') === 'image/svg+xml' && new TextDecoder().decode(bytes).includes('<svg') : r.headers.get('content-type') === 'image/png' && bytes[0] === 137 && bytes[1] === 80);
    }));
    const protectedPage = await fetch('/brand/.env');
    return results.every(Boolean) && protectedPage.status === 401;
  });
  ok('Public brand assets load before login while unlisted paths stay protected', publicBrand);
  await page.waitForFunction(() => document.querySelector('h1 img')?.naturalWidth > 0);
  ok('Login uses the ARRO wordmark', await page.getAttribute('h1 img', 'alt') === 'ARRO' && (await page.title()).startsWith('ARRO'));

  await page.fill('#c', 'wrong'); await page.click('#b'); await page.waitForTimeout(400);
  ok('Invalid invitation code is rejected', (await page.textContent('#e')).includes('不对'));
  await page.fill('#c', 'test-code-1'); await page.click('#b'); await page.waitForLoadState('load'); await page.waitForTimeout(1500);
  const top = await page.textContent('.brand');
  await page.waitForFunction(() => document.querySelector('.brand img')?.naturalWidth > 0);
  ok('Studio uses the ARRO wordmark', await page.getAttribute('.brand img', 'alt') === 'ARRO');
  ok('Header shows version 1.0 and AI generation label', top.includes('1.0') && top.includes('AI 生成') && !top.includes('原型'), top.trim());
  ok('Footer discloses AI-generated content', (await page.textContent('body')).includes('编曲内容由人工智能生成'));
  const credits = await page.evaluate(() => fetch('/credits').then(r => r.text()));
  ok('The Chinese interface serves Chinese sample credits', credits.includes('采样本身的出处') && credits.includes('CC BY 3.0'));
  // Generate a mock full-song plan.
  await page.getByRole('textbox', { name: '描述一个画面或心情' }).fill('深夜一个人开车穿过城市');
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.waitForFunction(() => window.__shiyin?.state.arr?.aiPlan && !window.__shiyin.state.busy, null, { timeout: 30000 });
  ok('Generation defaults to one musical pass', await page.evaluate(() => __shiyin.state.arr.passes === 1 && __shiyin.state.arr.aiPlan.validation.review === 'skipped'));
  await page.fill('#refineDirection', '保留中间的停顿');
  await page.click('#refineBtn');
  await page.waitForFunction(() => window.__shiyin.state.arr.passes === 2 && !window.__shiyin.state.busy, null, { timeout: 30000 });
  ok('Optional refinement completes and preserves prior versions', (await page.textContent('#concept')).includes('这次打磨的修改') && (await page.textContent('#verList')).includes('打磨前保留'));
  const beforeFailure = await page.evaluate(() => JSON.stringify(__shiyin.state.arr));
  await page.route('**/api/refine', route => route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'Test failure'})}));
  await page.click('#refineBtn');
  await page.waitForFunction(() => !window.__shiyin.state.busy);
  ok('A failed refinement preserves the current arrangement', beforeFailure === await page.evaluate(() => JSON.stringify(__shiyin.state.arr)));
  await page.unroute('**/api/refine');
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
  ok('Non-4/8 bar counts are disclosed accurately', odd.filter(x => x.includes('2 小节')).length === 1, odd.join(''));
  // Verify explicit bass degrees through event generation and the exported MIDI note stream.
  const inversion = await page.evaluate(() => {
    const api=__shiyin, a=structuredClone(api.state.arr);
    a.root=0; a.mode='major'; a.styleId='synthwave'; a.planned=true;
    a.prog=['5/7','1/3','4/#4','1'].map(t=>api.parseChordTok(t,a.mode));
    a.bass={...a.bass,pat:[[0,16,'R']],approach:false};
    const d=api.derive(a);
    const midi=api.midiFile(a,['bass'],null,'INVERSION-TEST');
    let found=false;
    for(let i=0;i<midi.length-2;i++) if(midi[i]===0x90&&midi[i+1]===35&&midi[i+2]>0) found=true;
    const minor=api.parseChordTok('1m7/b3','minor');
    return {bass:d.roll.bass.filter(n=>n.step%16===0).map(n=>n.midi%12),name:d.infos[0].name,displayName:api.chordInfo(a,0).name,found,minorBass:minor.bassRel};
  });
  ok('Slash chords preserve specified bass pitches and chord names', JSON.stringify(inversion.bass)==='[11,4,6,0]' && inversion.name==='G/B' && inversion.displayName==='G/B' && inversion.minorBass===3, JSON.stringify(inversion));
  ok('MIDI export preserves the explicit B bass for G/B', inversion.found);
  const shortPlan = await page.evaluate(() => {
    const api=__shiyin;
    const p={title:'短方案',style:'synthwave',key:'C',mode:'major',bpm:120,
      harmony:{A:['1','4','5','1']},grooves:{A:{drums:{},bass:'0:16:R',chords:'0:16'}},melodies:{},
      sections:[{type:'verse',bars:4,harmony:'A',groove:'A',melody:'none',play:['bass'],moves:[]},{type:'chorus',bars:4,harmony:'A',groove:'A',melody:'none',play:['bass'],moves:[]}]};
    const parsed=api.fromSongPlan(p,null,{});
    return {count:parsed.song.length,review:parsed.arr.review};
  });
  ok('Short plans retain the producer form and disclose their duration', shortPlan.count===2 && shortPlan.review.some(x=>x.includes('0:16')&&x.includes('保留制作人原有段落')), JSON.stringify(shortPlan));
  const fidelity = await page.evaluate(() => {
    const api=__shiyin;
    const make=(melody='',bass='',chords='',energy=0)=>({title:'Contract fixture',style:'jazz',key:'C',mode:'minor',bpm:120,
      harmony:{A:['1m7/b3','b6maj7','5','1m']},
      grooves:{A:{drums:{kick:'x...............',snare:'................',clap:'................',hat:'xxxxxxxxxxxxxxxx',openhat:'................'},bass,chords}},
      melodies:{A:melody},sections:['verse','chorus'].map(type=>({type,bars:8,harmony:'A',groove:'A',melody:'A',energy,play:['drums','bass','chords','melody'],moves:[]}))});
    const run=p=>{const x=api.fromSongPlan(p,null,{});return {...x,d:api.deriveSong(x.arr,x.song,x.extra)};};
    const empty=run(make());
    const sparse=run(make('0:8:#4 4:2:2'));
    const overlap=run(make('0:8:1 0:4:3 4:8:5'));
    const groove=run(make('', '0:16:R', '0:8 4:8', 1));
    const legacy=api.fromSongPlan(make(),null,{}, {executionVersion:1});
    const before=JSON.stringify(sparse.extra);
    const again=api.deriveSong(sparse.arr,sparse.song,sparse.extra);
    return {
      version:empty.arr.executionVersion,energy:empty.song[0].plan.energy,
      silence:['bass','chords','melody','fx'].every(L=>empty.d.ev[L].every(x=>!x.length)),
      sparse:sparse.d.roll.melody.map(n=>[n.step,n.len,n.midi%12]),
      overlap:overlap.d.roll.melody.slice(0,3).map(n=>[n.step,n.len,n.midi%12]),
      drums:empty.d.roll.drums.filter(n=>n.lane===3).length,
      bass:groove.d.roll.bass.map(n=>[n.step,n.len]),
      bassPc:groove.d.roll.bass[0].midi%12,
      chordRoot:api.chordInfo(groove.arr,1).rootPc,
      chordHits:groove.d.ev.chords.slice(0,16).filter(x=>x.length).length,
      stable:JSON.stringify(again.ev)===JSON.stringify(sparse.d.ev)&&before===JSON.stringify(sparse.extra),
      legacy:legacy.arr.executionVersion===1&&legacy.extra.grooves.A.bass.length===1&&legacy.song[0].plan.energy===.6
    };
  });
  ok('New plans carry an execution version and preserve zero energy', fidelity.version===2&&fidelity.energy===0, JSON.stringify(fidelity));
  ok('Explicit rests stay silent, including unrequested transitions', fidelity.silence);
  ok('Sparse chromatic melodies retain notes and eight-bar rests', JSON.stringify(fidelity.sparse)==='[[0,8,6],[4,2,2],[128,8,6],[132,2,2]]', JSON.stringify(fidelity.sparse));
  ok('Simultaneous and overlapping melody events retain their lengths', JSON.stringify(fidelity.overlap)==='[[0,8,0],[0,4,3],[4,8,7]]', JSON.stringify(fidelity.overlap));
  ok('Energy does not rewrite explicit drum and bass patterns', fidelity.drums===256&&fidelity.bass.length===16&&fidelity.bass.every(([step,len])=>step%16===0&&len===16));
  ok('Minor accidentals remain literal in chords and slash bass', fidelity.bassPc===2&&fidelity.chordRoot===7, JSON.stringify({bass:fidelity.bassPc,root:fidelity.chordRoot}));
  ok('Explicit overlapping chord hits remain present', fidelity.chordHits===2);
  ok('Repeated derivation preserves events and shared source groups', fidelity.stable);
  ok('Version-one compilation remains available for legacy replay', fidelity.legacy);
  const projectBridge = await page.evaluate(async () => {
    const api=__shiyin, state=api.state;
    api.render();
    const original=api.deriveSong(state.arr,state.song,state.extra);
    const project=structuredClone(state.project);
    const restored=api.projectPerformance(JSON.parse(JSON.stringify(project)));
    const events=JSON.stringify(restored.ev)===JSON.stringify(original.ev);
    const live=JSON.stringify(restored.ev)===JSON.stringify(state.S.ev);
    const a=api.midiFile(state.arr,api.LAYERS,original,'PROJECT-TEST');
    const b=api.midiFile(state.arr,api.LAYERS,restored,'PROJECT-TEST');
    const midi=a.length===b.length&&a.every((value,i)=>value===b[i]);
    api.render();
    const stable=JSON.stringify(project)===JSON.stringify(state.project);
    const module=await fetch('/core/project.mjs');
    const unknown=await fetch('/core/unknown.mjs');
    return {events,live,midi,stable,module:module.ok&&module.headers.get('content-type').includes('javascript'),unknown:unknown.status===404};
  });
  ok('ProjectV2 round-trips live song events without altering MIDI export', projectBridge.events&&projectBridge.live&&projectBridge.midi, JSON.stringify(projectBridge));
  ok('Redrawing keeps project identities and revision stable', projectBridge.stable);
  ok('Only the explicitly allowed project module is served', projectBridge.module&&projectBridge.unknown);
  if (process.env.ARRO_REPLAY_PLANS) {
    const archive=JSON.parse(await readFile(process.env.ARRO_REPLAY_PLANS,'utf8'));
    const plans=archive.runs.filter(run=>run.plan).map(run=>({id:run.id,plan:run.plan}));
    const replay=await page.evaluate(plans=>{
      const api=__shiyin, failures=[];let passed=0;
      for(const {id,plan} of plans) for(const executionVersion of [1,2]) {
        try {
          const x=api.fromSongPlan(plan,null,{}, {executionVersion});
          const performance=api.deriveSong(x.arr,x.song,x.extra);
          const project=api.captureProject({arrangement:x.arr,sections:x.song,performance});
          const restored=api.projectPerformance(JSON.parse(JSON.stringify(project)));
          if(JSON.stringify(restored.ev)!==JSON.stringify(performance.ev)) throw new Error('Event mismatch');
          passed++;
        } catch(e) { failures.push({id,executionVersion,error:e.message}); }
      }
      return {passed,failures};
    },plans);
    ok('Archived plans survive both execution versions and project round-trip', plans.length>0&&replay.passed===plans.length*2&&!replay.failures.length, JSON.stringify(replay));
  }
  ok('No browser errors', errs.length === 0, errs.join(' | ').slice(0, 300));
} catch (e) { ok('Test execution error', false, String(e.message).slice(0, 300)); }
await browser.close(); srv.kill();
for (const r of results) console.log(r.join(' '), );
const bad = results.filter(r => r[0] === '✗').length;
console.log(bad ? `\n${bad} checks failed` : `\nAll ${results.length} checks passed`);
if (bad) console.log(log.slice(-800));
process.exit(bad ? 1 : 0);
