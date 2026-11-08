# Pipeline repair verification — 2026-11-08

## Scope and safety

Fixed English/Filipino feature export and independent continuation validation.
No quality thresholds were lowered. No datasets were relabelled or downloaded.
No Supabase jobs were claimed, no live SQL was run, and no candidates were uploaded,
registered or enabled. Built-in files and deployed Cebuano/supporting models were
not modified. Original source CSVs were not changed.

All model experiments used isolated temporary directories. Validation guided
selection. One final evaluation of frozen repaired continued candidates was run
on the existing benchmark; no model/threshold was retuned afterward. This is not
a new independent benchmark or a claim of final general-system improvement.

## Export verification

Repaired English fresh candidate, original snapshot from
`cd0f7f05-4322-46d9-afca-a1ab9dc75e8e`:

- Validation macro-F1: 0.6926480204.
- All 3,335 validation examples checked.
- Python/ONNX label disagreements: **0**.
- Maximum probability error: **0.0000001949** (limit 0.00002).
- No test evaluation was performed for this fresh candidate.
- Files: `C:/Users/Administrator/AppData/Local/Temp/opencode/english-export-fixed-hf5s1qbc/`.

The initial repaired export caught an additional padded-batch bug, rather than
silently treating small label drift as acceptable. That bug is now covered by a
multilength/hashtag regression test.

## Filipino fresh validation experiments

The original Filipino-only snapshot had 20,413 training / 3,274 validation rows.
The portable profile still failed neutral precision under the existing gates.
Two bounded feature-balance experiments (word-focused, character-focused; eight
configurations each) and six multinomial logistic-regression configurations also
failed validation. None qualified; no test scores were used for their selection.
These alternatives were not made production defaults and no failed model was
published. A code repair alone did not resolve the data/model-quality limitation.

## Repaired continued candidates

Original approved snapshot:
`b47d88e7-a5b8-427e-8822-9ddfe7f1f55c/approved_snapshot.json`.
Only English and Filipino were fitted; no Cebuano candidate was trained here.

The new snapshot reserved 96 approved examples per language, not used in fitting:
English negative=31, neutral=32, positive=33;
Filipino negative=30, neutral=32, positive=34.
This small in-domain holdout must not be compared directly with the original
benchmark validation scores or interpreted as proof of broad accuracy.

| Language | New-holdout validation macro-F1 | Export label mismatches |
| --- | ---: | ---: |
| English | 93.7575% | 0 / 96 |
| Filipino | 94.8139% | 0 / 96 |

## Final frozen-candidate gate results

| Language | Test macro-F1 | Accepted test precision | Outcome |
| --- | ---: | ---: | --- |
| English | 64.7880% | 73.4895% on 8,540 accepted predictions | Failed: accepted precision below 75% |
| Filipino | 58.3964% | 93.6893% on 412 accepted predictions | Failed: macro-F1 below 60%; neutral precision 44.2763% below 50% |

Neither candidate qualified. Filipino's high accepted precision does not excuse
its separate overall quality failures. No further fitting/threshold search was
performed after these results. Existing production setup is unchanged.

Candidate diagnostics and full frozen evaluation:
`C:/Users/Administrator/AppData/Local/Temp/opencode/continued-en-fil-repair-unwh6ydh/`.

## Remaining limitation

Pipeline correctness is repaired, but passing English/Filipino supporting models
has not been achieved. Further quality work needs reviewed, representative
training data/annotation consistency, particularly neutral versus emotional
statements; it must not copy benchmark mistakes into training or relax gates.
