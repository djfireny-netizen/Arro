// Render frozen release-check projects without any model calls.
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {applyCommand} from '../core/commands.mjs';
const root=new URL('..',import.meta.url),dir=new URL('runs/revision-1.1/',import.meta.url),audioDir=new URL('audio/',dir);
await mkdir(audioDir,{recursive:true});
const fixtures=JSON.parse(await readFile(new URL('fixtures.json',dir),'utf8'));
const results=JSON.parse(await readFile(new URL('results.json',dir),'utf8')).runs;
const archive=JSON.parse(await readFile(new URL('runs/frontier-48/results.json',import.meta.url),'utf8')).runs;
const tmp=await mkdtemp(tmpdir()+'/arro-release-audio-');
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:'5210',PROVIDER:'mock',INVITE_CODES:'AUDIO-FIXTURE',ARRO_JOB_DIR:tmp},stdio:'ignore'});
let browser;const measurements=[];
try{
  const {chromium}=await import('playwright').catch(()=>import(process.env.PLAYWRIGHT_MJS));browser=await chromium.launch();
  const page=await browser.newPage();
  for(let i=0;i<60;i++){try{await page.goto('http://127.0.0.1:5210');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  await page.fill('#c','AUDIO-FIXTURE');await page.click('#b');await page.waitForFunction(()=>window.__shiyin?.state.project);
  for(const item of fixtures.filter(r=>r.type==='phrase')){
    const result=results.find(r=>r.id===item.id);if(result?.status!=='done')continue;
    const plan=archive.find(r=>r.id===item.sourceId).plan;
    await page.evaluate(async({project,plan})=>{
      const api=__shiyin,x=api.fromSongPlan(plan,null,{}, {executionVersion:2}),doc=api.projectDocument();
      x.arr.sound=structuredClone(project.tracks[0].instrument.sound);x.arr.bpm=project.tempo;
      // Section IDs belong to the frozen project, not this fresh compiler invocation.
      x.song.forEach((s,i)=>s.id=Number(project.sections[i].id.split(':')[1]));
      doc.project=project;Object.assign(doc.editor,{arr:x.arr,song:x.song,extra:x.extra,sel:0,feel:0,mode:'song'});
      for(const t of project.tracks){doc.editor.vol[t.layer]=t.mixer.volume;doc.editor.muted[t.layer]=t.mixer.muted;}
      await api.importProjectText(JSON.stringify(doc));
    },{project:item.project,plan});
    const next=applyCommand(item.project,{type:'replace-clip',baseRevision:item.project.revision,...item.scope,candidate:result.candidate});
    const clip=item.project.tracks.find(t=>t.id===item.scope.trackId).clips.find(c=>c.id===item.scope.clipId);
    const variants=[['A',item.project,clip.startTick/120,(clip.startTick+clip.durationTicks)/120],['B',next,clip.startTick/120,(clip.startTick+clip.durationTicks)/120]];
    if(!measurements.length)variants.push(['full',item.project,0,item.project.sections.reduce((s,x)=>s+x.durationTicks/120,0)]);
    for(const [name,project,from,until] of variants){
      const output=await page.evaluate(async({project,from,until})=>{
        const api=__shiyin,before=JSON.stringify(api.projectDocument());
        const buffer=await api.renderAudio(null,null,{performance:api.projectPerformance(project),from,until});
        let peak=0,finite=true;for(let c=0;c<buffer.numberOfChannels;c++)for(const value of buffer.getChannelData(c)){if(!Number.isFinite(value))finite=false;peak=Math.max(peak,Math.abs(value));}
        const bytes=api.wavBytes(api.withAigcTone(buffer));let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
        return {base64:btoa(binary),seconds:buffer.duration,peak,finite,unchanged:before===JSON.stringify(api.projectDocument())};
      },{project,from,until});
      const bytes=Buffer.from(output.base64,'base64');delete output.base64;
      if(!output.finite||!output.unchanged||output.peak<.0001||!bytes.includes(Buffer.from('AIGC')))throw new Error('Audio export check failed');
      const file=item.id+'-'+name+'.wav';await writeFile(new URL(file,audioDir),bytes);
      const measurement={id:item.id,file,bytes:bytes.length,...output};measurements.push(measurement);console.log(JSON.stringify(measurement));
    }
  }
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rows=fixtures.filter(r=>r.type==='phrase').map(item=>{const result=results.find(r=>r.id===item.id);return `<section><h2>作品 ${item.sourceId}</h2><p>${esc(result.candidate.explanation)}</p><div><label>A · 原版<audio controls preload="none" src="audio/${item.id}-A.wav"></audio></label><label>B · 局部修改<audio controls preload="none" src="audio/${item.id}-B.wav"></audio></label></div></section>`;}).join('');
  await writeFile(new URL('listen.html',dir),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ARRO 1.1 局部修改试听</title><style>body{font:16px/1.7 system-ui;background:#f3f3ef;color:#18191b;max-width:960px;margin:40px auto;padding:0 20px}h1{letter-spacing:.08em}section{margin:24px 0;padding:22px;border:1px solid #c9cac4;border-radius:8px}section div{display:grid;grid-template-columns:1fr 1fr;gap:20px}audio{display:block;width:100%;margin-top:8px}p{color:#555}a{color:#147e83}@media(max-width:600px){section div{grid-template-columns:1fr}}</style><h1>ARRO · 1.1 局部修改试听</h1><p>6 份已有作品，各修改一段旋律。A 是当前音符，B 是制作人的候选；其他轨道保留。方向是沿用当前第一个音，在最后两拍留出呼吸空间，其余句子交给制作人设计。这些不是新的人工偏好评分。</p>${rows}<p><a href="audio/${fixtures[0].id}-full.wav">完整原曲：导出验证样本</a></p><script>document.querySelectorAll('audio').forEach(a=>a.onplay=()=>document.querySelectorAll('audio').forEach(b=>{if(a!==b)b.pause()}))</script></html>`);
  await writeFile(new URL('audio-checks.json',dir),JSON.stringify(measurements,null,2)+'\n');
}finally{await browser?.close();const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;await rm(tmp,{recursive:true,force:true});}
