# ARRO 1.1: editable, persistent, faithful arrangements

Research date: 2026-09-28. Application baseline: `bca6a32`.
Status: approved; Stage A implementation is in progress on `feat/arro-1.1`. No new paid experiments have started.

## Outcome

A listener can identify an issue, revise that part of the current arrangement, compare the candidate with the original, and keep the parts they already like. The same current project drives editing, playback, and exports.

Retain the selected Opus 5.5 configuration, English producer prompts, Chinese product text, one musical generation by default, and user-requested revision. Keep model identities out of the product interface. Musical decisions belong to the producer and the user; deterministic checks enforce data integrity and execution boundaries.

## Research evidence

Selected source files and implementation documentation were examined from Signal, Contextual Music Crafter, SpessaSynth's browser library, BeepBox, and Tone.js. Additional repositories were screened for product fit. External applications were not installed or benchmarked. Browser probes used ARRO's actual `fromSongPlan` function and mock plans, without provider calls.

Four contract-valid inputs currently change during compilation:

| Input | Observed result |
| --- | --- |
| Section energy of zero | Becomes 0.6 |
| Explicitly empty bass/chord patterns | Full-bar root/chord patterns are inserted |
| Two-note melody groups | Removed from the compiled melody map |
| A flattened second over the tonic in C major | Changed to the natural third by clash correction |

These are execution-fidelity findings, not evidence that removing the transformations will automatically improve preference scores. Existing 24 browser regression checks and 12 model-boundary scenarios still pass; targeted semantic tests are missing.

Other findings:

- Optional revision reads the saved initial AI plan rather than every edit in the current arrangement.
- The plan, four-bar seed, section extras, derived events, and history snapshots represent overlapping state.
- The current contract limits sections to four/eight bars and uses one chord per bar. Note parsing removes simultaneous starts and truncates overlaps without an explicit polyphony policy.
- Some minor-key accidental semantics differ between prompt text and the parser.
- Local history is stored in localStorage; write failures are suppressed. History is not a durable project format.
- Server jobs are memory-only and expire after 15 minutes. Request deduplication and explicit job ownership should accompany persistent jobs.
- Generation errors can replace the current arrangement with a local-engine result.
- README/provider documentation contains stale statements about prompt language and the older review workflow.

Historical listening supports retaining the current model choice: Opus drafts averaged 3.83 across six clips; Sonnet averaged 3.00 across five usable clips from six attempts. In five matched pairs, Opus won three, Sonnet one, and one tied. Estimated cost per usable result was $0.1492 versus $0.1763, including failures. These are small historical samples, not a simultaneous model benchmark or reconciled billing totals.

Review remains an open question: the same six Opus generations received a mean of 4.50 after review versus 3.83 as drafts, but ratings came from different sessions and comparison sets. This exploratory association supports keeping optional revision available; it does not establish the causal benefit of mandatory review. The old 0.x baseline contains seven scenes, not twenty.

## Reference decisions

| Reference | Adopt or investigate | Boundary |
| --- | --- | --- |
| [Signal](https://github.com/ryohey/signal) | Project entities, edit commands, tick-based scheduling, shared event input for playback/export | Do not migrate the application to React/MobX merely to reuse its UI |
| [Contextual Music Crafter](https://github.com/Edfred1/Contextual-Music-Crafter) | Current musical context, selected-track revision, persisted artifacts | Avoid a paid call for every track in every section; report failed revisions explicitly |
| [SpessaSynth library](https://github.com/spessasus/spessasynth_lib) | Optional SoundFont renderer, worklet/worker execution, offline export | Benchmark sound banks, loading, memory, browser support, and asset licenses before adoption |
| [BeepBox](https://github.com/johnnesky/beepbox) | Serializable projects and recoverable editing history | Prefer project-file export before URL-based or hosted sharing |
| [Tone.js](https://github.com/Tonejs/Tone.js) | Precise audio-clock scheduling and offline-render boundaries | Preserve the existing engine until a measured reason justifies replacement |
| [GridSound](https://github.com/gridsound/daw) | Selection, piano-roll, timeline and track interactions | A complete DAW interface exceeds this release |
| [Tonal](https://github.com/tonaljs/tonal) | Selected pitch, interval and chord utilities | Preserve ARRO's notation semantics; utilities do not decide musical quality |
| [Basic Pitch](https://github.com/spotify/basic-pitch) | Future audio/humming input | Defer transcription UX and quality work |
| [Scribbletune](https://github.com/scribbletune/scribbletune) | Compact pattern representations | No additional procedural composition system |
| [MIDI-LLM](https://github.com/slSeanWU/MIDI-LLM) | Future specialist model research | No new model-hosting stack in 1.1 |

Source and asset licenses must be checked independently before copying or shipping dependencies. Repository star counts are discovery signals, not quality evidence.

## Required scope

### Faithful execution

Distinguish missing/invalid fields from explicit rests and zero values. Preserve valid sparse motifs and chromatic notes. Specify mono/polyphonic behavior and accidental interpretation. Make musical correction an explicit operation. Technical validation covers syntax, references, numeric/resource limits, and timing boundaries.

Freeze the old renderer before changing semantics. Existing projects migrate from their actual playable representation where possible, preserving old data and migration diagnostics. New plans use the new faithful semantics. Existing random sound processes prevent a guarantee of reconstructing an earlier waveform bit-for-bit.

### Current project and persistence

Introduce `ProjectV2` with stable project, section, track, clip, and note IDs; revision; schema version; tempo; meter; timebase; explicit events; instrument/mixer settings; seed; renderer version; and provenance.

Store actual note pitch, onset, duration and velocity. Keep the original AI plan and musical intent as provenance/context, not as an alternative source of current playback state. Default to 480 ticks per quarter; editing grids assist interaction rather than forcing all events onto a sixteenth-note grid.

Use IndexedDB for projects and bounded history, with visible save status and `.arro.json` import/export. Handle storage failure explicitly and provide a portable backup. Legacy history remains recoverable. Browser persistence is not a substitute for exported backups.

### Scoped AI revision

The first scope is a whole track clip within a selected section. Send the current project revision and relevant musical context. Return a candidate without replacing the current project. Provide same-position A/B, target-track solo, full-section listening, acceptance, and one-step undo.

Suggested request fields: `requestId`, `projectId`, `baseRevision`, `baseHash`, `scope`, current musical snapshot, and direction. Supply exact target events, relevant simultaneous parts, harmony and adjacent context, plus a compact whole-song outline. Statistical summaries alone are insufficient for tightly interacting melody/bass parts. Surface context-budget limits rather than silently truncating essential music.

Prefer constrained `replacementClips` over arbitrary JSON paths. Validate IDs, allowed properties, musical timing bounds, resource limits, and hashes of untouched data. Copy shared clips before changing one occurrence. Tempo/key/form changes use a separately declared global scope. At most one technical repair follows a primary request; no automatic musical review.

If the user edits while a request is running, retain the returned candidate as a branch. Do not overwrite a newer revision. Boundary-spanning notes require a defined selection policy before arbitrary bar-range editing is introduced.

### Reliable jobs

Failures leave existing work intact; local generation is an explicit alternative. Deduplicate requests before upstream generation. Associate jobs with the authenticated session/project and persist bounded job records without credentials. A minimal atomic-file journal is sufficient initially; account infrastructure is not required. After restart, interrupted/unknown requests are not automatically charged again.

## Conditional scope

- Lightweight piano-roll/drum editing: move, resize, velocity, delete, selection, undo and section looping. Desktop-first, with usable touch alternatives.
- Positive integer section lengths after the event model is established. Test 1/2/3/4/8/12/16 bars without treating that fixture list as a musical whitelist. Retain 4/4 and a constant global tempo initially; defer changing meters and tempo automation.
- An independent sound-bank trial using frozen events. Compare 12 randomized clips plus representative complete songs. Consider default adoption only if at least eight clips are preferred, no material style regression appears, and loading/memory/export/browser checks pass. This is a product gate, not a statistical significance claim. Failure does not block the core release.

Public community sharing, cloud synchronization, collaborative editing, vocal generation, audio transcription, hosted specialist models and a complete effects/mixing workstation are deferred.

## Implementation boundaries

Proposed modules, introduced gradually:

- `core/project.mjs`: schema, identity and migrations.
- `core/plan-compiler.mjs`: plans to current events with diagnostics.
- `core/commands.mjs`: edit operations and undo.
- `core/revision.mjs`: scope, candidate application and conflict handling.
- `audio/renderer.mjs`: one event input for playback, MIDI and audio export.
- `storage/projects.mjs`: persistence and portable project files.
- `ai/revision-context.mjs`: bounded current-project context.

These files are proposals, not implemented artifacts. Keep the current native JavaScript interface during extraction. Separate event determinism from waveform determinism. Save generated note decisions; version/seed any remaining random rendering behavior. Harmony edits that change accompaniment pitches must be explicit compound commands with a complete diff.

Anthropic documents native [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), but support on ARRO's actual AIHubMix compatibility route is unverified. Capability-test the route before adopting parameters. Schema-constrained output does not replace reference/timing checks or handling of refusals, truncation and transport failures. Record usage, model/protocol versions, error class and repair attempts internally; never log credentials.

## Delivery sequence

Single-developer estimates, subject to migration and renderer complexity; not calendar commitments:

| Stage | Deliverable | Effort |
| --- | --- | --- |
| A | Frozen baseline, faithful contract, project/event foundation, legacy adapter | 5–8 engineering days |
| B | Persistence, scoped revision, candidate comparison, job deduplication/ownership | 5–8 days |
| C | Lightweight editing and short-section support | 4–6 days |
| D | Fault injection, paired evaluation, migration and release checks | 2–4 days |
| Independent experiment | Sound-bank trial | 2–3 additional days |

Core total: approximately 16–26 engineering days. A shorter candidate release can stop after A+B and retain existing controls while C is completed.

## Acceptance and evaluation

Hard gates:

- Run `test/regress.mjs` before/after application changes and relevant model-boundary tests.
- Add behavior tests for zero/rest/sparse/chromatic semantics, shared clip isolation, invalid references, overlapping events and selected-range boundaries.
- Identical project/engine/seed produces identical musical events. Playback/audio export use the same events as MIDI. Reparse exported MIDI and compare pitch, onset, duration and velocity with documented mappings; timing tolerance at most one tick.
- Untouched events and instrument/mixer properties retain identical hashes after scoped edits.
- AI revision requests contain current edited events, not the original plan.
- Failed, invalid, late or conflicting results preserve the current project. Repeated request IDs do not trigger a second upstream request.
- Save/reload/project-file round trips preserve musical content and identities. Damaged imports and quota failures retain existing work and show actionable feedback.
- Preserve AI-content markers, MIDI metadata and sample credits.

Keep experiments separate:

1. **Compiler fidelity:** archived valid plans plus boundary fixtures, no new model calls. Account for every change against approved semantics.
2. **Targeted revision:** six source projects, two tasks each: 12 primary requests, at most 12 technical repairs. Require exact untouched-scope preservation; use an initial 9/12 direction-fulfillment product gate with explicit listener feedback, latency and total cost accounting.
3. **Generation/prompt changes:** if the generation protocol materially changes, compare old/new frozen versions across 20 scenes each, 40 primary calls. Hold model, reasoning, renderer and presentation conditions fixed. Listen to at least six complete pairs as well as excerpts. Reuse stored plans instead when only rendering changes.
4. **Sound:** identical frozen events through alternative renderers; separate loading failures from preference. Measure cold/warm starts, first sound, peak memory, full/stem exports and browser degradation.

Paid experiments are not authorized or started by this document. Prepare concrete scripts and token-based budget estimates before scheduling them. Retain failures/interrupted attempts in reliability and cost denominators. Avoid claiming population-wide superiority from small listening samples.

Release locally, then in preview, then to invited users. Keep schema, prompt and default-sound changes in separate checkpoints. Retain old projects and preserve access/export for new-format files if application code is rolled back. Refresh obsolete documentation alongside the implementation.

## Pinned implementation sources

- [Signal Song](https://github.com/ryohey/signal/blob/632de9685990c90d0be127994908cc43692ff82a/packages/core/src/entities/song/Song.ts), [scheduler](https://github.com/ryohey/signal/blob/632de9685990c90d0be127994908cc43692ff82a/packages/player/src/EventScheduler.ts), [audio export](https://github.com/ryohey/signal/blob/632de9685990c90d0be127994908cc43692ff82a/packages/player/src/renderAudio.ts).
- [CMC selected-track context/revision](https://github.com/Edfred1/Contextual-Music-Crafter/blob/3056c3bf540f81710954f2e2c5f3a91e679ae926/music_analyzer.py), [artifact rebuilding](https://github.com/Edfred1/Contextual-Music-Crafter/blob/3056c3bf540f81710954f2e2c5f3a91e679ae926/artifact_builder.py).
- [SpessaSynth browser integration](https://github.com/spessasus/spessasynth_lib/blob/40f9be2014a0312bc2fec14f215cb90510876a4e/docs/extra/working-with-browsers.md).
- [BeepBox document/history](https://github.com/johnnesky/beepbox/blob/355e510099d230d066d95074c16d748d59fe054c/editor/SongDocument.ts).
- [Tone.js Transport](https://github.com/Tonejs/Tone.js/blob/f613b5af0c924b342aa9d37cb59b31de91355dbd/Tone/core/clock/Transport.ts).
- [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).
