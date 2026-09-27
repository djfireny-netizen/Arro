# Arro

[English](./README.md) | [简体中文](./README.zh-CN.md)

**Describe a scene, get a full arrangement.** An LLM acts as the producer: it writes the song's form, harmony, grooves, melodies, and production moves, then reviews and revises its draft. Shape the result with the arrangement controls and export MIDI or audio to continue working in your DAW.

The application currently has a Chinese interface and runs on Node.js 18 or later. The [hosted version](https://music.aitown.me) requires an invitation code.

## What you can make

- **Full-song arrangements.** The model chooses sections and their musical treatment, with an explanation of each section's role.
- **Layer-by-layer adjustments.** Regenerate, lock, or mute drums, bass, chords, melody, arpeggios, pads, percussion, and effects. These immediate adjustments use the local arrangement engine.
- **DAW exports.** Export full-song and per-track MIDI, four-bar MIDI loops, chord charts, full-song WAV, WAV stems, and a Suno adaptation guide. MIDI includes key signatures, chord names, section markers, and swing timing.
- **Sound shaping.** Adjust key, brightness, energy, melodic complexity, harmonic richness, swing, and space. Section energy can be adjusted individually.
- **Local history.** Undo and redo changes, star versions, and return to previous arrangements stored in the current browser.

### Styles and instruments

Choose a style or let the model infer one from your scene:

| Group | Styles |
| --- | --- |
| Pop | Ballad, City Pop, folk, dance pop, R&B |
| Electronic | Synthwave, house, future bass, drum & bass, chiptune, ambient, lo-fi |
| Rhythm | Trap, funk, reggae, afrobeats, bossa nova |
| Instrumental | Jazz, blues, rock, Chinese-inspired music, cinematic |

The sound engine combines 30 sampled instruments with Web Audio synthesis. Samples are loaded as needed for each style. The master bus includes EQ, compression, and limiting. See [sample credits and licenses](./samples/CREDITS.md).

## How generation works

1. **Draft:** the model writes a complete JSON arrangement: sections, harmony, grooves, melodies, instrumentation, and production decisions.
2. **Review:** a second model call reviews and revises that arrangement. Program measurements provide facts such as duration, bar counts, and unsupported notation.
3. **Playback and export:** the browser interprets the plan, applies its playback constraints and fallbacks, and renders the arrangement.

Musical structure and creative decisions belong to the model. Measurements supplied to the reviewer describe technical facts. The requested duration is 2:40–3:30; actual adherence is measured by the evaluation suite. The browser currently attempts to extend short plans by adding sections.

The interface shows the producer's concept and revision notes. Two-pass generation typically takes one or two minutes, depending on the model and service. Set `ARRANGE_PASSES=1` for a single draft, or `ARRANGE_MODE=loop` for the older four-bar workflow. Local controls and alternative arrangements respond without an API call.

## Run locally

Install Node.js 18 or later, then clone the repository:

```bash
git clone https://github.com/djfireny-netizen/Arro.git
cd Arro
cp .env.example .env
```

Edit `.env` locally and select a provider. For Qwen, configure `DASHSCOPE_API_KEY`. Keep credentials in `.env`; it is excluded from Git.

```bash
node server.mjs
```

Open [localhost:5178](http://localhost:5178). To try the complete workflow with a fixed demo arrangement, set `PROVIDER=mock` in `.env`.

You can also open `index.html` directly to try the local arrangement engine. Browser restrictions on local sample loading may cause it to use synthesized sounds. Running the local server enables sample loading.

### Model providers

Set `PROVIDER` in `.env` and restart the server:

| Provider | Required credential or setting | Default model |
| --- | --- | --- |
| `qwen` | `DASHSCOPE_API_KEY` | `qwen-plus`; override with `QWEN_MODEL` |
| `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-chat`; override with `DEEPSEEK_MODEL` |
| `doubao` | `ARK_API_KEY`, `DOUBAO_MODEL` | Configure a model or endpoint ID |
| `mock` | None | Fixed demo arrangement |

API credentials remain on the server. They are not sent to the browser. Generation prompts currently remain in Chinese; their language is evaluated independently from the documentation language.

## Tests and evaluation

The browser regression suite uses a mock model and does not consume model credits. Install Playwright in your development environment and its Chromium browser, then run:

```bash
node test/regress.mjs "$PWD"
```

Passing the repository path explicitly supports directories whose names contain non-ASCII characters. If Playwright is installed outside the project, set `PLAYWRIGHT_MJS` to its absolute `index.mjs` path.

The evaluation suite runs the same 20 scenes for each version. In Bash, enter the invitation code without displaying it or putting its value in shell history:

```bash
read -r -s -p 'Invitation code: ' SHIYIN_INVITE
printf '\n'
export SHIYIN_INVITE
node eval/run.mjs https://your-app.example.com version-label
unset SHIYIN_INVITE
node eval/report.mjs eval/runs/YYYY-MM-DD-version-label.json
```

The runner reads `EVAL_TOKEN` from the local `.env` when needed. It bypasses the per-IP daily quota, while the site-wide quota still applies. Results are written to `eval/runs/`, which is excluded from Git. Use a unique label for each run because the same date and label reuse the same output filename.

Measurements cover duration, structure, harmony, melody, grooves, and notation compatibility. They do not produce a single musical quality score; listening remains necessary. See [evaluation notes](./eval/README.md) and the [0.x baseline](./eval/baseline-0.x.md), currently in Chinese.

## Deployment and contribution

See [deployment instructions](./DEPLOY.md) for Linux, Nginx, HTTPS, invitation codes, quotas, and Git push deployment with automatic rollback. See [contribution guidelines](./CONTRIBUTING.md) for the development workflow.

| Path | Purpose |
| --- | --- |
| `index.html` | Interface, arrangement engine, synthesis, playback, and export |
| `server.mjs` | HTTP service, authentication, quotas, and asynchronous generation jobs |
| `ai.mjs` | Model providers, prompts, draft generation, and review |
| `samples/` | Instrument samples and attribution |
| `deploy/` | Deployment scripts, Nginx configuration, and systemd service |
| `eval/` | Fixed scenes, measurements, evaluation runner, and reports |
| `test/` | Browser regression suite |
| `site/` | Public website |

## AI-generated content labels

The interface identifies AI-generated arrangements. Exported WAV files contain AIGC metadata in their `LIST/INFO` chunks and an audible short-long / short-short marker at the end, spelling “AI” in Morse code. MIDI files include a text notice and AIGC metadata; export archives include a labeling notice.

These features were implemented for the project's AI-generated content labeling requirements, including GB 45438-2025. Preserve the labels when extending or redistributing the application.

## Licensing

- **Code:** [GNU AGPL-3.0](./LICENSE). See the license for distribution, modification, and network source availability requirements.
- **Instrument samples:** retain their individual licenses, including CC BY 3.0 and CC BY-SA 4.0. See [credits](./samples/CREDITS.md) for attribution and terms.
- **Website content:** the text and visual design in `site/` belong to aitown.me. Replace this content with your own when reusing the project for another website.

## References

The evaluation and generate–measure–revise workflow draws on ideas from [Libretto](https://github.com/Xyc-arch/Libretto), [MusPy](https://github.com/salu133445/muspy), and [mgeval](https://github.com/RichardYang40148/mgeval).
