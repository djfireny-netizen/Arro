// Generate a report: node eval/report.mjs eval/runs/new.json [eval/runs/baseline.json]
// The optional second file enables a metric-by-metric comparison with a baseline.
import { readFileSync, writeFileSync } from 'node:fs';
import { measure, flags, fmt } from './metrics.mjs';

const load = f => JSON.parse(readFileSync(f, 'utf8'));
function summarize(runs) {
  const ok = runs.filter(r => r.status === 'done' && r.plan);
  const ms = ok.map(r => ({ mood: r.mood, sec: Math.round(r.ms / 1000), m: measure(r.plan) }));
  ms.forEach(x => x.f = flags(x.m));
  const avg = fn => { const v = ms.map(fn).filter(x => typeof x === 'number' && isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };
  const rate = fn => ms.length ? ms.filter(fn).length / ms.length : NaN;
  const styles = new Set(ms.map(x => x.m.style)).size, forms = new Set(ms.map(x => x.m.structure.form)).size;
  return {
    ms, n: runs.length, ok: ok.length,
    rows: [
      ['Success rate', ok.length / (runs.length || 1), 'pct'],
      ['Both passes completed (passes=2)', rate(x => x.m.passes >= 2), 'pct'],
      ['Mean generation time (seconds)', avg(x => x.sec), 'n0'],
      ['Mean playback duration', avg(x => x.m.structure.playedSec), 'time'],
      ['Duration < 2:30 (needs extension)', rate(x => x.m.structure.playedSec < 150), 'pct'],
      ['Sections with bar counts other than 4/8', rate(x => x.m.structure.barsNot4or8.length > 0), 'pct'],
      ['Review duration claim mismatch (raw detector)', rate(x => x.m.consistency.reviewClaimOff > 0), 'pct'],
      ['Missing review change notes', rate(x => x.m.consistency.reviewMissing), 'pct'],
      ['Unparseable notation (inaudible)', rate(x => x.m.consistency.badTokens.length > 0), 'pct'],
      ['Harmony groups with lengths other than 4/8', rate(x => x.m.consistency.harmOddLen.length > 0), 'pct'],
      ['Structure: distinct forms / successful samples', forms / (ms.length || 1), 'pct'],
      ['Number of styles used', styles, 'n0'],
      ['Songs opening with a chorus', rate(x => x.m.structure.startsWithChorus), 'pct'],
      ['Sections per song', avg(x => x.m.structure.sections), 'n1'],
      ['Distinct chords per song', avg(x => x.m.harmony.uniqueChords), 'n1'],
      ['Chords in the chorus', avg(x => x.m.harmony.chorusChords), 'n1'],
      ['Chromatic chord ratio', avg(x => x.m.harmony.chromaticRatio), 'pct'],
      ['Chorus contains a common progression', rate(x => x.m.harmony.cliche.length > 0), 'pct'],
      ['Chorus melody notes', avg(x => x.m.melody.chorus?.notes), 'n1'],
      ['Chorus range (semitones)', avg(x => x.m.melody.chorus?.range), 'n1'],
      ['Chorus stepwise motion ratio', avg(x => x.m.melody.chorus?.stepRatio), 'pct'],
      ['Chorus rhythm self-similarity (motif indicator)', avg(x => x.m.melody.chorus?.rhythmSelfSim), 'n2'],
      ['Chorus above verse (semitones)', avg(x => x.m.melody.chorusAboveVerse), 'n1'],
      ['Groove groups', avg(x => x.m.groove.count), 'n1'],
      ['Distinct production moves', avg(x => x.m.production.distinctMoves), 'n1'],
      ['Diagnostic flags per song', avg(x => x.f.length), 'n1']
    ]
  };
}
const show = (v, t) => !isFinite(v) ? '—' : t === 'pct' ? Math.round(v * 100) + '%' : t === 'time' ? fmt(v) : t === 'n0' ? String(Math.round(v)) : v.toFixed(t === 'n2' ? 2 : 1);

const [, , fNew, fOld] = process.argv;
if (!fNew) { console.log('Usage: node eval/report.mjs new.json [baseline.json]'); process.exit(1); }
const A = summarize(load(fNew).runs), B = fOld ? summarize(load(fOld).runs) : null;
let md = `# Arro Evaluation Report\n\nSamples: ${fNew}（${A.ok}/${A.n} succeeded）${B ? `; Baseline: ${fOld}（${B.ok}/${B.n}）` : ''}\n\n`;
md += `| Metric | ${B ? 'Baseline | ' : ''}Current |\n|---|${B ? '---|' : ''}---|\n`;
A.rows.forEach((r, i) => { md += `| ${r[0]} | ${B ? show(B.rows[i][1], B.rows[i][2]) + ' | ' : ''}${show(r[1], r[2])} |\n`; });
md += `\n## Per-song results\n\n| Scene | Title | Style | Form | Duration | Distinct chords | Chorus notes/range | Diagnostics |\n|---|---|---|---|---|---|---|---|\n`;
for (const x of A.ms) {
  const c = x.m.melody.chorus;
  md += `| ${x.mood} | ${x.m.title || ''} | ${x.m.style} ${x.m.key} ${x.m.bpm} | ${x.m.structure.form} | ${fmt(x.m.structure.playedSec)} | ${x.m.harmony.uniqueChords} | ${c ? c.notes + '/' + c.range : '—'} | ${x.f.join('；') || '—'} |\n`;
}
const fails = load(fNew).runs.filter(r => r.status !== 'done');
if (fails.length) md += `\n## Failures\n\n` + fails.map(r => `- ${r.mood}：${r.error || r.status}`).join('\n') + '\n';
md += `\n> Measurements describe observable properties, not musical quality. Flags identify details worth listening to; listening remains the final check.\n`;
const out = fNew.replace(/\.json$/, '.md');
writeFileSync(out, md);
console.log(md);
