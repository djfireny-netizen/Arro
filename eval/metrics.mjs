// Arro evaluation metrics.
// Input: a full-song plan JSON. Output: comparable measurements and diagnostic flags.
// Inspired by MusPy/mgeval measurements and Libretto's separate diagnostic axes rather than a single total score.
// Measure facts; flag thresholds suggest review, while listening determines musical quality.

const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const MOVES = ['fill', 'stop', 'full_stop', 'build', 'drop_first_bar', 'half_time', 'double_octave', 'harmony_vocal', 'counter_line', 'filter_sweep', 'key_up'];

// Playback bar-count rules, kept aligned with index.html fromSongPlan.
export const playedBars = b => (+b === 8 ? 8 : 4);

export function fmt(sec) { sec = Math.round(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }

function parseNotes(str) {
  const out = [];
  for (const t of String(str || '').trim().split(/[\s,]+/)) {
    const m = t.match(/^(\d+):(\d+):([#b♯♭]?)(-?\d+)([#b♯♭]?)$/); if (!m || (m[3] && m[5])) continue;
    const ac = m[3] || m[5];
    out.push({ step: +m[1], len: +m[2], deg: +m[4], acc: ac ? (/[#♯]/.test(ac) ? 1 : -1) : 0 });
  }
  return out.sort((a, b) => a.step - b.step);
}
const semi = (n, mode) => { const d = n.deg - 1, sc = SCALE[mode] || SCALE.major; return sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7) + n.acc; };
const entropy = arr => { const c = {}; arr.forEach(x => c[x] = (c[x] || 0) + 1); const n = arr.length || 1; return -Object.values(c).reduce((s, k) => s + (k / n) * Math.log2(k / n), 0); };
const chordRoot = tok => { const m = String(tok).trim().match(/^([b#♭♯]?)([1-7])(.*)$/); return m ? { acc: m[1] ? 1 : 0, deg: +m[2], q: m[3].trim() } : null; };

// Extract review duration claims written as Chinese minute/second phrases or m:ss.
export function claimedDurations(review) {
  const out = [];
  for (const line of review || []) {
    for (const m of String(line).matchAll(/(\d)\s*分\s*(\d{1,2})\s*秒|(\d):(\d{2})/g)) {
      const s = m[1] ? +m[1] * 60 + +m[2] : +m[3] * 60 + +m[4];
      if (s >= 60 && s <= 600) out.push(s);
    }
  }
  return out;
}

function melodyStats(str, mode) {
  const ns = parseNotes(str);
  if (!ns.length) return null;
  const span = Math.max(64, Math.ceil((ns[ns.length - 1].step + 1) / 64) * 64);
  const p = ns.map(n => semi(n, mode));
  const iv = p.slice(1).map((x, i) => x - p[i]);
  const covered = new Set(); ns.forEach(n => { for (let s = n.step; s < n.step + n.len && s < span; s++) covered.add(s); });
  // Rhythmic self-similarity: Jaccard overlap of note-onset sets in two-bar (32-step) windows.
  const segs = []; for (let b = 0; b < span; b += 32) segs.push(new Set(ns.filter(n => n.step >= b && n.step < b + 32).map(n => n.step - b)));
  let rep = 0, pairs = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const A = segs[i], B = segs[j]; if (!A.size && !B.size) continue;
    const inter = [...A].filter(x => B.has(x)).length, uni = new Set([...A, ...B]).size;
    rep += inter / uni; pairs++;
  }
  // Repeated interval trigrams indicate recurring motif shapes.
  const grams = {}; for (let i = 0; i + 2 < iv.length; i++) { const k = iv.slice(i, i + 3).join(','); grams[k] = (grams[k] || 0) + 1; }
  const motifRepeats = Object.values(grams).filter(c => c > 1).reduce((s, c) => s + c, 0);
  const onBeat = ns.filter(n => n.step % 4 === 0).length;
  return {
    notes: ns.length, bars: span / 16, range: Math.max(...p) - Math.min(...p), meanPitch: p.reduce((s, x) => s + x, 0) / p.length,
    pcEntropy: +entropy(p.map(x => ((x % 12) + 12) % 12)).toFixed(2),
    stepRatio: iv.length ? +(iv.filter(x => Math.abs(x) <= 2).length / iv.length).toFixed(2) : 0,
    leapRatio: iv.length ? +(iv.filter(x => Math.abs(x) >= 5).length / iv.length).toFixed(2) : 0,
    restRatio: +(1 - covered.size / span).toFixed(2),
    density: +(ns.length / (span / 16)).toFixed(2),
    rhythmSelfSim: pairs ? +(rep / pairs).toFixed(2) : 0,
    motifRepeats, onBeatRatio: +(onBeat / ns.length).toFixed(2), chromatic: ns.filter(n => n.acc).length
  };
}

export function measure(plan) {
  const mode = plan.mode === 'minor' ? 'minor' : 'major', bpm = +plan.bpm || 100;
  const secs = Array.isArray(plan.sections) ? plan.sections : [];
  const barSec = 240 / bpm;
  const writtenBars = secs.reduce((s, x) => s + (+x.bars || 0), 0);
  const played = secs.reduce((s, x) => s + playedBars(x.bars), 0);
  const odd = secs.filter(x => ![4, 8].includes(+x.bars)).map(x => `${x.type}:${x.bars}`);
  const H = plan.harmony || {}, M = plan.melodies || {}, G = plan.grooves || {};
  const allTok = Object.values(H).flat().map(String);
  const chorusSec = secs.find(x => x.type === 'chorus') || {};
  const chorusHarm = H[chorusSec.harmony] || H.chorus || [];
  const degSeq = chorusHarm.map(t => { const r = chordRoot(t); return r && !r.acc ? r.deg : 0; }).join('');
  const CLICHE = ['1564', '6415', '1645', '4156', '5641'];
  const halfSame = chorusHarm.length === 8 && chorusHarm.slice(0, 4).join() === chorusHarm.slice(4).join();
  const cm = melodyStats(M[chorusSec.melody] || M.chorus, mode);
  const verseSec = secs.find(x => x.type === 'verse') || {};
  const vm = melodyStats(M[verseSec.melody] || M.verse, mode);
  const refsMissing = secs.flatMap(x => [
    x.harmony && !H[x.harmony] ? `harmony:${x.harmony}` : null,
    x.groove && !G[x.groove] ? `groove:${x.groove}` : null,
    x.melody && x.melody !== 'none' && !M[x.melody] ? `melody:${x.melody}` : null
  ]).filter(Boolean);
  const moves = secs.flatMap(x => x.moves || []);
  const kicks = Object.values(G).map(g => String(g?.drums?.kick || '').replace(/[^xo]/g, '').length);
  const claims = claimedDurations(plan.review);
  // Unsupported notation can be skipped or simplified by the browser instead of performed as written.
  const badTok = [];
  for (const [k, v] of Object.entries(M)) for (const t of String(v || '').trim().split(/[\s,]+/).filter(Boolean)) if (!/^\d+:\d+:([#b♯♭]?-?\d+|-?\d+[#b♯♭])$/.test(t)) badTok.push(`melody.${k}:${t}`);
  for (const [k, g] of Object.entries(G)) {
    for (const t of String(g?.bass || '').trim().split(/[\s,]+/).filter(Boolean)) if (!/^\d+:\d+:(R|5|O|3|b7|6)$/i.test(t)) badTok.push(`bass.${k}:${t}`);
    for (const t of String(g?.chords || '').trim().split(/[\s,]+/).filter(Boolean)) if (!/^\d+:\d+$/.test(t)) badTok.push(`chords.${k}:${t}`);
  }
  const QUAL = ['', 'm', 'maj', 'M', 'maj7', 'M7', 'm7', '7', '9', 'sus4', 'sus2', '7sus4', 'dim', 'dim7', 'm7b5', 'add9', 'madd9', 'm9', 'maj9', '6', 'm6', 'aug'];
  for (const [k, v] of Object.entries(H)) for (const t of v || []) { const r = chordRoot(t); if (!r || !QUAL.includes(r.q)) badTok.push(`harmony.${k}:${t}`); }
  const harmOddLen = Object.entries(H).filter(([, v]) => !Array.isArray(v) || ![4, 8].includes(v.length)).map(([k, v]) => `${k}:${Array.isArray(v) ? v.length : 0}`);
  const playedSec = played * barSec;
  const energies = secs.map(x => +x.energy || 0);
  return {
    title: plan.title, style: plan.style, key: `${plan.key}${mode === 'minor' ? 'm' : ''}`, bpm, passes: plan.passes || 1,
    structure: {
      sections: secs.length, types: new Set(secs.map(x => x.type)).size, form: secs.map(x => (x.type || '?')[0].toUpperCase()).join(''),
      startsWithChorus: secs[0]?.type === 'chorus', writtenBars, playedBars: played,
      writtenSec: Math.round(writtenBars * barSec), playedSec: Math.round(playedSec), barsNot4or8: odd,
      energyRange: +(Math.max(...energies, 0) - Math.min(...energies, 1)).toFixed(2)
    },
    harmony: {
      groups: Object.keys(H).length, uniqueChords: new Set(allTok).size, chorusChords: chorusHarm.length, chorusHalfRepeat: halfSame,
      chromaticRatio: allTok.length ? +(allTok.filter(t => /^[b#♭♯]/.test(t)).length / allTok.length).toFixed(2) : 0,
      extRatio: allTok.length ? +(allTok.filter(t => /(7|9|sus|add|6)/.test(t.replace(/^[b#♭♯]?[1-7]/, ''))).length / allTok.length).toFixed(2) : 0,
      cliche: CLICHE.filter(c => degSeq.includes(c))
    },
    melody: { chorus: cm, verse: vm, chorusAboveVerse: cm && vm ? +(cm.meanPitch - vm.meanPitch).toFixed(1) : null },
    groove: { count: Object.keys(G).length, distinctKick: new Set(Object.values(G).map(g => g?.drums?.kick)).size, avgKickHits: kicks.length ? +(kicks.reduce((s, x) => s + x, 0) / kicks.length).toFixed(1) : 0 },
    production: { distinctMoves: new Set(moves).size, keyUps: moves.filter(m => m === 'key_up').length, unknownMoves: moves.filter(m => !MOVES.includes(m)) },
    consistency: { refsMissing, reviewClaimsSec: claims, reviewClaimOff: claims.filter(s => Math.abs(s - playedSec) > 15).length,
      reviewMissing: (plan.passes || 1) >= 2 && !(Array.isArray(plan.review) && plan.review.length), badTokens: badTok, harmOddLen }
  };
}

// Diagnostic flags identify passages worth listening to.
export function flags(m) {
  const f = [];
  if (m.structure.playedSec < 150) f.push('时长<2:30（网页会补段落）');
  if (m.structure.barsNot4or8.length) f.push('段落小节数不是 4/8：' + m.structure.barsNot4or8.join(','));
  if (m.consistency.reviewClaimOff) f.push('复审里写的时长和实际不符');
  if (m.consistency.refsMissing.length) f.push('引用了不存在的：' + m.consistency.refsMissing.join(','));
  if (m.harmony.uniqueChords <= 4) f.push('全曲和弦种类≤4');
  if (m.harmony.chorusHalfRepeat) f.push('副歌 8 和弦前后两半完全相同');
  if (m.harmony.cliche.length) f.push('副歌含常见套路进行 ' + m.harmony.cliche.join('/'));
  if (m.melody.chorus && m.melody.chorus.range > 16) f.push('副歌音域>十度');
  if (m.melody.chorus && m.melody.chorus.rhythmSelfSim < 0.15) f.push('副歌节奏几乎不重复（动机弱）');
  if (m.melody.chorusAboveVerse != null && m.melody.chorusAboveVerse <= 0) f.push('副歌音区不高于主歌');
  if (m.groove.distinctKick <= 1) f.push('全曲只有一种底鼓型');
  if (m.production.unknownMoves.length) f.push('未知手法：' + m.production.unknownMoves.join(','));
  if (m.passes < 2) f.push('复审失败，只有初稿');
  if (m.consistency.reviewMissing) f.push('复审没有写改了什么');
  if (m.consistency.badTokens.length) f.push(`有 ${m.consistency.badTokens.length} 处写法程序解析不了（会听不到）：` + m.consistency.badTokens.slice(0, 4).join(' '));
  if (m.consistency.harmOddLen.length) f.push('和声组不是 4/8 个和弦：' + m.consistency.harmOddLen.join(','));
  return f;
}
