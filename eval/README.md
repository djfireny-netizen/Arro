# 评测

固定 20 个意象（`prompts.json`），每个版本都生成一遍，比较数字，防止质量倒退。

- `metrics.mjs`：从整首方案里测量事实。包括结构（段落、曲式、实际时长）、和声（和弦种类、调外比例、套路进行）、旋律（音数、音域、级进、节奏自相似）、律动、制作手法，以及一致性检查（复审写的时长对不对、有没有程序解析不了的写法）。思路参考 [MusPy](https://github.com/salu133445/muspy)、[mgeval](https://github.com/RichardYang40148/mgeval) 和 [Libretto](https://github.com/Xyc-arch/Libretto)：分轴诊断，不合成单一总分。
- `run.mjs`：依次调用编曲台生成，结果存在 `runs/`（不进 git）。
- `report.mjs`：生成对比报告（Markdown）。

```bash
# 线上跑一轮（在项目文件夹里）
SHIYIN_INVITE=邀请码 node eval/run.mjs https://music.aitown.me v1.0
# 出报告（两个 runs 文件可以互相对比）；0.x 基线见 baseline-0.x.md
node eval/report.mjs eval/runs/2026-09-27-v1.0.json
```

数字只测量事实，不等于好听。报告里的旗标表示"值得去听一下"，最终以试听为准。

注意：交给大模型复审的"程序测量"只包含事实和技术错误（时长、小节数、解析不了的写法），不包含音乐好坏的判断。结构和手法由大模型自己决定。
