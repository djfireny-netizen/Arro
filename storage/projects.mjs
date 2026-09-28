// A transaction commits the document and its concurrency token together.
export function createProjectStore(indexedDB = globalThis.indexedDB) {
  let connection;
  const open = () => connection ??= new Promise((resolve, reject) => {
    if (!indexedDB) { reject(new Error('浏览器不支持本地工程保存')); return; }
    const request = indexedDB.open('arro-projects-v1', 3);
    request.onupgradeneeded = () => {
      if(!request.result.objectStoreNames.contains('documents'))request.result.createObjectStore('documents');
      if(!request.result.objectStoreNames.contains('requests'))request.result.createObjectStore('requests',{keyPath:'requestId'});
      if(!request.result.objectStoreNames.contains('versions'))request.result.createObjectStore('versions',{keyPath:'id'});
    };
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => { connection = null; reject(new Error('请关闭其他旧版 ARRO 标签页后重试')); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
  });
  return {
    async load() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('documents', 'readonly');
        const request = tx.objectStore('documents').get('current');
        tx.oncomplete = () => resolve(request.result ?? null);
        tx.onabort = () => reject(tx.error ?? new Error('读取工程失败'));
      });
    },
    async putRecovery(record){
      const db=await open();return new Promise((resolve,reject)=>{
        const tx=db.transaction('requests','readwrite'),store=tx.objectStore('requests'),request=store.getAll();
        request.onsuccess=()=>{
          const all=request.result;
          if(!all.some(r=>r.requestId===record.requestId)){store.put(record);all.push(record);}
          all.sort((a,b)=>b.time-a.time);
          for(const [i,r] of all.entries())if(i>=6||Date.now()-r.time>86400000)store.delete(r.requestId);
        };
        tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||new Error('无法保存任务恢复信息'));
      });
    },
    async loadRecovery(){
      const db=await open();return new Promise((resolve,reject)=>{
        const tx=db.transaction('requests','readonly'),request=tx.objectStore('requests').getAll();
        tx.oncomplete=()=>resolve(request.result.filter(r=>Date.now()-r.time<86400000).sort((a,b)=>b.time-a.time));
        tx.onabort=()=>reject(tx.error||new Error('无法读取任务恢复信息'));
      });
    },
    async loadVersions(){
      const db=await open();return new Promise((resolve,reject)=>{
        const tx=db.transaction('versions','readonly'),request=tx.objectStore('versions').getAll();
        tx.oncomplete=()=>resolve(request.result.sort((a,b)=>String(b.id).localeCompare(String(a.id))));
        tx.onabort=()=>reject(tx.error||new Error('读取版本记录失败'));
      });
    },
    async putVersion(version){
      const db=await open();return new Promise((resolve,reject)=>{
        const tx=db.transaction('versions','readwrite'),store=tx.objectStore('versions'),request=store.getAll();let result,limit=false;
        request.onsuccess=()=>{
          const all=request.result.filter(v=>v.id!==version.id);all.push(version);all.sort((a,b)=>String(b.id).localeCompare(String(a.id)));
          let count=0;result=all.filter(v=>v.star||++count<=30);
          if(result.filter(v=>v.star).length>64||JSON.stringify(result).length>40000000){limit=true;tx.abort();return;}
          const kept=new Set(result.map(v=>v.id));for(const old of all)if(!kept.has(old.id))store.delete(old.id);
          if(kept.has(version.id))store.put(version);
        };
        tx.oncomplete=()=>resolve(result);
        tx.onabort=()=>reject(limit?new Error('版本记录空间已满，请下载重要工程并减少收藏'):tx.error||new Error('保存版本记录失败'));
      });
    },
    async save(document, expectedToken, history = null) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');
        const request = store.get('current');
        const token = crypto.randomUUID();
        let conflict = false;
        request.onsuccess = () => {
          if ((request.result?.token ?? null) !== expectedToken) { conflict = true; tx.abort(); return; }
          store.put({ document, token, history }, 'current');
        };
        tx.oncomplete = () => resolve(token);
        tx.onabort = () => reject(conflict ? new Error('另一个标签页已保存新版本，请先下载当前工程以保留修改') : tx.error ?? new Error('保存失败'));
      });
    }
  };
}

// Serialize writes and coalesce pending edits. A saved label always refers to
// the newest requested document, never an older transaction finishing late.
export function createAutosaver(store, onStatus) {
  let token = null, pending = null, running = null, ready = false, failed = false;
  const drain = async () => {
    while (pending && !failed) {
      const document = pending; pending = null;
      onStatus('saving');
      try { token = await store.save(document, token); }
      catch (error) { pending ??= document; failed = true; onStatus('error', error); return; }
    }
    if (!failed) onStatus('saved');
  };
  const flush = () => {
    if (!ready) return Promise.resolve();
    if (!running && pending && !failed) running = drain().finally(() => { running = null; if (pending && !failed) flush(); });
    return running ?? Promise.resolve();
  };
  return {
    initialize(savedToken) { token = savedToken; ready = true; },
    enqueue(document) { pending = structuredClone(document); if (!failed) onStatus('dirty'); return flush(); },
    retry() { failed = false; return flush(); },
    flush,
    get unsettled() { return !!pending || !!running || failed; }
  };
}
