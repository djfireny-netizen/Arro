// Regression suite: node test/regress.mjs "$PWD"; uses the mock model without API credits.
// Mock model and real browser coverage for P0 changes and the existing main workflow.
// Requires Playwright and Chromium: npm i -D playwright && npx playwright install chromium
const { chromium } = await import('playwright').catch(() => import(process.env.PLAYWRIGHT_MJS || 'playwright'));
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
const jobDir=await mkdtemp(tmpdir()+'/arro-regress-jobs-');
const REPO = process.argv[2] || new URL('..', import.meta.url).pathname;
const PORT = 5199;
const srv = process.env.ARRO_TEST_BASE?null:spawn('node', ['server.mjs'], { cwd: REPO, env: { ...process.env, ARRO_JOB_DIR:jobDir, PROVIDER: 'mock', ARRANGE_PASSES: '1', PORT: String(PORT), INVITE_CODES: 'TEST-CODE-1', HOST: '127.0.0.1' } });
let log = ''; if(srv){srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
await new Promise(r => setTimeout(r, 1200));}
const results = []; const ok = (name, cond, info = '') => { results.push([cond ? '✓' : '✗', name, info]); };
const browser = await chromium.launch({ executablePath: undefined }).catch(() => chromium.launch());
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
const B = (process.env.ARRO_TEST_BASE||`http://127.0.0.1:${PORT}`).replace(/\/$/,'');
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
  ok('Header shows version 1.1 and AI generation label', top.includes('1.1') && top.includes('AI 生成') && !top.includes('原型'), top.trim());
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
  // Durable project commands, import/export, refresh, and failed-save recovery.
  const beforeCommand=await page.evaluate(()=>JSON.stringify(__shiyin.state.project));
  await page.click('#bpmUp');
  const afterCommand=await page.evaluate(()=>JSON.stringify(__shiyin.state.project));
  ok('Tempo commands preserve events and increment the project revision', JSON.parse(afterCommand).tempo===JSON.parse(beforeCommand).tempo+2&&JSON.parse(afterCommand).revision===JSON.parse(beforeCommand).revision+1&&JSON.stringify(JSON.parse(afterCommand).tracks)===JSON.stringify(JSON.parse(beforeCommand).tracks));
  await page.click('#undoBtn');
  ok('Undo restores the exact materialized project', beforeCommand===await page.evaluate(()=>JSON.stringify(__shiyin.state.project)));
  await page.click('#redoBtn');
  ok('Redo restores the exact command result', afterCommand===await page.evaluate(()=>JSON.stringify(__shiyin.state.project)));
  const beforeMix=await page.evaluate(()=>JSON.stringify(__shiyin.projectDocument()));
  await page.click('#mute-bass');
  await page.evaluate(()=>{const el=document.querySelector('#vol-melody');for(const value of [.41,.37]){el.value=value;el.dispatchEvent(new Event('input'));}el.dispatchEvent(new Event('change'));});
  ok('Mixer commands update the project and controls', await page.evaluate(()=>__shiyin.state.project.tracks.find(t=>t.layer==='bass').mixer.muted&&__shiyin.state.project.tracks.find(t=>t.layer==='melody').mixer.volume===.37));
  await page.click('#undoBtn');await page.click('#undoBtn');
  ok('A slider gesture is one undo step and mute is independently undoable', beforeMix===await page.evaluate(()=>JSON.stringify(__shiyin.projectDocument())));
  await page.click('#redoBtn');await page.click('#redoBtn');
  await page.evaluate(()=>__shiyin.flushProjectSave());
  await page.waitForFunction(()=>document.querySelector('#projectSaveState').dataset.state==='saved');
  const savedDocument=await page.evaluate(()=>JSON.stringify(__shiyin.projectDocument()));
  await page.reload();await page.waitForFunction(()=>window.__shiyin?.state.project);
  ok('Refresh restores project IDs, events, mixer, and editor settings', savedDocument===await page.evaluate(()=>JSON.stringify(__shiyin.projectDocument())));
  const fileDownload=page.waitForEvent('download');await page.click('#downloadProject');
  const file=await fileDownload;
  const downloaded=await readFile(await file.path(),'utf8');
  ok('Download creates a complete .arro.json document', file.suggestedFilename().endsWith('.arro.json')&&JSON.stringify(JSON.parse(downloaded))===savedDocument);
  await page.click('#bpmUp');
  await page.setInputFiles('#projectFile',{name:'saved.arro.json',mimeType:'application/json',buffer:Buffer.from(downloaded)});
  await page.waitForFunction(tempo=>__shiyin.state.arr.bpm===tempo,JSON.parse(downloaded).project.tempo);
  ok('Opening an exported project restores its current performance', savedDocument===await page.evaluate(()=>JSON.stringify(__shiyin.projectDocument())));
  await page.click('#undoBtn');
  ok('Opening a project is undoable', await page.evaluate(tempo=>__shiyin.state.arr.bpm===tempo+2,JSON.parse(downloaded).project.tempo));
  await page.click('#redoBtn');
  const malformed=await page.evaluate(async()=>{
    const before=JSON.stringify(__shiyin.projectDocument());let rejected=0;
    const bad=__shiyin.projectDocument();bad.project.sections[0].durationTicks=999999999;
    for(const text of ['{broken',JSON.stringify({...bad,version:99}),JSON.stringify(bad)]){
      try{await __shiyin.importProjectText(text);}catch{rejected++;}
    }
    return rejected===3&&before===JSON.stringify(__shiyin.projectDocument());
  });
  ok('Malformed and unsupported files preserve the open project', malformed);
  await page.evaluate(()=>__shiyin.flushProjectSave());
  await page.waitForFunction(()=>document.querySelector('#projectSaveState').dataset.state==='saved');
  // A second tab reads the saved token; it does not save merely by opening.
  const other=await page.context().newPage();await other.goto(B);await other.waitForFunction(()=>window.__shiyin?.state.project);
  await page.click('#bpmUp');await page.evaluate(()=>__shiyin.flushProjectSave());
  await page.waitForFunction(()=>document.querySelector('#projectSaveState').dataset.state==='saved');
  const durableTempo=await page.evaluate(()=>__shiyin.state.project.tempo);
  await other.click('#bpmDown');await other.evaluate(()=>__shiyin.flushProjectSave());
  await other.waitForFunction(()=>document.querySelector('#projectSaveState').dataset.state==='error');
  ok('A stale tab cannot overwrite the newer saved project', (await other.textContent('#projectSaveState')).includes('另一个标签页')&&await page.evaluate(async tempo=>(await __shiyin.projectStore.load()).document.project.tempo===tempo,durableTempo));
  await other.close({runBeforeUnload:false});
  await page.evaluate(()=>{window.originalProjectSave=__shiyin.projectStore.save;__shiyin.projectStore.save=async()=>{throw new Error('Test quota failure');};});
  await page.click('#bpmUp');await page.evaluate(()=>__shiyin.flushProjectSave());
  await page.waitForFunction(()=>document.querySelector('#projectSaveState').dataset.state==='error');
  ok('Save failures remain visible and preserve in-memory edits', await page.isVisible('#retrySave')&&await page.evaluate(tempo=>__shiyin.state.project.tempo===tempo+2,durableTempo));
  await page.evaluate(()=>{__shiyin.projectStore.save=window.originalProjectSave;});
  await page.click('#retrySave');await page.waitForFunction(()=>document.querySelector('#projectSaveState').dataset.state==='saved');
  ok('Retry commits the latest unsaved edit', await page.evaluate(async()=>(await __shiyin.projectStore.load()).document.project.tempo===__shiyin.state.project.tempo));
  // Edit a real materialized melody through the public controls.
  const noteTarget=await page.evaluate(()=>{
    const t=__shiyin.state.project.tracks.find(t=>t.layer==='melody'),c=t.clips.find(c=>c.events.length);
    return {section:__shiyin.state.project.sections.findIndex(s=>s.id===c.sectionId),clipId:c.id,eventId:c.events[0].id};
  });
  await page.selectOption('#noteSection',String(noteTarget.section));await page.selectOption('#noteTrack','melody');
  const beforeNote=await page.evaluate(()=>({project:structuredClone(__shiyin.state.project),extra:JSON.stringify(__shiyin.state.extra)}));
  await page.selectOption('#notePitch','126');await page.fill('#noteStart','3');await page.fill('#noteLength','4');await page.fill('#noteVelocity','51');await page.click('#noteApply');
  const noteResult=await page.evaluate(({clipId,eventId,before})=>{
    const api=__shiyin,p=api.state.project,c=p.tracks.find(t=>t.layer==='melody').clips.find(c=>c.id===clipId),e=c.events.find(e=>e.id===eventId);
    const untouched=p.tracks.every(t=>t.clips.every(c=>c.id===clipId||JSON.stringify(c)===JSON.stringify(before.project.tracks.find(x=>x.id===t.id).clips.find(x=>x.id===c.id))));
    const midi=api.midiFile(api.state.arr,['melody'],api.state.S,'NOTE-EDIT');
    const view=new DataView(midi.buffer,midi.byteOffset,midi.byteLength);let off=14,found=false,timing=false;
    while(off<midi.length){const end=off+8+view.getUint32(off+4);let i=off+8,tick=0,on=null;
      const vlq=()=>{let n=0,b;do{b=midi[i++];n=(n<<7)|(b&127);}while(b&128);return n;};
      while(i<end){tick+=vlq();const status=midi[i++];if(status===255){i++;const n=vlq();i+=n;continue;}
        const kind=status>>4,note=midi[i++];if(kind===12||kind===13)continue;const vel=midi[i++];
        if(kind===9&&note===126&&vel===51){found=true;on=tick;}
        if(kind===8&&note===126&&on!==null){timing=tick-on===480;}
      }off=end;
    }
    return {event:e,untouched,source:before.extra===JSON.stringify(api.state.extra),live:api.state.S.ev.melody[(c.startTick+e.startTick)/120].some(row=>row[0]===126&&row[2]===.51),found,timing,mode:api.state.mode};
  },{...noteTarget,before:beforeNote});
  ok('Note fields change pitch, position, duration, and velocity only in the selected clip',noteResult.event.pitch===126&&noteResult.event.startTick===240&&noteResult.event.durationTicks===480&&noteResult.event.velocity===.51&&noteResult.untouched&&noteResult.source);
  ok('Edited notes reach song playback and MIDI with exact user duration and velocity',noteResult.live&&noteResult.found&&noteResult.timing&&noteResult.mode==='song',JSON.stringify(noteResult));
  ok('Legacy AI refinement is gated while it cannot read manual note edits',await page.isDisabled('#refineBtn')&&(await page.textContent('#concept')).includes('手动音符修改'));
  const editedNoteProject=await page.evaluate(()=>JSON.stringify(__shiyin.state.project));
  await page.click('#undoBtn');ok('Note undo restores the original project exactly',JSON.stringify(beforeNote.project)===await page.evaluate(()=>JSON.stringify(__shiyin.state.project)));
  await page.click('#redoBtn');ok('Note redo restores edited events and identities',editedNoteProject===await page.evaluate(()=>JSON.stringify(__shiyin.state.project)));
  const noteLocator=page.locator('.note-cell').filter({hasText:'F#9'}).first();
  await noteLocator.scrollIntoViewIfNeeded();let box=await noteLocator.boundingBox();
  await page.mouse.move(box.x+5,box.y+7);await page.mouse.down();await page.mouse.move(box.x+29,box.y-11,{steps:4});await page.mouse.up();
  ok('Dragging a note moves it on the timing and pitch grid',await page.evaluate(({clipId,eventId})=>{const e=__shiyin.state.project.tracks[3].clips.find(c=>c.id===clipId).events.find(e=>e.id===eventId);return e.startTick===480&&e.pitch===127;},noteTarget));
  const resized=page.locator('.note-cell').filter({hasText:'G9'}).first();await resized.scrollIntoViewIfNeeded();box=await resized.boundingBox();
  await page.mouse.move(box.x+box.width-3,box.y+7);await page.mouse.down();await page.mouse.move(box.x+box.width+21,box.y+7,{steps:4});await page.mouse.up();
  ok('Dragging the note edge resizes its duration',await page.evaluate(({clipId,eventId})=>__shiyin.state.project.tracks[3].clips.find(c=>c.id===clipId).events.find(e=>e.id===eventId).durationTicks===720,noteTarget));
  const editedEvents=await page.evaluate(clipId=>JSON.stringify(__shiyin.state.project.tracks[3].clips.find(c=>c.id===clipId).events),noteTarget.clipId);
  await page.evaluate(()=>{__shiyin.state.arr.bright=.99;__shiyin.render();});
  ok('Legacy recompilation preserves manually edited clips',editedEvents===await page.evaluate(clipId=>JSON.stringify(__shiyin.state.project.tracks[3].clips.find(c=>c.id===clipId).events),noteTarget.clipId));
  await page.evaluate(()=>__shiyin.flushProjectSave());await page.waitForFunction(()=>document.querySelector('#projectSaveState').dataset.state==='saved');
  await page.reload();await page.waitForFunction(()=>window.__shiyin?.state.project);
  ok('Reload preserves manually edited note events',editedEvents===await page.evaluate(clipId=>JSON.stringify(__shiyin.state.project.tracks[3].clips.find(c=>c.id===clipId).events),noteTarget.clipId));
  await page.selectOption('#noteSection',String(noteTarget.section));await page.selectOption('#noteTrack','melody');
  await page.locator('.note-cell').filter({hasText:'G9'}).first().click();await page.click('#noteDelete');
  ok('Deleting a note removes its playback event and remains undoable',await page.evaluate(({clipId,eventId})=>!__shiyin.state.project.tracks[3].clips.find(c=>c.id===clipId).events.some(e=>e.id===eventId),noteTarget));
  await page.click('#undoBtn');ok('Undo brings the deleted note back unchanged',editedEvents===await page.evaluate(clipId=>JSON.stringify(__shiyin.state.project.tracks[3].clips.find(c=>c.id===clipId).events),noteTarget.clipId));
  // Real mock endpoint + immutable candidate + separate A/B playback.
  const beforeCandidate=await page.evaluate(()=>JSON.stringify(__shiyin.projectDocument()));
  let scopedRequest;
  page.on('request',request=>{if(request.url().endsWith('/api/revise-clip'))scopedRequest=request.postDataJSON();});
  await page.fill('#revisionDirection','让旋律更舒展');await page.click('#revisionGenerate');
  await page.waitForFunction(()=>__shiyin.revisionCandidate()&&!__shiyin.state.busy,null,{timeout:15000});
  ok('Scoped generation receives the current manually edited notes',scopedRequest.project.tracks[3].clips.find(c=>c.id===noteTarget.clipId).events.some(e=>e.pitch===127));
  ok('Candidate generation leaves the current project untouched',beforeCandidate===await page.evaluate(()=>JSON.stringify(__shiyin.projectDocument())));
  const candidateNext=await page.evaluate(()=>JSON.stringify(__shiyin.revisionCandidate().next));
  if(process.env.ARRO_NOTE_SCREENSHOT_PREFIX){
    await page.locator('.note-editor').screenshot({path:process.env.ARRO_NOTE_SCREENSHOT_PREFIX+'-candidate-desktop.png'});
    await page.setViewportSize({width:390,height:844});
    ok('Candidate controls fit the narrow viewport',await page.evaluate(()=>{const el=document.querySelector('#revisionCandidate');return el.getBoundingClientRect().right<=innerWidth&&el.scrollWidth<=el.clientWidth;}));
    await page.locator('.note-editor').screenshot({path:process.env.ARRO_NOTE_SCREENSHOT_PREFIX+'-candidate-mobile.png'});
    await page.setViewportSize({width:1280,height:900});
  }

  await page.click('#revisionOriginal');await page.waitForFunction(()=>!!__shiyin.comparisonSource(),null,{timeout:60000});
  ok('Original comparison uses a separate audio source without replacing the project',beforeCandidate===await page.evaluate(()=>JSON.stringify(__shiyin.projectDocument())));
  await page.click('#revisionStop');
  await page.click('#revisionNew');await page.waitForFunction(()=>!!__shiyin.comparisonSource(),null,{timeout:60000});
  ok('Candidate comparison leaves project playback and export unchanged',beforeCandidate===await page.evaluate(()=>JSON.stringify(__shiyin.projectDocument())));
  ok('Comparison audio contains finite, non-silent samples for the selected section',await page.evaluate(()=>{
    const candidate=__shiyin.revisionCandidate(),buffer=__shiyin.comparisonSource().buffer,data=buffer.getChannelData(0);
    return Math.abs(buffer.duration-(candidate.clip.durationTicks/480*60/candidate.next.tempo+3))<.001&&data.every(Number.isFinite)&&data.some(v=>Math.abs(v)>.0001);
  }));
  await page.click('#revisionStop');await page.click('#revisionAccept');
  ok('Accept applies the validated candidate in one undoable command',candidateNext===await page.evaluate(()=>JSON.stringify(__shiyin.state.project)));
  await page.click('#undoBtn');ok('Undo returns from the AI candidate to the exact original notes',beforeCandidate===await page.evaluate(()=>JSON.stringify(__shiyin.projectDocument())));
  await page.click('#redoBtn');
  await page.evaluate(()=>__shiyin.flushProjectSave());await page.waitForFunction(()=>document.querySelector('#projectSaveState').dataset.state==='saved');
  await page.reload();await page.waitForFunction(()=>window.__shiyin?.state.project&&__shiyin.state.backend?.ok);
  ok('Accepted AI clip edits survive reload',candidateNext===await page.evaluate(()=>JSON.stringify(__shiyin.state.project)));
  await page.selectOption('#noteSection',String(noteTarget.section));await page.selectOption('#noteTrack','melody');
  await page.fill('#revisionDirection','保留动机，调整节奏');await page.click('#revisionGenerate');
  await page.waitForFunction(()=>__shiyin.revisionCandidate()&&!__shiyin.state.busy);
  await page.click('#bpmUp');
  ok('Editing after generation invalidates the old candidate',await page.isHidden('#revisionCandidate')&&!await page.evaluate(()=>!!__shiyin.revisionCandidate()));
  await page.click('#undoBtn');
  const beforeDiscard=await page.evaluate(()=>JSON.stringify(__shiyin.state.project));
  await page.click('#revisionGenerate');await page.waitForFunction(()=>__shiyin.revisionCandidate()&&!__shiyin.state.busy);
  await page.click('#revisionDiscard');
  ok('Discarding an AI candidate preserves the current project',beforeDiscard===await page.evaluate(()=>JSON.stringify(__shiyin.state.project)));
  await page.route('**/api/revise-clip',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'Mock failure'})}));
  await page.click('#revisionGenerate');await page.waitForFunction(()=>!__shiyin.state.busy);
  ok('Scoped generation failure keeps the project and offers retry',beforeDiscard===await page.evaluate(()=>JSON.stringify(__shiyin.state.project))&&await page.isEnabled('#revisionGenerate'));
  await page.unroute('**/api/revise-clip');
  await page.route('**/api/job?*',async route=>{await new Promise(r=>setTimeout(r,800));await route.continue();});
  await page.click('#revisionGenerate');await page.click('#bpmUp');
  const whileWaiting=await page.evaluate(()=>JSON.stringify(__shiyin.state.project));
  await page.waitForFunction(()=>!__shiyin.state.busy);
  ok('A late AI result cannot overwrite edits made while waiting',whileWaiting===await page.evaluate(()=>JSON.stringify(__shiyin.state.project))&&!await page.evaluate(()=>!!__shiyin.revisionCandidate())&&(await page.textContent('#revisionStatus')).includes('工程已变化'));
  await page.unroute('**/api/job?*');
  await page.evaluate(()=>__shiyin.flushVersions());
  ok('Stale scoped candidates are retained as named versions in IndexedDB',await page.evaluate(async()=>{const stored=await __shiyin.projectStore.loadVersions();return stored.some(v=>v.by==='AI 局部候选');}));
  // New-note, drum-grid, looping, and persistent undo workflows.
  await page.selectOption('#noteTrack','melody');
  const beforeNewNote=await page.evaluate(()=>JSON.stringify(__shiyin.state.project));
  await page.selectOption('#notePitch','65');await page.fill('#noteStart','2');await page.fill('#noteLength','2');await page.fill('#noteVelocity','72');await page.click('#noteAdd');
  ok('Adding a note creates an editable event in the selected clip',await page.evaluate(()=>__shiyin.state.project.tracks[3].clips.some(c=>c.events.some(e=>e.id.includes(':user:')&&e.pitch===65&&e.startTick===120&&e.durationTicks===240&&e.velocity===.72))));
  await page.click('#undoBtn');ok('New-note creation is one undo step',beforeNewNote===await page.evaluate(()=>JSON.stringify(__shiyin.state.project)));
  await page.selectOption('#noteTrack','drums');
  const beforeDrum=await page.evaluate(()=>JSON.stringify(__shiyin.state.project));
  await page.selectOption('#drumLane','k');await page.fill('#drumStep','3');await page.fill('#drumVelocity','61');await page.click('#drumForm button[type=submit]');
  ok('Drum fields update the selected step and its velocity',await page.evaluate(()=>{const p=__shiyin.state.project,c=p.tracks[0].clips[__shiyin.state.sel];return c.events.some(e=>e.lane==='k'&&e.startTick===240&&e.velocity===.61)&&__shiyin.state.S.ev.drums[c.startTick/120+2].some(e=>e[0]==='k'&&e[1]===.61);}));
  await page.click('#drumDelete');
  ok('Deleting a drum hit removes the selected lane and step',await page.evaluate(()=>!__shiyin.state.project.tracks[0].clips[__shiyin.state.sel].events.some(e=>e.lane==='k'&&e.startTick===240)));
  await page.click('#undoBtn');await page.click('#undoBtn');
  ok('Drum edits undo to the exact original project',beforeDrum===await page.evaluate(()=>JSON.stringify(__shiyin.state.project)));
  await page.selectOption('#noteTrack','melody');await page.check('#noteLoop');await page.click('#noteListen');
  ok('Section looping uses the selected section bounds',await page.evaluate(()=>{const p=__shiyin.state.project,s=p.sections[__shiyin.state.sel],src=__shiyin.playbackSource();return src.from===s.startTick/120&&src.len===(s.startTick+s.durationTicks)/120;}));
  await page.click('#playBtn');await page.uncheck('#noteLoop');
  const beforePersistentUndo=await page.evaluate(()=>JSON.stringify(__shiyin.state.project));
  await page.click('#bpmUp');await page.evaluate(()=>__shiyin.flushProjectSave());await page.waitForFunction(()=>document.querySelector('#projectSaveState').dataset.state==='saved');
  await page.reload();await page.waitForFunction(()=>window.__shiyin?.state.project&&__shiyin.state.backend?.ok);await page.click('#undoBtn');
  ok('Recent undo history survives reload with the saved project',beforePersistentUndo===await page.evaluate(()=>JSON.stringify(__shiyin.state.project)));
  const beforeDirection=await page.evaluate(()=>JSON.stringify(__shiyin.state.project));
  await page.locator('#bright').fill('0.9');await page.locator('#bright').dispatchEvent('change');
  ok('Producer direction controls preserve current events for faithful projects',beforeDirection===await page.evaluate(()=>JSON.stringify(__shiyin.state.project))&&(await page.textContent('#directionHelp')).includes('下一次生成'));
  // A lost HTTP response must not trigger a second upstream job on retry.
  const beforeLostResponse=await page.evaluate(()=>JSON.stringify(__shiyin.state.project));
  let dropped=true;const retryIds=[];
  await page.route('**/api/arrange',async route=>{
    retryIds.push(route.request().postDataJSON().requestId);
    if(dropped){dropped=false;await route.fetch();await route.abort('connectionfailed');}else await route.continue();
  });
  await page.click('#genBtn');await page.waitForFunction(()=>!__shiyin.state.busy);
  ok('Generation transport failures preserve the existing project',beforeLostResponse===await page.evaluate(()=>JSON.stringify(__shiyin.state.project)));
  await page.click('#genBtn');await page.waitForFunction(()=>!__shiyin.state.busy,null,{timeout:30000});
  ok('Retry after a lost response reuses the same request identity',retryIds.length===2&&retryIds[0]===retryIds[1]&&typeof retryIds[0]==='string');
  await page.unroute('**/api/arrange');
  await page.click('#genBtn');await page.click('#bpmUp');
  const generationEdited=await page.evaluate(()=>JSON.stringify(__shiyin.state.project));
  await page.waitForFunction(()=>!__shiyin.state.busy,null,{timeout:30000});
  ok('Late whole-song generation preserves current edits and stores its result as a version',generationEdited===await page.evaluate(()=>JSON.stringify(__shiyin.state.project))&&(await page.textContent('#verList')).includes('AI 生成候选'));
  await page.evaluate(()=>__shiyin.flushProjectSave());await page.waitForFunction(()=>document.querySelector('#projectSaveState').dataset.state==='saved');
  await page.reload();await page.waitForFunction(()=>window.__shiyin?.state.project);
  const beforeRecovery=await page.evaluate(()=>JSON.stringify(__shiyin.projectDocument()));
  await page.locator('summary').filter({hasText:'找回最近的生成任务'}).click();await page.selectOption('#recoverySelect',retryIds[0]);await page.click('#recoverJob');
  await page.waitForFunction(()=>document.querySelector('#recoveryStatus').textContent.includes('已保存为独立版本'));
  ok('A completed job can be recovered after reload without replacing current work',beforeRecovery===await page.evaluate(()=>JSON.stringify(__shiyin.projectDocument()))&&await page.evaluate(async()=>(await __shiyin.projectStore.loadVersions()).some(v=>v.by==='找回的 AI 结果')));
  const invalidScope=await page.evaluate(async()=>{
    const p=structuredClone(__shiyin.state.project);
    const r=await fetch('/api/revise-clip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:p,scope:{trackId:'track:drums',clipId:p.tracks[0].clips[0].id},direction:'test'})});return r.status;
  });
  ok('The server rejects unsupported scoped revision targets',invalidScope===400);
  if(process.env.ARRO_NOTE_SCREENSHOT_PREFIX){
    const clean=await page.evaluate(editedId=>__shiyin.state.project.tracks[3].clips.findIndex(c=>c.id!==editedId&&c.events.length),noteTarget.clipId);
    await page.selectOption('#noteSection',String(clean));
    await page.locator('.note-editor').screenshot({path:process.env.ARRO_NOTE_SCREENSHOT_PREFIX+'-desktop.png'});
  }
  await page.setViewportSize({width:390,height:844});
  ok('Project controls fit a narrow screen', await page.evaluate(()=>{const el=document.querySelector('.project-bar');return el.getBoundingClientRect().right<=innerWidth&&el.scrollWidth<=el.clientWidth;}));
  ok('Note editor fields stay inside a narrow viewport',await page.evaluate(()=>document.querySelector('.note-editor').getBoundingClientRect().right<=innerWidth&&document.querySelector('.note-fields').scrollWidth<=document.querySelector('.note-fields').clientWidth));
  if(process.env.ARRO_NOTE_SCREENSHOT_PREFIX) await page.locator('.note-editor').screenshot({path:process.env.ARRO_NOTE_SCREENSHOT_PREFIX+'-mobile.png'});
  if(process.env.ARRO_SCREENSHOT_PATH) await page.screenshot({path:process.env.ARRO_SCREENSHOT_PATH,fullPage:false});
  // Upgrade an actual old IndexedDB store and migrate its localStorage library.
  const legacyDoc=await page.evaluate(()=>__shiyin.projectDocument());
  const migrationContext=await browser.newContext(),migrationPage=await migrationContext.newPage();await migrationPage.goto(B);
  await migrationPage.evaluate(async doc=>{
    await new Promise((resolve,reject)=>{
      const request=indexedDB.open('arro-projects-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('documents');
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({document:doc,token:'legacy-token'},'current');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};
    });
    localStorage.setItem('shiyin.versions.v1',JSON.stringify([{id:'legacy-version',time:'10:00',what:'Legacy version',by:'',label:'Legacy',star:true,data:JSON.stringify({...doc.editor,project:doc.project})}]));
  },legacyDoc);
  await migrationPage.fill('#c','TEST-CODE-1');await migrationPage.click('#b');await migrationPage.waitForFunction(()=>window.__shiyin?.state.project);
  ok('Upgrading IndexedDB preserves the old current project',await migrationPage.evaluate(id=>__shiyin.state.project.projectId===id,legacyDoc.project.projectId));
  ok('Legacy localStorage versions migrate into IndexedDB without deleting the old copy',await migrationPage.evaluate(async()=>{const saved=await __shiyin.projectStore.loadVersions();return saved.some(v=>v.id==='legacy-version'&&v.star)&&!!localStorage.getItem('shiyin.versions.v1');}));
  await migrationPage.evaluate(()=>{window.originalPutVersion=__shiyin.projectStore.putVersion;__shiyin.projectStore.putVersion=async()=>{throw new Error('Mock storage failure');};});
  await migrationPage.locator('#verList .star').first().click();await migrationPage.waitForFunction(()=>!document.querySelector('#retryVersions').hidden);
  ok('Version-library failures remain visible with a retry action',(await migrationPage.textContent('#versionSaveState')).includes('未保存'));
  await migrationPage.evaluate(()=>{__shiyin.projectStore.putVersion=window.originalPutVersion;});await migrationPage.click('#retryVersions');await migrationPage.evaluate(()=>__shiyin.flushVersions());
  ok('Version-library retry persists the pending change',await migrationPage.evaluate(async()=>(await __shiyin.projectStore.loadVersions()).find(v=>v.id==='legacy-version').star===false));
  await migrationContext.close();
  ok('No browser errors', errs.length === 0, errs.join(' | ').slice(0, 300));
} catch (e) { ok('Test execution error', false, String(e.message).slice(0, 300)); }
await browser.close();
if(srv&&srv.exitCode===null){const ended=new Promise(resolve=>srv.once('exit',resolve));srv.kill();await ended;}await rm(jobDir,{recursive:true,force:true});
for (const r of results) console.log(r.join(' '), );
const bad = results.filter(r => r[0] === '✗').length;
console.log(bad ? `\n${bad} checks failed` : `\nAll ${results.length} checks passed`);
if (bad) console.log(log.slice(-800));
process.exit(bad ? 1 : 0);
