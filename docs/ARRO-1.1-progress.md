# ARRO 1.1 implementation progress

Baseline: `bca6a32`. Working branch: `feat/arro-1.1`.

## Stage A, first increment

New full-song plans carry `executionVersion: 2`. Compilation preserves zero energy, explicit rests, sparse/chromatic melody groups, simultaneous onsets, overlapping note lengths, and the unused second half of an eight-bar melody. Accidentals shift the selected scale degree by a semitone, including slash bass degrees in minor keys. Chord quality is preserved independently of the harmonic-richness control.

The version-two event path skips automatic clash correction, brightness reharmonization, energy-driven rhythm rewriting, added bass approaches, and unsolicited transition effects. Explicit producer moves still execute. The local composer and snapshots without an execution version retain the legacy behavior. `fromSongPlan(..., {executionVersion: 1})` is available for archived plan replay. These are execution changes, not evidence of improved listening preference.

`core/project.mjs` materializes the current full-song performance as ProjectV2, with 480 PPQ, stable section/track/clip/event IDs, revision, tempo, instrument/mixer settings, explicit pitched/drum/effect events, rendering metadata, and separate AI provenance. Grouped chords are represented by individual note events and retain their rendering groups. Sustained events may cross a section boundary. Serialization and reconstruction preserve the realized event stream.

The full-song view now reads its performance back from ProjectV2. Selection-only redraws reuse the materialized events. Audio and full-song MIDI export consume this reconstructed performance through the existing renderer. The server serves the project module using an explicit authenticated path.

## Current boundaries

This increment is a compatibility bridge, not a finished project editor or a 1.1 release:

- Legacy editor state remains the input adapter; changing it recompiles the project. A command layer and explicit migration/import boundary are still required before event editing becomes the only authority.
- The four-bar loop continues to use its existing derivation path. Full-song event capture does not yet make the loop editor a clip editor.
- Durable storage, `.arro.json` import/export UI, undoable event commands, and scoped AI revision are not implemented here. Existing localStorage history still stores legacy snapshots.
- Mixer controls, audio humanization, swing, envelopes, and sound assets remain owned by the existing audio engine. Event round-trip equality does not imply bit-identical rendered audio or complete standalone project playback.
- Event editing currently uses the existing sixteenth-note grid. Arbitrary section lengths and sub-step editing remain later work.
- Version-two energy/brightness/richness controls no longer silently rewrite explicit model events. Their product interaction must be redesigned around explicit edits before rollout.
- Historical plans remain available for version-one replay. New execution semantics must not be applied to existing listening-study clips or interpreted as new listening scores.

The production branch and provider configuration have not been changed. This increment uses mock and archived data and makes no paid model calls.

## Validation

Run `test/regress.mjs` before and after changes, with Playwright configured through `PLAYWRIGHT_MJS` if necessary. It covers the existing generation/refinement/export workflow and new execution/project invariants. Set `ARRO_REPLAY_PLANS` to an archived `results.json` to exercise every stored plan through both execution versions and a ProjectV2 serialization round-trip. This is an offline compiler test, not regeneration.

`node test/song-contract.mjs` checks model-boundary scenarios. `node test/project.mjs` checks serialization, identity, edit isolation, section-crossing tails, renderer round-trip, and malformed project data.

A private frozen baseline with hashes is stored under ignored `eval/runs/arro-1.1-baseline/`.

## Next increment

Finish command-based current-project editing and legacy snapshot migration; then implement transactional IndexedDB saving, visible save failures, and project-file recovery. Scoped AI revision and candidate comparison follow the durable project boundary.
