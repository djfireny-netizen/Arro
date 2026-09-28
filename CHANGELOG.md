# Changelog

## 1.1.0 — 2026-09-28

ARRO now supports editing and revising the current arrangement without replacing the parts the listener wants to keep.

- Preserve explicit rests, zero values, sparse/chromatic notes, simultaneous notes, overlaps, and declared slash bass pitches in new plans. Legacy execution remains available.
- Autosave projects, recent undo/redo, and named versions in IndexedDB. Migrate existing local versions, recover storage failures, and import/export portable `.arro.json` projects.
- Add, move, resize, adjust velocity, and delete pitched notes. Edit drum/percussion steps and loop selected sections. Playback and MIDI retain those changes.
- Request one-track/one-section AI revisions using current notes, compare A/B in context or solo, and accept with one-step undo. Preserve late candidates as independent versions.
- Deduplicate generation retries, isolate jobs by browser session, journal results across service restart, preserve work on failure, and recover recent results without another model call.
- Keep the selected model, English producer prompts, one musical pass, existing sounds, Chinese interface, invitation access, AI-content labels, and sample credits.

The release keeps four/eight-bar sections, 4/4 meter, and sixteenth-note editing. Arbitrary section lengths, multi-section AI changes, cloud sync/sharing, vocal generation, and replacement sound banks remain outside this release. Humanization can vary between audio renders. See [release validation](docs/ARRO-1.1-validation.md) and [deployment/recovery notes](DEPLOY.md).
