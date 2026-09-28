# ARRO 1.1 implementation progress

Baseline: `bca6a32`. Working branch: `feat/arro-1.1`.

## Stage A, first increment

New full-song plans carry `executionVersion: 2`. Compilation preserves zero energy, explicit rests, sparse/chromatic melody groups, simultaneous onsets, overlapping note lengths, and the unused second half of an eight-bar melody. Accidentals shift the selected scale degree by a semitone, including slash bass degrees in minor keys. Chord quality is preserved independently of the harmonic-richness control.

The version-two event path skips automatic clash correction, brightness reharmonization, energy-driven rhythm rewriting, added bass approaches, and unsolicited transition effects. Explicit producer moves still execute. The local composer and snapshots without an execution version retain the legacy behavior. `fromSongPlan(..., {executionVersion: 1})` is available for archived plan replay. These are execution changes, not evidence of improved listening preference.

`core/project.mjs` materializes the current full-song performance as ProjectV2, with 480 PPQ, stable section/track/clip/event IDs, revision, tempo, instrument/mixer settings, explicit pitched/drum/effect events, rendering metadata, and separate AI provenance. Grouped chords are represented by individual note events and retain their rendering groups. Sustained events may cross a section boundary. Serialization and reconstruction preserve the realized event stream.

The full-song view now reads its performance back from ProjectV2. Selection-only redraws reuse the materialized events. Audio and full-song MIDI export consume this reconstructed performance through the existing renderer. The server serves the project module using an explicit authenticated path.

## Stage A, persistence and command increment

The studio now autosaves its current project to IndexedDB and restores it after reload. An explicit save state distinguishes pending, saving, saved, and failed writes. Failed writes retain current in-memory edits and can be retried or recovered by downloading an `.arro.json` document. Files contain both materialized project events and the compatibility editor snapshot, including mixer levels, mute state, feel, mode, and section selection. AI disclosure is retained. Imports validate format, identity, dimensions, playback metadata, and editor/project consistency before application; unsuccessful restoration rolls back to the open work. Opening a file is undoable.

`core/commands.mjs` implements copy-on-write tempo and mixer commands with revision checks. These commands preserve note events and identities. Undo/redo snapshots include the materialized project, and a continuous volume drag is one undo step. Legacy history snapshots without a project still pass through the existing renderer to materialize ProjectV2 when restored.

`storage/projects.mjs` serializes and coalesces writes. Each IndexedDB transaction atomically checks a concurrency token and commits the document with its next token. A stale tab reports a conflict instead of overwriting another tab's save. Opening a second tab does not itself write a new revision. Initial recovery blocks editing until the stored document has been read; read failures preserve the stored record and offer file-based recovery.

The new project toolbar wraps at narrow widths, using the existing theme and Chinese labels. Storage is local to the browser and origin, not cloud sync. The document is a portable ARRO compatibility format, not a general-purpose DAW session.

## Section-scoped note editor

A lightweight piano roll now targets one section and one pitched track: melody, bass, chords, arpeggio, or pad. Notes support pointer dragging for pitch/time movement, right-edge duration resizing, keyboard movement/deletion, and numeric/select controls for pitch, position, duration, and velocity. A drag commits one undoable command after release. Note editing switches listening to the full-song view; the four-bar seed remains separate source material.

Commands validate target IDs, base revision, note pitch/grid/range, and user velocity before replacing the project. They preserve every event outside the target clip and do not mutate shared producer groups. Edited clips carry a persisted marker. Subsequent legacy compilation preserves those clips, including manually emptied clips; shortening a section rejects changes that would discard their notes. Section editing rolls back on such a failure.

The renderer and full-song MIDI export read the current events. Explicit user velocity reaches all five pitched audio tracks and MIDI; explicitly edited duration bypasses the former MIDI end shortening. Timing/velocity flags survive project serialization and rematerialization. Audio humanization and envelopes still prevent a claim of waveform-identical rendering.

The old whole-song AI refinement flow still reads the initial AI plan. It is therefore disabled after note edits, with an explanation, until current-project revision context is implemented. Pending refinement retains its existing changed-state protection. No new paid generation was used to test this editor.

## Current boundaries

This increment is a compatibility bridge, not a finished project editor or a 1.1 release:

- Tempo, mixer, and single-note edits use project commands. Other legacy operations recompile unedited clips, while manually edited clips retain their realized notes. Arbitrary clip replacement and full event-first editing remain pending.
- The four-bar loop continues to use its existing derivation path. Full-song event capture does not yet make the loop editor a clip editor.
- Autosave keeps the current project, not a cloud library. Undo/redo is session-local. Named version history still uses localStorage; write failures now surface a recovery message. Scoped AI revision remains pending.
- Mixer settings are persisted and synchronized with the existing audio engine. Audio humanization, swing, envelopes, and sound assets still use the existing renderer. Event round-trip equality does not imply bit-identical rendered audio or complete standalone project playback.
- Note editing uses the sixteenth-note grid and the existing four/eight-bar sections. Adding new notes, drum-grid editing, arbitrary section lengths, and sub-step editing remain later work. Chord labels and lead sheets remain references to declared harmony; direct pitch edits do not automatically rename chords.
- Version-two energy/brightness/richness controls no longer silently rewrite explicit model events. Their product interaction must be redesigned around explicit edits before rollout.
- Historical plans remain available for version-one replay. New execution semantics must not be applied to existing listening-study clips or interpreted as new listening scores.

The production branch and provider configuration have not been changed. This increment uses mock and archived data and makes no paid model calls.

## Validation

Run `test/regress.mjs` before and after changes, with Playwright configured through `PLAYWRIGHT_MJS` if necessary. It covers the existing generation/refinement/export workflow and new execution/project invariants. Set `ARRO_REPLAY_PLANS` to an archived `results.json` to exercise every stored plan through both execution versions and a ProjectV2 serialization round-trip. This is an offline compiler test, not regeneration.

The latest browser run passed 63 checks, including 88 offline replay cases from 44 archived plans, full document refresh/import/export, exact undo/redo, actual two-tab conflicts, failed-save retry, narrow-screen layouts, note pointer movement/resizing, deletion, exact note undo/redo, MIDI pitch/duration/velocity, and persistence through refresh and legacy compilation.

`node test/autosave.mjs` checks write ordering, coalescing, stale saved labels, error retention, and retrying the latest edit. `node test/song-contract.mjs` checks model-boundary scenarios. `node test/project.mjs` checks serialization, identity, edit isolation, section-crossing tails, renderer round-trip, and malformed project data.

A private frozen baseline with hashes is stored under ignored `eval/runs/arro-1.1-baseline/`.

## Next increment

Implement scoped AI revision from the current persisted event project, validate replacement clips against scope and base revision, and provide original/candidate comparison before acceptance. Then expand note creation and drum editing as needed.

ACE Studio is a separate integration candidate. Its installed official CLI responded to a read-only project-info check. No ACE project was changed, imported, or rendered. Prefer the official CLI and skills for any future local handoff; a local desktop connection is not a hosted browser API.
