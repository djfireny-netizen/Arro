// Technical contract for model-written plans. Musical choices belong to the producer.
export const CHORD_QUALITIES = ['', 'm', 'maj', 'M', 'maj7', 'M7', 'm7', '7', '9', 'sus4', 'sus2', '7sus4', 'dim', 'dim7', 'm7b5', 'add9', 'madd9', 'm9', 'maj9', '6', 'm6', 'aug'];
export function chordSymbol(token) {
  if (typeof token !== 'string') return null;
  const m = token.trim().match(/^([b#♭♯]?)([1-7])([^/]*?)(?:\/([b#♭♯]?)([1-7]))?$/);
  return m && CHORD_QUALITIES.includes(m[3]) ? { accidental: m[1], degree: +m[2], quality: m[3], bassDegree: m[5] ? +m[5] : null, bassAccidental: m[4] || '' } : null;
}
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
const own = (x, key) => record(x) && Object.hasOwn(x, key);
const styles = new Set('ballad citypop folk dancepop rnb synthwave house futurebass dnb chiptune ambient lofi trap funk reggae afrobeats bossa jazz blues rock guofeng cinematic'.split(' '));
const types = new Set('intro verse pre chorus post bridge outro'.split(' '));
const layers = new Set('drums bass chords melody arp pad perc'.split(' '));
const moves = new Set('fill stop full_stop build drop_first_bar half_time double_octave harmony_vocal counter_line filter_sweep key_up'.split(' '));
export function planIssues(p, { review = false, duration = false } = {}) {
  const issues = [];
  if (!record(p)) return ['方案须为 JSON 对象'];
  for (const k of ['title', 'concept']) if (!text(p[k])) issues.push(`${k} 须为非空字符串`);
  if (!styles.has(p.style)) issues.push('style 须为已定义的风格键名');
  if (typeof p.key !== 'string' || !/^(C|C#|Db|D|D#|Eb|E|F|F#|Gb|G|G#|Ab|A|A#|Bb|B)$/.test(p.key || '')) issues.push('key 须为有效调名');
  if (!['major', 'minor'].includes(p.mode)) issues.push('mode 须为 major 或 minor');
  if (!Number.isInteger(p.bpm) || p.bpm < 60 || p.bpm > 180) issues.push('bpm 须为 60–180 的整数');
  for (const k of ['harmony', 'grooves', 'melodies']) if (!record(p[k])) issues.push(`${k} 须为对象`);
  if (record(p.harmony)) {
    if (!Object.keys(p.harmony).length) issues.push('harmony 须包含和声组');
    for (const [k, v] of Object.entries(p.harmony)) {
      if (!Array.isArray(v) || ![4, 8].includes(v.length)) issues.push(`harmony.${k} 须为 4 或 8 个和弦的数组`);
      else for (const t of v) if (!chordSymbol(t)) issues.push(`harmony.${k} 的和弦 ${JSON.stringify(t)} 须使用支持的级数记法；转位写作 5/7、1m7/b3`);
    }
  }
  if (record(p.grooves)) {
    if (!Object.keys(p.grooves).length) issues.push('grooves 须包含律动组');
    for (const [k, g] of Object.entries(p.grooves)) {
      if (!record(g)) { issues.push(`grooves.${k} 须为对象`); continue; }
      for (const lane of ['kick', 'snare', 'clap', 'hat', 'openhat']) if (typeof g.drums?.[lane] !== 'string' || !/^[xo.]{16}$/.test(g.drums[lane])) issues.push(`grooves.${k}.drums.${lane} 须为 16 个 x/o/. 字符`);
      for (const field of ['bass', 'chords']) {
        if (typeof g[field] !== 'string') { issues.push(`grooves.${k}.${field} 须为字符串`); continue; }
        for (const token of g[field].trim().split(/[\s,]+/).filter(Boolean)) {
          const m = token.match(field === 'bass' ? /^(\d+):(\d+):(R|5|O|3|b7|6)$/i : /^(\d+):(\d+)$/);
          if (!m || +m[1] > 15 || +m[2] < 1 || +m[2] > 16 || +m[1] + +m[2] > 16) issues.push(`grooves.${k}.${field} 的 ${token} 须符合一小节 16 步的记法`);
        }
      }
    }
  }
  const sections = Array.isArray(p.sections) ? p.sections : [];
  if (!Array.isArray(p.sections) || sections.length < 2 || sections.length > 24) issues.push('sections 须为按演奏顺序排列的完整段落数组（2–24 段）');
  const maxSteps = Object.create(null);
  for (const [i, s] of sections.entries()) {
    if (!record(s)) { issues.push(`sections[${i}] 须为对象`); continue; }
    if (!types.has(s.type)) issues.push(`sections[${i}].type 须为已定义的段落类型`);
    if (![4, 8].includes(s.bars)) issues.push(`sections[${i}].bars 须为数字 4 或 8`);
    for (const [k, map] of [['harmony', p.harmony], ['groove', p.grooves]]) if (!text(s[k]) || !own(map, s[k])) issues.push(`sections[${i}].${k} 须引用存在的组`);
    if (s.melody !== 'none' && (!text(s.melody) || !own(p.melodies, s.melody))) issues.push(`sections[${i}].melody 须引用存在的旋律或填 none`);
    if (text(s.melody)) maxSteps[s.melody] = Math.max(maxSteps[s.melody] || 0, s.bars === 8 ? 128 : 64);
    if (!Array.isArray(s.play) || s.play.some(x => !layers.has(x))) issues.push(`sections[${i}].play 须为支持的乐器数组`);
    if (!Array.isArray(s.moves) || s.moves.some(x => !moves.has(x))) issues.push(`sections[${i}].moves 须为支持的制作手法数组，可为空`);
    if (!Number.isFinite(s.energy) || s.energy < 0 || s.energy > 1) issues.push(`sections[${i}].energy 须为 0–1 的数字`);
    if (!text(s.idea)) issues.push(`sections[${i}].idea 须为段落处理说明`);
  }
  if (record(p.melodies)) for (const [k, v] of Object.entries(p.melodies)) {
    if (typeof v !== 'string') { issues.push(`melodies.${k} 须为音符字符串`); continue; }
    for (const token of v.trim().split(/[\s,]+/).filter(Boolean)) {
      const m = token.match(/^(\d+):(\d+):([#b♯♭]?)(-?\d+)([#b♯♭]?)$/);
      if (!m || (m[3] && m[5]) || +m[1] >= (maxSteps[k] || 128) || +m[2] < 1 || +m[2] > 16 || +m[1] + +m[2] > (maxSteps[k] || 128) || +m[4] < -7 || +m[4] > 17) issues.push(`melodies.${k} 的 ${token} 须使用有效的步:长:级数，并在引用段落长度内`);
    }
  }
  if (p.review !== undefined && (!Array.isArray(p.review) || p.review.some(x => !text(x)))) issues.push('review 须为说明字符串的数组');
  if (review && (!Array.isArray(p.review) || p.review.length < 3 || p.review.length > 5 || p.review.some(x => !text(x)))) issues.push('review 须为 3–5 条中文修改说明的数组，说明最终方案实际改了哪里和理由');
  if (duration && Number.isFinite(p.bpm) && p.bpm > 0 && sections.length && sections.every(s => s && [4, 8].includes(s.bars))) {
    const bars = sections.reduce((n, s) => n + s.bars, 0), sec = bars * 240 / p.bpm;
    if (sec < 160 || sec > 210) issues.push(`实际时长为 ${sec.toFixed(1)} 秒（${bars} 小节 × 240 ÷ ${p.bpm}），目标 160–210 秒；请由你决定如何调整编曲或速度并核对最终时长`);
  }
  return issues;
}
