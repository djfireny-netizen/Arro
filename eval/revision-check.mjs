// ARRO 1.1 release checks: prepare frozen cases offline, then explicitly run paid revisions.
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { revisionContext } from '../core/revision.mjs';
import { applyCommand } from '../core/commands.mjs';
const root=new URL('..',import.meta.url),dir=new URL('runs/revision-1.1/',import.meta.url);
await mkdir(dir,{recursive:true});
const file=new URL('results.json',dir),fixturesFile=new URL('fixtures.json',dir);
const mode=process.argv[2]||'prepare';
const save=(path,data)=>writeFile(path,JSON.stringify(data,null,2)+'\n');
if(mode==='prepare'){
  const archive=JSON.parse(await readFile(new URL('runs/frontier-48/results.json',import.meta.url),'utf8'));
  const plans=archive.runs.filter(r=>r.plan&&r.model==='claude-opus-5-5'&&r.language==='en').slice(0,6);
  if(plans.length!==6)throw new Error('Six archived source projects are required');
  const tmp=await mkdtemp(tmpdir()+'/arro-revision-prepare-');
  const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'5209',HOST:'127.0.0.1',PROVIDER:'mock',INVITE_CODES:'RELEASE-FIXTURE',ARRO_JOB_DIR:tmp},stdio:'ignore'});
  let browser;
  try{
    const {chromium}=await import('playwright').catch(()=>import(process.env.PLAYWRIGHT_MJS));
    browser=await chromium.launch();const page=await browser.newPage();
    for(let i=0;i<60;i++){try{await page.goto('http://127.0.0.1:5209');break;}catch{await new Promise(r=>setTimeout(r,100));}}
    await page.fill('#c','RELEASE-FIXTURE');await page.click('#b');await page.waitForFunction(()=>window.__shiyin?.state.project);
    const cases=await page.evaluate(plans=>plans.flatMap(run=>{
      const api=__shiyin,x=api.fromSongPlan(run.plan,null,{}, {executionVersion:2});
      const project=api.captureProject({arrangement:x.arr,sections:x.song,performance:api.deriveSong(x.arr,x.song,x.extra),projectId:'release-eval-'+run.id});
      const melody=project.tracks.find(t=>t.layer==='melody'),clip=melody.clips.find(c=>c.events.length&&c.events.every(e=>e.startTick+e.durationTicks<=c.durationTicks));
      if(!clip)throw new Error('No eligible melody clip');
      // Simulate a user edit to prove the request follows current events.
      clip.events[0].pitch=Math.min(126,clip.events[0].pitch+1);clip.edited=true;project.revision++;
      const bass=project.tracks.find(t=>t.layer==='bass'),bassClip=bass.clips.find(c=>c.events.length&&c.events.every(e=>e.pitch>=12&&e.velocity>=.01&&e.velocity<=1.27&&e.startTick+e.durationTicks<=c.durationTicks));
      if(!bassClip)throw new Error('No eligible bass clip');
      return [
        {id:run.id+'-phrase',sourceId:run.id,type:'phrase',project,scope:{trackId:melody.id,clipId:clip.id},direction:'以当前片段第一个音的音高开始，重新设计这段旋律的句子，在最后一小节留出后两拍的呼吸空间。其他旋律音高、节奏和表现由你决定。'},
        {id:run.id+'-octave',sourceId:run.id,type:'octave',project,scope:{trackId:bass.id,clipId:bassClip.id},direction:'把当前这段贝斯的每个音整体降低一个八度，保留每个音符原来的起点、时长和力度。'}
      ];
    }),plans.map(({id,scene,plan})=>({id,scene,plan})));
    await save(fixturesFile,cases);
    const sizes=cases.map(c=>Buffer.byteLength(JSON.stringify(revisionContext(c.project,c.scope))));
    console.log(JSON.stringify({prepared:cases.length,contextBytes:{min:Math.min(...sizes),max:Math.max(...sizes)},estimatedInputTokens:Math.ceil(sizes.reduce((a,b)=>a+b,0)/3),outputTokenCap:16000,costStopUSD:8}));
  }finally{await browser?.close();const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;await rm(tmp,{recursive:true,force:true});}
}else if(mode==='run'){
  for(const line of (await readFile(new URL('.env',root),'utf8')).split(/\r?\n/)){const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
  if(process.env.PROVIDER!=='aihubmix'||process.env.AIHUBMIX_MODEL!=='claude-opus-5-5')throw new Error('Release check requires the approved provider/model');
  const {reviseClip,withTelemetry}=await import('../ai.mjs');
  const fixturesText=await readFile(fixturesFile,'utf8'),cases=JSON.parse(fixturesText),fingerprint=createHash('sha256').update(fixturesText).update(await readFile(new URL('../prompts/revision.en.txt',import.meta.url))).digest('hex');
  let report={fingerprint,model:process.env.AIHUBMIX_MODEL,pricePerMillion:{input:4,output:20},budgetUSD:8,startedAt:new Date().toISOString(),runs:[]};
  try{report=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(report.fingerprint!==fingerprint)throw new Error('Fixture or prompt changed; use a new results directory');
  const max=Number(process.argv[3]||12);
  for(const item of cases.slice(0,max)){
    if(report.runs.some(r=>r.id===item.id))continue;
    const inputBytes=Buffer.byteLength(JSON.stringify(revisionContext(item.project,item.scope)))+5000;
    const reserve=inputBytes*4/1e6+16000*20/1e6;
    if(report.runs.reduce((s,r)=>s+(r.costUSD??r.reservedUSD),0)+reserve>report.budgetUSD){console.log('Cost stop reached');break;}
    const row={id:item.id,sourceId:item.sourceId,type:item.type,status:'running',reservedUSD:reserve,startedAt:new Date().toISOString(),calls:[]};report.runs.push(row);await save(file,report);
    const started=Date.now();
    try{
      row.candidate=await withTelemetry(call=>row.calls.push(call),()=>reviseClip(item.project,item.scope,item.direction));
      const next=applyCommand(item.project,{type:'replace-clip',baseRevision:item.project.revision,...item.scope,candidate:row.candidate});
      row.untouched=next.tracks.every(t=>t.clips.every(c=>c.id===item.scope.clipId||JSON.stringify(c)===JSON.stringify(item.project.tracks.find(x=>x.id===t.id).clips.find(x=>x.id===c.id))));
      const before=item.project.tracks.find(t=>t.id===item.scope.trackId).clips.find(c=>c.id===item.scope.clipId),notes=row.candidate.notes;
      if(item.type==='octave'){
        const normalize=list=>list.map(n=>[n.pitch,n.startTick,n.durationTicks,n.velocity]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        row.fulfilled=JSON.stringify(normalize(notes))===JSON.stringify(normalize(before.events.map(e=>({...e,pitch:e.pitch-12}))));
      }else{
        const first=Math.min(...notes.map(n=>n.startTick));
        row.fulfilled=notes.length>0&&notes.some(n=>n.startTick===first&&n.pitch===before.events[0].pitch)&&notes.every(n=>n.startTick+n.durationTicks<=before.durationTicks-960);
      }
      row.status='done';
    }catch(error){row.status='error';row.errorClass=error.name||'Error';}
    row.ms=Date.now()-started;
    if(row.calls.length&&row.calls.every(c=>c.usage))row.costUSD=row.calls.reduce((s,c)=>s+((c.usage.prompt_tokens??c.usage.input_tokens??0)*4+(c.usage.completion_tokens??c.usage.output_tokens??0)*20)/1e6,0);
    await save(file,report);console.log(JSON.stringify({id:row.id,status:row.status,fulfilled:row.fulfilled,untouched:row.untouched,ms:row.ms,costUSD:row.costUSD??null}));
  }
  console.log(JSON.stringify({attempted:report.runs.length,done:report.runs.filter(r=>r.status==='done').length,fulfilled:report.runs.filter(r=>r.fulfilled).length,costAccountedUSD:report.runs.reduce((s,r)=>s+(r.costUSD??r.reservedUSD),0)}));
}else throw new Error('Use prepare or run [number-of-cases]');
