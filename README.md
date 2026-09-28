![ARRO](./site/brand/arro-wordmark-v4.svg)

# ARRO

[English](./README.md) | [简体中文](./README.zh-CN.md)

**Describe a scene, get a full arrangement.** An LLM acts as the producer: it writes the song's form, harmony, grooves, melodies, and production moves, with an optional user-requested revision after listening. Shape the result with the arrangement controls and export MIDI or audio to continue working in your DAW.

ARRO 1.1 has a Chinese interface and runs on Node.js 20 or later. The [hosted version](https://music.aitown.me) requires an invitation code.

## What you can make

- **Full-song arrangements.** The model chooses sections and their musical treatment, with an explanation of each section's role.
- **Layer-by-layer adjustments.** Regenerate, lock, or mute drums, bass, chords, melody, arpeggios, pads, percussion, and effects. These immediate adjustments use the local arrangement engine.
- **DAW exports.** Export full-song and per-track MIDI, four-bar MIDI loops, chord charts, full-song WAV, WAV stems, and a Suno adaptation guide. MIDI includes key signatures, chord names, section markers, and swing timing.
- **Production direction.** For faithful AI projects, key/brightness/energy/melody/harmony controls describe the next generation. Current-part changes use explicit note edits or scoped revision. Swing, humanization, mixer volume, and mute affect playback.
- **Persistent projects.** Autosave the current project and recent undo/redo in IndexedDB, open/download `.arro.json` files, and retain named/starred versions. Old localStorage versions migrate automatically.
- **Scoped AI revision.** Select one section and a pitched track, describe a change, compare original/candidate audio in the full section or with the target soloed, then accept or discard. The producer receives current notes, including manual edits.
- **Note and drum editing.** Add, move, resize, change velocity, or delete notes. Edit drum/percussion steps and loop the selected section. Every accepted edit reaches full-song playback and MIDI export.

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
2. **Technical validation:** the program checks the returned plan and allows at most one targeted repair. Musical revision is optional: use “再打磨一次” after listening, with an optional direction. The current version is preserved in history.
3. **Playback and export:** new plans preserve explicit rests, zero values, sparse/chromatic notes, simultaneous notes, and overlapping durations. ProjectV2 stores realized events as the source for full-song playback and export. Existing projects retain their previous execution version.

Musical structure and creative decisions belong to the model. Measurements supplied to the reviewer describe technical facts. The requested duration is 2:40–3:30; actual adherence is measured by the evaluation suite. The browser preserves the model's section order and reports duration mismatches. Each model pass has at most one targeted technical repair, within a shared 450-second generation deadline. A revision counts as complete only when its full schema, 3–5 change notes, and 160–210-second duration pass validation; otherwise the validated draft is returned with an explicit fallback status. Slash chords such as `5/7` retain their specified bass pitches in playback and MIDI.

The default is one musical pass (`ARRANGE_PASSES=1`). Scoped revision uses an English producer prompt, one musical pass, and technical output validation. It replaces one pitched clip only after acceptance, as a single undoable action. Results that arrive after editing are retained as separate named versions. The old whole-song refinement still uses its initial plan and is disabled after clip edits. `ARRANGE_MODE=loop` retains the older four-bar workflow.

Generation jobs are deduplicated by request identity, owned by the authenticated browser session, and journaled privately for 24 hours. The recent-task recovery control can retrieve existing results as separate versions after a reload, without another model call. Restarted interrupted jobs report an unknown completion state instead of automatically submitting another paid request. A generation failure preserves current work; local composition is an explicit alternative.

The selected provider is Claude Opus 5.5 through AIHubMix: set `PROVIDER=aihubmix`, `AIHUBMIX_MODEL=claude-opus-5-5`, and `PROMPT_LANGUAGE=en`. Enter the model API key as `AIHUBMIX_API_KEY` in the ignored local `.env`. The account-management Access Key is a different credential. Producer/reviewer system prompts use English while listener-facing output stays Chinese. Calls use medium reasoning and streamed transport; there is no automatic model substitution.

## Run locally

Install Node.js 20 or later, then clone the repository:

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

Use the local HTTP server even for offline composition: browser modules, sample loading, and project storage need an HTTP origin. `PROVIDER=mock` exercises the AI workflow without model credits.

### Model providers

Set `PROVIDER` in `.env` and restart the server:

| Provider | Required credential or setting | Default model |
| --- | --- | --- |
| `aihubmix` | `AIHUBMIX_API_KEY`; set `AIHUBMIX_MODEL` | `claude-opus-5-5` |
| `qwen` | `DASHSCOPE_API_KEY` | `qwen-plus`; override with `QWEN_MODEL` |
| `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-chat`; override with `DEEPSEEK_MODEL` |
| `doubao` | `ARK_API_KEY`, `DOUBAO_MODEL` | Configure a model or endpoint ID |
| `mock` | None | Fixed demo arrangement |

API credentials remain on the server. They are not sent to the browser. The selected Claude configuration uses English system prompts; the interface and listener-facing explanations remain Chinese.

## Tests and evaluation

The browser regression suite uses a mock model and does not consume model credits. Install Playwright in your development environment and its Chromium browser, then run:

```bash
node test/regress.mjs "$PWD"
node test/project.mjs
node test/autosave.mjs
node test/song-contract.mjs
node test/jobs.mjs
node test/jobs-api.mjs
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

Measurements cover duration, structure, harmony, melody, grooves, and notation compatibility. They do not produce a single musical quality score; listening remains necessary. See [evaluation notes](./eval/README.md) and the [0.x baseline](./eval/baseline-0.x.md). Both include links to Chinese translations.

## Current boundaries

Editing uses a sixteenth-note grid with four/eight-bar sections, 4/4 meter, and a constant global tempo. Scoped AI revision covers melody, bass, chords, arpeggio, or pad; drum editing is manual. Multi-section AI edits, arbitrary section lengths, cloud sync, and a replacement sound engine are outside this release. The four-bar seed remains separate from full-song edits. Chord labels are arrangement references and are not automatically renamed after pitch editing.

A/B renders the selected section from its beginning. Humanization and synthesis noise can vary between renders; this is not a waveform-identical comparison. Pending candidates remain page-local until accepted or retained as a named version. Export project files for portable backups. Named history keeps up to 30 unstarred and 64 starred versions within a bounded storage budget; the last ten undo/redo entries are retained subject to size limits.

## Deployment and contribution

See [deployment instructions](./DEPLOY.md) for Linux, Nginx, HTTPS, invitation codes, quotas, and Git push deployment with automatic rollback. See [contribution guidelines](./CONTRIBUTING.md) for the development workflow.

| Path | Purpose |
| --- | --- |
| `index.html` | Interface, arrangement engine, synthesis, playback, and export |
| `server.mjs` | HTTP service, authentication, quotas, and asynchronous generation jobs |
| `ai.mjs` | Model providers, prompts, draft generation, and review |
| `song-contract.mjs` | Plan validation and supported chord notation |
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
