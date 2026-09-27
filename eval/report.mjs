// 生成评测报告：node eval/report.mjs eval/runs/新.json [eval/runs/旧.json]
// 第二个文件可选：给出时和它逐项对比（比如新版本 vs 基线）
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
      ['成功率', ok.length / (runs.length || 1), 'pct'],
      ['两轮都成功（passes=2）', rate(x => x.m.passes >= 2), 'pct'],
      ['平均生成用时（秒）', avg(x => x.sec), 'n0'],
      ['实际时长（均值）', avg(x => x.m.structure.playedSec), 'time'],
      ['时长 < 2:30 需补段落', rate(x => x.m.structure.playedSec < 150), 'pct'],
      ['段落小节数不是 4/8', rate(x => x.m.structure.barsNot4or8.length > 0), 'pct'],
      ['复审写的时长与实际不符', rate(x => x.m.consistency.reviewClaimOff > 0), 'pct'],
      ['复审没写改了什么', rate(x => x.m.consistency.reviewMissing), 'pct'],
      ['含解析不了的写法（听不到）', rate(x => x.m.consistency.badTokens.length > 0), 'pct'],
      ['和声组不是 4/8 个和弦', rate(x => x.m.consistency.harmOddLen.length > 0), 'pct'],
      ['结构：不同曲式数 / 样本数', forms / (ms.length || 1), 'pct'],
      ['风格：用到的风格数', styles, 'n0'],
      ['副歌开场的比例', rate(x => x.m.structure.startsWithChorus), 'pct'],
      ['每首段落数', avg(x => x.m.structure.sections), 'n1'],
      ['全曲和弦种类', avg(x => x.m.harmony.uniqueChords), 'n1'],
      ['副歌和弦数', avg(x => x.m.harmony.chorusChords), 'n1'],
      ['调外和弦比例', avg(x => x.m.harmony.chromaticRatio), 'pct'],
      ['副歌含常见套路进行', rate(x => x.m.harmony.cliche.length > 0), 'pct'],
      ['副歌旋律音数', avg(x => x.m.melody.chorus?.notes), 'n1'],
      ['副歌音域（半音）', avg(x => x.m.melody.chorus?.range), 'n1'],
      ['副歌级进比例', avg(x => x.m.melody.chorus?.stepRatio), 'pct'],
      ['副歌节奏自相似（动机感）', avg(x => x.m.melody.chorus?.rhythmSelfSim), 'n2'],
      ['副歌比主歌高（半音）', avg(x => x.m.melody.chorusAboveVerse), 'n1'],
      ['律动组数', avg(x => x.m.groove.count), 'n1'],
      ['用到的制作手法种类', avg(x => x.m.production.distinctMoves), 'n1'],
      ['每首诊断旗标数', avg(x => x.f.length), 'n1']
    ]
  };
}
const show = (v, t) => !isFinite(v) ? '—' : t === 'pct' ? Math.round(v * 100) + '%' : t === 'time' ? fmt(v) : t === 'n0' ? String(Math.round(v)) : v.toFixed(t === 'n2' ? 2 : 1);

const [, , fNew, fOld] = process.argv;
if (!fNew) { console.log('用法：node eval/report.mjs 新.json [旧.json]'); process.exit(1); }
const A = summarize(load(fNew).runs), B = fOld ? summarize(load(fOld).runs) : null;
let md = `# 编曲台评测报告\n\n样本：${fNew}（${A.ok}/${A.n} 首成功）${B ? `；对比：${fOld}（${B.ok}/${B.n}）` : ''}\n\n`;
md += `| 指标 | ${B ? '对比版本 | ' : ''}本版本 |\n|---|${B ? '---|' : ''}---|\n`;
A.rows.forEach((r, i) => { md += `| ${r[0]} | ${B ? show(B.rows[i][1], B.rows[i][2]) + ' | ' : ''}${show(r[1], r[2])} |\n`; });
md += `\n## 逐首\n\n| 意象 | 歌名 | 风格 | 曲式 | 时长 | 和弦种类 | 副歌音数/音域 | 诊断 |\n|---|---|---|---|---|---|---|---|\n`;
for (const x of A.ms) {
  const c = x.m.melody.chorus;
  md += `| ${x.mood} | ${x.m.title || ''} | ${x.m.style} ${x.m.key} ${x.m.bpm} | ${x.m.structure.form} | ${fmt(x.m.structure.playedSec)} | ${x.m.harmony.uniqueChords} | ${c ? c.notes + '/' + c.range : '—'} | ${x.f.join('；') || '—'} |\n`;
}
const fails = load(fNew).runs.filter(r => r.status !== 'done');
if (fails.length) md += `\n## 失败\n\n` + fails.map(r => `- ${r.mood}：${r.error || r.status}`).join('\n') + '\n';
md += `\n> 数字只测量事实，不直接等于好听。旗标是"值得去听一下"的提示，最终以试听为准。\n`;
const out = fNew.replace(/\.json$/, '.md');
writeFileSync(out, md);
console.log(md);
