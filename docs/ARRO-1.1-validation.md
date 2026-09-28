# ARRO 1.1 scoped-revision release check

Date: 2026-09-28. Six frozen English Opus projects from three scenes; two targeted edits per project. Model: Claude Opus 5.5 via the configured AIHubMix-compatible route. English producer prompt, one pass, medium reasoning, no musical review or technical repair call.

All 12 requests returned contract-valid replacements. All 12 passed the predefined direction predicates, and all 12 preserved every other clip exactly. Mean request time: 22.7 seconds; range 7.2–36.7 seconds.

The phrasing task began on a manually edited pitch and reserved the final two beats as breathing space, leaving other musical choices to the producer. The octave task lowered every selected bass note by twelve semitones while retaining onset, duration, and velocity. These are controlled instruction-following checks, not new human listening-preference scores or evidence of commercial production quality.

Reported usage: 317,718 input tokens and 21,628 output tokens. Token-based cost estimate: $1.7034, using the live catalog's $4/$20 per million input/output tokens. This is an estimate from response usage, not an invoice reconciliation. The run used a cumulative $8 stop budget.

| Source | Task | Valid / isolated / direction | Seconds | Estimated USD |
| --- | --- | --- | ---: | ---: |
| 2 | phrase | Pass | 30.9 | 0.1406 |
| 2 | octave | Pass | 15.5 | 0.1175 |
| 16 | phrase | Pass | 32.9 | 0.1453 |
| 16 | octave | Pass | 14.5 | 0.1164 |
| 24 | phrase | Pass | 34.7 | 0.1892 |
| 24 | octave | Pass | 7.2 | 0.0836 |
| 30 | phrase | Pass | 36.7 | 0.1819 |
| 30 | octave | Pass | 13.7 | 0.1112 |
| 38 | phrase | Pass | 32.5 | 0.1719 |
| 38 | octave | Pass | 15.7 | 0.1477 |
| 44 | phrase | Pass | 20.9 | 0.1154 |
| 44 | octave | Pass | 17.6 | 0.1828 |

Raw project fixtures, responses, and per-call usage are retained privately under ignored eval/runs/revision-1.1/. Existing archived plans were replayed separately for compiler fidelity; the generation model and default sound engine were unchanged.
