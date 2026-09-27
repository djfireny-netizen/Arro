# Evaluation

[English](./README.md) | [简体中文](./README.zh-CN.md)

Each version is evaluated against the same 20 scenes in `prompts.json`. The scenes remain in Chinese so that comparisons use identical inputs.

- `metrics.mjs` measures structure, harmony, melody, grooves, production moves, and consistency. It reports separate diagnostic axes instead of a single musical quality score, drawing on ideas from [MusPy](https://github.com/salu133445/muspy), [mgeval](https://github.com/RichardYang40148/mgeval), and [Libretto](https://github.com/Xyc-arch/Libretto).
- `run.mjs` generates arrangements sequentially and saves results under `runs/`, which is excluded from Git.
- `report.mjs` writes a Markdown report, optionally comparing two result files.

## Run an evaluation

In Bash, from the repository directory:

```bash
read -r -s -p 'Invitation code: ' SHIYIN_INVITE
printf '\n'
export SHIYIN_INVITE
node eval/run.mjs https://your-app.example.com version-label
unset SHIYIN_INVITE
node eval/report.mjs eval/runs/YYYY-MM-DD-version-label.json
```

The runner reads `EVAL_TOKEN` from the local `.env` unless it is already in the environment. Evaluation requests bypass the per-IP daily quota, but still respect the site-wide quota and concurrency limit. Enter invitation codes yourself and keep all credentials out of logs and commits.

Use a unique label for every run; the date and label determine the result filename. Run one evaluation at a time and keep the deployed source revision fixed throughout the run. Service restarts clear in-memory jobs.

To compare saved runs:

```bash
node eval/report.mjs eval/runs/new.json eval/runs/baseline.json
```

## Interpret the results

The [0.x baseline](./baseline-0.x.md) contains only seven scenes because its run reached the old quota. Compare matching scenes separately from a new full 20-scene run. Retain failed attempts when calculating generation success rates; musical metrics describe the successfully returned plans.

Duration measurements in `metrics.mjs` describe the returned plan before the browser adds fallback sections. Inspect actual browser parsing when assessing final playback duration. Unsupported notation flags indicate output the browser cannot interpret as written; some tokens are skipped, while unsupported chord qualities may be simplified.

The current duration-claim detector treats every time expression in revision notes as a claim. Target ranges and references to a draft's old duration can therefore create false positives. Keep raw report counts and inspect those notes before drawing conclusions about incorrect final-duration claims.

Measurements are factual diagnostics. Listening is required to judge musical quality. The program measurements sent to the model reviewer contain technical facts and errors; musical structure and production decisions remain the model's responsibility. Chinese diagnostic text is retained where it is also part of the production review context.
