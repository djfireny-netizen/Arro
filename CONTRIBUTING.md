# Contributing to Arro

Use English for contributions intended for repository readers: documentation, new code comments, commit messages, issues, and pull requests. The application's interface and generated explanations currently remain in Chinese. Chinese documentation is available from the language links in the README and deployment guide.

## Development workflow

1. Read the [README](./README.md) and the relevant source files.
2. Run `node test/regress.mjs "$PWD"` before and after code changes. The suite uses Playwright and a mock model.
3. Keep changes focused and describe the behavior they change, their motivation, and validation performed.
4. For changes to generation, compare the fixed evaluation scenes and preserve failed attempts in the results. Record the model, generation settings, and source revision.

When using an external Playwright installation, set `PLAYWRIGHT_MJS` to its absolute `index.mjs` path. Evaluation results belong in `eval/runs/`, which is excluded from Git; publish a reviewed report separately when needed.

## Musical decisions

The model acts as the producer. It chooses form, harmony, motifs, and production techniques in response to the scene. Program measurements supplied to the reviewer should describe facts and technical errors, such as duration, bar counts, and unsupported notation.

Evaluate creative changes by listening as well as measuring. A metric is a diagnostic signal, not a substitute for musical judgment. Compare prompt languages using equivalent instructions, the same scenes, and the same generation settings.

## Credentials and licenses

Keep `.env`, invitation codes, API keys, evaluation credentials, and private deployment configuration out of commits and shared logs. Use `.env.example` and `deploy/config.example.sh` for documented placeholders.

Code is licensed under [GNU AGPL-3.0](./LICENSE). Instrument samples retain their individual licenses and attribution requirements in [samples/CREDITS.md](./samples/CREDITS.md). Preserve the application's AI-generated content labels in derivatives and exports.
