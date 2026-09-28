import { validateProject, LAYERS } from './project.mjs';
export const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
const record = x => x && typeof x === 'object' && !Array.isArray(x);
const fail = () => { throw new Error('工程文件无效或版本暂不支持，当前作品已保留'); };

export function validateDocument(doc) {
  if (!record(doc) || doc.format !== 'arro-project' || doc.version !== 1) fail();
  validateProject(doc.project);
  const e = doc.editor;
  if (!record(e) || !record(e.arr) || !Array.isArray(e.song) || !record(e.extra) || !record(e.ctl)) fail();
  const a = e.arr;
  if (a.bpm !== doc.project.tempo || !Number.isInteger(a.root) || a.root < 0 || a.root > 11 || !['major', 'minor'].includes(a.mode) || !record(a.sound) || !Array.isArray(a.prog) || a.prog.length !== 4) fail();
  const styles = 'ballad citypop folk dancepop rnb synthwave house futurebass dnb chiptune ambient lofi trap funk reggae afrobeats bossa jazz blues rock guofeng cinematic'.split(' ');
  if (!styles.includes(a.styleId) || !e.song.length || e.song.length > 24 || e.song.length !== doc.project.sections.length) fail();
  for (const [i, s] of e.song.entries()) {
    if (!record(s) || !['intro','verse','pre','chorus','post','bridge','outro'].includes(s.type) || ![4,8].includes(s.bars) || `section:${s.id}` !== doc.project.sections[i].id || s.bars * 1920 !== doc.project.sections[i].durationTicks) fail();
  }
  for (const layer of LAYERS) if (!record(a[layer])) fail();
  if (!Array.isArray(a.melody.notes) || !record(a.drums.lanes) || !record(a.perc.lanes)) fail();
  for (const layer of ['bass','chords','arp','pad']) if (!Array.isArray(a[layer].pat)) fail();
  if (!record(e.vol) || !record(e.muted) || !Number.isFinite(e.feel) || e.feel < 0 || e.feel > 1) fail();
  for (const t of doc.project.tracks) {
    if (t.instrument?.style !== a.styleId || JSON.stringify(t.instrument?.sound) !== JSON.stringify(a.sound)) fail();
    if (e.vol[t.layer] !== t.mixer.volume || !!e.muted[t.layer] !== t.mixer.muted) fail();
  }
  return doc;
}

export function parseDocument(text) {
  if (new TextEncoder().encode(text).length > MAX_DOCUMENT_BYTES) throw new Error('工程文件超过 12 MB，当前作品已保留');
  // Reject special object keys before any legacy editor code receives the data.
  const doc = JSON.parse(text, (key, value) => {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail();
    return value;
  });
  return validateDocument(doc);
}
