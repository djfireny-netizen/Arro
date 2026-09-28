# ARRO 1.1 release progress

Baseline: `bca6a32`. Implementation branch: `feat/arro-1.1`.
Release: 1.1.0, 2026-09-29. Local and server release validation is complete; deployment is recorded in GitHub release history.

## Implemented scope

- **Faithful execution:** new plans use execution version two, preserving explicit rests, zero energy, sparse/chromatic notes, simultaneous notes, overlaps, and producer-authored moves. Version-one replay remains available for legacy projects. Accidentals and slash bass notes retain their declared meaning.
- **Current project:** ProjectV2 stores realized section/track/clip/event identities, tempo, mixer/instrument settings, execution metadata, and original-plan provenance. Full-song playback and export reconstruct the saved event stream rather than regenerating it from the original prompt.
- **Persistence:** IndexedDB autosaves the current project with concurrency protection and a bounded recent undo/redo history. Portable `.arro.json` import/export preserves current music. The named-version library now uses IndexedDB; old localStorage versions migrate while the old copy is retained. Save failures remain visible and retryable. History is bounded to 30 unstarred/64 starred versions and a 40-million-character serialized budget; recent undo/redo is bounded to ten entries per direction and 1.5 million characters per direction.
- **Editing:** five pitched tracks support adding, moving, resizing, velocity changes, deletion, and undo. Drum/percussion grids support add/update/delete with numeric alternatives. Selected sections can loop. Edited clips survive subsequent compatibility recompilation, including empty clips.
- **Scoped AI revision:** an English producer prompt receives the actual current target and surrounding musical context. One model pass returns a strictly validated replacement clip. A/B plays the section from the same start, with optional target solo. Acceptance is one undoable action. Changed-state candidates are retained as separate named versions, while existing edits remain intact.
- **Reliable jobs:** request identity prevents duplicate upstream calls after retries or lost responses. Browser-session ownership prevents cross-session result access. A private atomic journal preserves jobs and daily usage across restart for 24 hours; interrupted calls are reported without automatic paid replay. Failures preserve current work. Model/token/protocol metadata is recorded internally, without credentials.
- **Clear controls:** faithful-project direction controls configure the next generation; direct musical editing uses notes or scoped revision. Swing, feel, mute, and volume remain performance controls. Old whole-song refinement is gated after clip edits because it still uses the initial plan.

## Release boundaries

This is the approved core release with lightweight editing, not a complete DAW. Sections remain four/eight bars in 4/4 on a sixteenth-note editing grid. Arbitrary section lengths, sub-step editing, multi-section AI revision, cloud sharing/sync, vocal synthesis, and replacement sound banks remain outside this release. The four-bar seed is separate from full-song edits. Chord labels are declared harmony references rather than inferred names for edited notes.

Saved events are deterministic. Humanization, synthesis noise, envelopes, and sample rendering are not waveform-identical. A/B starts at the selected section, with a release tail. Unaccepted candidates are page-local unless a changed-state result is retained in named history. Browser storage still benefits from exported backups.

ACE Studio remains a separate future handoff option. Its official CLI was checked read-only; no ACE project was changed or rendered.

## Verification

The latest completed browser suite passed 94 checks, including 88 compiler/project replay cases from 44 archived plans, actual MIDI pitch/timing/velocity checks, project-file round trips, two-tab conflicts, failed-save retry, note and drum commands, section looping, persistent undo, scoped A/B audio, current-edit context, stale-candidate branches, and generation retry identity. Old-database migration, version-library failures/retry, and completed-job recovery after reload also pass.

Unit suites cover project contracts, autosave ordering, model boundaries, journal deduplication/ownership/interruption, and real HTTP restart recovery. Desktop and mobile layouts are checked with screenshots. No sound-bank substitution is included.

A separate release check uses six archived English Opus projects from three scenes, with two targeted revisions each. It measures instruction fulfillment, untouched-scope equality, contract validity, latency, and token-accounted cost. These tests are not new human preference ratings or proof of commercial music quality. The selected model/provider stays unchanged. Results remain in ignored `eval/runs/revision-1.1/`; the public summary is in `ARRO-1.1-validation.md`.

The 12 live targeted revisions all passed contract, exact untouched-scope, and direction predicates. Mean latency was 22.7 seconds and token-accounted cost was approximately $1.7034. See `ARRO-1.1-validation.md`; this is not a human preference study.

The server preview passed all 93 applicable browser checks. A separate real-model request on the production host passed the octave and untouched-scope checks in 14.4 seconds, at an estimated $0.1201. Total model-check cost including that smoke test: $1.8235. Nginx configuration validation passed with scoped-revision body limits and shared generation rate limiting.
