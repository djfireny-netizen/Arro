import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createJobJournal } from '../storage/jobs.mjs';
const dir=await mkdtemp(tmpdir()+'/arro-jobs-unit-');
try{
  const store=await createJobJournal(dir,{maxRecords:3,maxRunning:2});
  const input={owner:'owner-a',requestId:'request-0000000001',hash:'same',ip:'ip-a',type:'/api/arrange'};
  const results=await Promise.all(Array.from({length:8},()=>store.prepare(input)));
  assert.equal(results.filter(r=>r.created).length,1);
  assert.equal(new Set(results.map(r=>r.job.id)).size,1);
  const id=results[0].job.id;
  assert.equal(store.get('owner-b',id),null);
  await assert.rejects(store.prepare({...input,hash:'changed'}),e=>e.status===409);
  await store.update(id,{status:'done',plan:{title:'Preserved'}});
  const pending=await store.prepare({...input,requestId:'request-0000000002',hash:'other'});
  const restarted=await createJobJournal(dir);
  assert.equal(restarted.get('owner-a',id).plan.title,'Preserved');
  assert.equal(restarted.get('owner-a',pending.job.id).interrupted,true);
  assert.equal((await restarted.prepare({...input,requestId:'request-0000000002',hash:'other'})).created,false);
  assert.deepEqual(restarted.usage('ip-a'),{site:2,ip:2});
  assert.equal((await stat(dir+'/jobs.json')).mode&0o777,0o600);
  const json=JSON.parse(await readFile(dir+'/jobs.json','utf8'));
  assert.equal(json.jobs.length,2);
  console.log('Atomic job deduplication, ownership, conflicts, completed recovery, interruption, quota retention, and private file mode passed');
}finally{await rm(dir,{recursive:true,force:true});}
