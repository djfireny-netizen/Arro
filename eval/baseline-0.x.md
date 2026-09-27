# Evaluation baseline: 0.x production version

[English](./baseline-0.x.md) | [简体中文](./baseline-0.x.zh-CN.md)

Recorded on September 27, 2026, using `qwen3.8-max` through music.aitown.me, with a draft and review pass. The planned run contained 20 scenes, but the old per-IP daily quota limited the recorded baseline to the first seven. This file preserves that seven-scene baseline.

Unsupported notation was measured using the 0.x parser. Accidentals written before melody degrees were silently dropped by that version.

| Metric | 0.x baseline |
| --- | --- |
| Recorded sample | 7 songs |
| Both passes completed | 100% |
| Mean generation time | 69 seconds |
| Mean plan duration, before browser extension | 2:00 |
| Duration below 2:30 | 71% |
| Sections with bar counts other than 4/8 | 43% |
| Revision duration claims inconsistent with playback duration | 57% |
| Missing revision notes | 43% |
| Plans with unsupported notation | 100% |
| Harmony groups with lengths other than 4/8 | 14% |
| Distinct forms / sample size | 71% |
| Chorus opening | 0% |
| Sections per song | 9.4 |
| Distinct chords per song | 8.3 |
| Chromatic chord ratio | 23% |
| Choruses containing a tracked common progression | 0% |
| Chorus melody note count | 16.4 |
| Chorus range, semitones | 8.7 |
| Chorus rhythmic self-similarity | 0.91 |
| Chorus mean register above verse, semitones | 4.7 |
| Groove groups | 3.7 |
| Distinct production moves | 6.3 |
| Diagnostic flags per song | 3.3 |

## Individual songs

Scene text and generated titles are retained in their original Chinese to identify the exact evaluation inputs and outputs.

| Scene | Title | Style / key / BPM | Form | Duration | Chord types | Chorus notes / range | Recorded observations |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 深夜一个人开车穿过城市 | 空城巡航 | synthwave Fm 108 | IVPCPVPCPO | 1:56 | 8 | 16/12 | Below 2:30; missing revision notes; six unsupported tokens involving b6/#5; five chords in the pre group |
| 下雨天窗边写作业 | 雨打窗台 | lofi Eb 82 | IVPCPVPCO | 2:32 | 10 | 15/8 | Two-bar outro; missing revision notes; three #4 notes dropped from the chorus |
| 失恋后第一次一个人吃饭 | 一人食 | lofi Db 82 | IVPCPVPCBO | 2:44 | 10 | 20/12 | Two-bar post/outro; revision claims of 3:41/2:58 disagree with duration; unsupported 2m7sus4 chord |
| 夏天傍晚的海边兜风 | 落日航线 | citypop D 112 | IVPCPVPCBCO | 2:09 | 10 | 18/7 | Below 2:30; missing revision notes; unsupported 5/3 and 1/5 inversions |
| 月下江湖，一个人骑马出城 | 月下出城 | trap Ebm 140 | IVPCPVPCO | 1:22 | 7 | 18/9 | Below 2:30; revision claimed 2:44; 19 notes dropped from the chorus hook |
| 毕业那天坐火车离开 | 车窗倒退 | folk D 88 | IVVCPBCO | 1:49 | 6 | 16/8 | Below 2:30; revision claimed 3:16 |
| 周五晚上的地下派对 | 地下脉冲 | afrobeats Ebm 118 | IVPCPVPCO | 1:29 | 7 | 12/5 | Below 2:30; two-bar outro; revision claimed 2:48; several b7 notes dropped |

## Interpretation

Duration arithmetic, section lengths, and notation compatibility were common technical issues. The 1.0 P0 work addressed these by supplying program measurements to the model reviewer, accepting melody accidentals both before and after the degree, and checking duration and bar counts during finalization.

Five of seven arrangements followed variants of an intro–verse–pre-chorus–chorus–post-chorus–verse–pre-chorus–chorus–outro form. None opened with a chorus. This is a descriptive musical observation for listening and future experiments, rather than a rule imposed on the producer model.

The model naturally generated slash-chord inversions such as `5/3`; playback support remained a follow-up item when this baseline was recorded.
