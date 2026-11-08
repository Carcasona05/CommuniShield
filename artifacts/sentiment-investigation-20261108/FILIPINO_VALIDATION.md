# Filipino-only fresh run: exact validation blocker

Follow-up to the initial read-only investigation. With the new diagnostics,
the training snapshot from run `65104798-31a2-4d5d-9438-2265e794e775` was reproduced
locally using `--independent-quality --validation-only --languages filipino`.

20,413 training rows; 3,274 validation rows; 450 approved additions in the snapshot.
No test file was loaded/scored and no cloud job or deployed artifact was modified.
The eight original C/class-weight configurations and 64 offsets per configuration
were retained. None of the 512 settings met every existing requirement.

## Closest rejected setting

C=0.5, balanced class weights; offsets: negative=0.15, neutral=0, positive=0.45.
This is diagnostic evidence, not a selected passing model.

| Validation check | Observed | Minimum | Result |
| --- | ---: | ---: | --- |
| Macro-F1 | 64.6767% | 60% | Passed |
| Negative precision | 68.1159% | 50% | Passed |
| Negative recall | 70.7121% | 50% | Passed |
| Neutral precision | **48.2124%** | **50%** | **Failed** |
| Neutral recall | 52.2914% | 50% | Passed |
| Positive precision | 77.5836% | 50% | Passed |
| Positive recall | 71.5989% | 50% | Passed |

Validation support was negative=997, neutral=851, positive=1,426; all exceed 10.

## Closest setting in each configuration

| C | Class weights | Macro-F1 | Neutral precision | Neutral recall |
| --- | --- | ---: | ---: | ---: |
| 0.5 | Balanced | 64.6767% | 48.2124% | 52.2914% |
| 0.5 | Unweighted | 64.6755% | 47.8723% | 52.8790% |
| 1 | Balanced | 64.6514% | 45.4787% | 60.2820% |
| 1 | Unweighted | 64.3810% | 46.2398% | 53.4665% |
| 2 | Balanced | 64.3486% | 45.5140% | 57.2268% |
| 2 | Unweighted | 64.2321% | 45.8580% | 54.6416% |
| 4 | Balanced | 63.6440% | 44.8919% | 53.7015% |
| 4 | Unweighted | 63.5991% | 45.6103% | 50.0588% |

Every closest setting fails neutral precision alone. This does not mean every
other tested offset has the same failure; none satisfies all gates together.

## Meaning and next step

The candidate is labelling too many nonneutral validation examples as neutral.
This identifies the blocked requirement, not the full cause of the confusion or
proof that the uploaded dataset's labels are wrong. Review neutral-vs-emotional
training examples and annotation consistency, with varied realistic wording.
Keep held-out labels fixed and do not lower thresholds to force qualification.

The 75% accepted-test-precision gate was not reached. There is no new test result
or claim that a modified model qualifies. Built-ins and source datasets remain
unchanged. Rejected candidates were not exported.

Full aggregate diagnostics for this reproduction are in:
`C:/Users/Administrator/AppData/Local/Temp/opencode/filipino-validation-diagnostics-7fccb9af-9bd9-4802-b90f-6aa66dd807ad/training_failure.json`.
