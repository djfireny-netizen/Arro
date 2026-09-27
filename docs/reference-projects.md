# Music engineering references

These projects inform Arro's design research. They are references, not newly added runtime dependencies. Arro keeps the language model responsible for musical decisions and uses code to validate, perform, and export the resulting arrangement.

Star counts below were queried from the GitHub API on 2026-09-27. Popularity is a discovery aid, not a measure of suitability or musical quality.

| Project | Stars | Relevance to Arro |
| --- | ---: | --- |
| [Tone.js](https://github.com/Tonejs/Tone.js) | 14,741 | Browser audio scheduling, shared transport, instruments, samplers, and effects. Useful when reviewing the playback architecture. |
| [Tonal](https://github.com/tonaljs/tonal) | 4,242 | JavaScript music-theory representations and operations on notes, intervals, chords, and scales. Useful when reviewing chord and bass-pitch semantics. |
| [Microsoft Muzic](https://github.com/microsoft/muzic) | 4,962 | Research on music understanding and generation. Useful for studying symbolic representations and generation approaches. |
| [Magenta](https://github.com/magenta/magenta) | 19,797 | Music-generation research and tools. The repository is archived; treat it primarily as a research reference and assess maintenance before integration. |
| [AudioCraft / MusicGen](https://github.com/facebookresearch/audiocraft) | 23,651 | Text- and melody-conditioned audio generation. Its audio output differs from Arro's editable arrangement and MIDI workflow; useful for studying conditioning and listening evaluation. |
| [MidiTok](https://github.com/Natooz/MidiTok) | 898 | Specialized MIDI and symbolic-music tokenization for deep-learning models. Smaller audience, but directly relevant to structured musical representations. |

For the current reliability work, prioritize explicit musical data semantics and verifiable playback before replacing the engine. A slash chord's specified bass pitch should survive parsing, performance, display, and MIDI export. Evaluation should distinguish valid drafts, complete revisions, repaired responses, and failed attempts; blinded listening addresses musical preference separately.
