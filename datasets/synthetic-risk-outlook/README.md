# Synthetic submitted-report outlook evaluation

From `server/`, run:

```powershell
npm run risk:evaluate
```

Results are already generated at:
`datasets/synthetic-risk-outlook/generated/seed-20261022-display-precision/REPORT.md`.

That directory also contains the complete `evaluation.json` (including every
fold's predictions, targets, errors and method) and `series.csv`. These are
fictional daily submitted-report counts; no real police records, people,
credentials or application database access are used. Generated outputs are
ignored by Git; keep/export the full experiment folder with research artifacts.

The default reference date is fixed to 2026-10-22 and seed to 20261022 for
reproducibility. Existing directories are never overwritten. To reproduce in
a new folder:

```powershell
npm run risk:evaluate -- --out ../datasets/synthetic-risk-outlook/generated/reproduction
```

To design a new realization, use `--seed 42 --out ...`. Do not rerun different
seeds and report only the best result.

## Protocol and limits

Seven scenarios cover steady activity, weekday patterns, gradual growth,
sudden late change, sparse counts, short history and a reporting gap. Eligible
scenarios have 224 observed days. Four later non-overlapping weeks are scored;
method choice and error-band calibration occur independently INSIDE each
earlier training prefix, with a one-day gap matching the application's policy.
Sparse/short/stale data remain gated, not forced into forecasts.

At the default seed: 16 scored target weeks; selected-pipeline MAE **17.531**,
historical baseline MAE **18.281**, weekday candidate MAE **17.456**.
Historical-error bands included the actual total in **0.688** of scored weeks.
The selected method is not guaranteed to beat either alternative on later
weeks. The deliberately sudden-change scenario produces large misses, which
are retained rather than hidden or used to retune the model.

All three methods are scored at the same one-decimal precision used by the UI.
An earlier draft with unrounded competitor totals is preserved in the original
seed folder; the `display-precision` folder contains the final fair comparison.
No model, parameters or scenario design were changed in this scoring correction.

MAE means average absolute error in **weekly submitted-report counts**, not
classification accuracy. Range coverage here is an observed synthetic fraction,
not a guaranteed confidence level. Series omit real-world population, roads,
weather, actual incident frequencies and reporting behaviour. These outcomes
do not validate future-crime prediction or patrol deployment in Argao.

Full application/data policy: `server/RISK_OUTLOOK.md`.
