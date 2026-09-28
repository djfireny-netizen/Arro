// Bounded, atomic job journal. Credentials and request bodies never enter it.
import { mkdir, readFile, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const DAY=86400000;
const failure=(message,status)=>Object.assign(new Error(message),{status});
export async function createJobJournal(directory,{maxRecords=256,retentionMs=DAY,maxRunning=4}={}) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,'jobs.json');
  let records=[];
  try {
    const data=JSON.parse(await readFile(file,'utf8'));
    if(data.version!==1||!Array.isArray(data.jobs)||data.jobs.some(j=>!j.id||!j.owner||!j.requestId||!['running','done','error'].includes(j.status)))throw new Error('Invalid job journal');
    records=data.jobs;
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const persist=async next=>{
    const temp=file+'.'+randomUUID()+'.tmp';let handle;
    try{
      handle=await open(temp,'wx',0o600);await handle.writeFile(JSON.stringify({version:1,jobs:next}));await handle.sync();await handle.close();handle=null;
      await rename(temp,file);
    }finally{await handle?.close();await unlink(temp).catch(()=>{});}
  };
  // An interrupted upstream call may have incurred cost; never submit it again automatically.
  records=records.filter(j=>Date.now()-j.t0<retentionMs).map(j=>j.status==='running'?{...j,status:'error',error:'服务已重启，这次任务的完成状态未知。原作品已保留；请确认后再发起新任务。',interrupted:true}:j);
  await persist(records);
  let queue=Promise.resolve();
  const transaction=fn=>{
    const operation=queue.then(async()=>{const next=structuredClone(records),result=fn(next);await persist(next);records=next;return structuredClone(result);});
    queue=operation.catch(()=>{});return operation;
  };
  const find=(owner,requestId)=>records.find(j=>j.owner===owner&&j.requestId===requestId&&Date.now()-j.t0<retentionMs);
  return {
    find(owner,requestId,hash){const job=find(owner,requestId);if(job&&hash!==undefined&&job.hash!==hash)throw failure('这个请求编号已用于不同内容，请重新发起任务',409);return job?structuredClone(job):null;},
    get(owner,id){const job=records.find(j=>j.owner===owner&&j.id===id&&Date.now()-j.t0<retentionMs);return job?structuredClone(job):null;},
    prepare(input,check=()=>null){return transaction(next=>{
      const old=next.find(j=>j.owner===input.owner&&j.requestId===input.requestId&&Date.now()-j.t0<retentionMs);
      if(old){if(old.hash!==input.hash)throw failure('请求编号与内容冲突',409);return {job:old,created:false};}
      const reason=check();if(reason)throw failure(reason,429);
      for(let i=next.length-1;i>=0;i--)if(Date.now()-next[i].t0>=retentionMs&&next[i].status!=='running')next.splice(i,1);
      if(next.length>=maxRecords||next.filter(j=>j.status==='running').length>=maxRunning)throw failure('任务队列已满，请稍后再试',429);
      const job={...input,id:randomUUID(),t0:Date.now(),status:'running',stage:'draft'};next.push(job);return {job,created:true};
    });},
    update(id,patch){return transaction(next=>{const j=next.find(j=>j.id===id);if(!j)throw new Error('Job missing');Object.assign(j,patch);return j;});},
    usage(ip){const today=new Date().toISOString().slice(0,10);const list=records.filter(j=>new Date(j.t0).toISOString().slice(0,10)===today);return {site:list.length,ip:list.filter(j=>j.ip===ip).length};},
    flush(){return queue;}
  };
}
