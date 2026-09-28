// A transaction commits the document and its concurrency token together.
export function createProjectStore(indexedDB = globalThis.indexedDB) {
  let connection;
  const open = () => connection ??= new Promise((resolve, reject) => {
    if (!indexedDB) { reject(new Error('浏览器不支持本地工程保存')); return; }
    const request = indexedDB.open('arro-projects-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
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
    async save(document, expectedToken) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');
        const request = store.get('current');
        const token = crypto.randomUUID();
        let conflict = false;
        request.onsuccess = () => {
          if ((request.result?.token ?? null) !== expectedToken) { conflict = true; tx.abort(); return; }
          store.put({ document, token }, 'current');
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
