// HTTP fault checks use synthetic invitations and the mock model only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
const dir=await mkdtemp(tmpdir()+'/arro-jobs-http-'),base='http://127.0.0.1:5207';
let server;
const start=async()=>{
  server=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,ARRO_JOB_DIR:dir,PORT:'5207',HOST:'127.0.0.1',PROVIDER:'mock',INVITE_CODES:'JOB-TEST-CODE',RATE_LIMIT_PER_IP:'1',RATE_LIMIT_PER_DAY:'100',ALLOWED_ORIGIN:base,ARRANGE_PASSES:'1'},stdio:'ignore'});
  for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Mock server failed to start');
};
const stop=async()=>{if(server&&server.exitCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}};
const client=()=>{
  const cookies=new Map();
  return async(path,body)=>{
    const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:base,Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},...(body?{body:JSON.stringify(body)}:{})});
    for(const c of r.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');cookies.set(k,v);}
    const data=await r.text();return {status:r.status,data:r.headers.get('content-type')?.includes('application/json')?JSON.parse(data):data};
  };
};
try{
  await start();const a=client(),b=client();
  assert.equal((await a('/api/arrange',{mood:'test'})).status,401);
  for(const call of [a,b]){assert.equal((await call('/api/login',{code:'JOB-TEST-CODE'})).status,200);await call('/');}
  const request={requestId:randomUUID(),mood:'A night drive',style:null};
  const submissions=await Promise.all([a('/api/arrange',request),a('/api/arrange',request)]);
  assert(submissions.every(r=>r.status===200));assert.equal(submissions[0].data.job,submissions[1].data.job);
  const id=submissions[0].data.job;
  assert.equal((await b('/api/job?id='+id)).status,404);
  assert.equal((await b('/api/job?requestId='+request.requestId)).status,404);
  assert.equal((await a('/api/job?requestId='+request.requestId)).status,200);
  assert.equal((await a('/api/arrange',{...request,mood:'different'})).status,409);
  assert.equal((await a('/api/arrange',{...request,requestId:randomUUID()})).status,429);
  await new Promise(r=>setTimeout(r,1200));assert.equal((await a('/api/job?id='+id)).data.status,'done');
  await stop();await start();
  assert.equal((await a('/api/job?id='+id)).data.status,'done');
  assert.equal((await a('/api/arrange',request)).data.job,id);
  assert.equal((await a('/api/arrange',{...request,requestId:randomUUID()})).status,429);
  console.log('HTTP login, browser-session ownership, concurrent deduplication, conflicting IDs, quotas, and restart recovery passed');
}finally{await stop();await rm(dir,{recursive:true,force:true});}
