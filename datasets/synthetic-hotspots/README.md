# Synthetic Argao hotspot evaluation

This is an **offline research tool**, not a database seed/importer and not a
future-risk prediction model. It contains no real incident or police records.
No Supabase credentials, server connection, network requests, new package or
database migration are required. Ground truth is never passed to DBSCAN.

## Run

From the repository root:

```powershell
cd server
npm run hotspots:generate
npm run hotspots:evaluate
```

Default output:

```text
datasets/synthetic-hotspots/generated/seed-20261021/
  README.md                Scenario definitions, sizes and expected results
  reports.json             Input scenarios, provenance and fixed reference time
  ground-truth.json        Expected location memberships / exclusions, separate
  reports.csv              Spreadsheet-friendly source rows (no truth labels)
  reports.geojson          Source pins for external map visualization
  evaluation/
    REPORT.md              Paper-friendly results and parameter comparison table
    evaluation.json        Full counts, location assignments, hashes and metrics
    tuning-grid.csv        Parameter sensitivity spreadsheet (tuning only)
```

The generated directory is ignored by Git; source code and these instructions
are version controlled. Keep/export a run's complete input, truth and result
files with the paper's research artifacts. Each scenario is independent: do
**not** combine them into one map and evaluate the mixture as a single dataset.

### Additional runs

Both commands **refuse to overwrite existing output directories**, preserving
earlier results (including failures). An evaluation can be repeated into a new
output folder. A custom generated dataset must be passed to evaluation using
`--input`:

```powershell
# New independent seed; never silently replace an existing run
npm run hotspots:generate -- --seed 42 --out ../datasets/synthetic-hotspots/generated/seed-42
npm run hotspots:evaluate -- --input ../datasets/synthetic-hotspots/generated/seed-42

# Reproduce the same dataset in a different directory
npm run hotspots:generate -- --seed 20261021 --out ../datasets/synthetic-hotspots/generated/reproduction
npm run hotspots:evaluate -- --input ../datasets/synthetic-hotspots/generated/reproduction
```

Default reference time is **2026-10-21T12:00:00Z**, NOT the machine's current
time. This prevents reports ageing out on repeat runs. Set an explicit ISO
timestamp with `hotspots:generate -- --as-of ... --out ...` if needed.

## Designed scenarios

Each family appears in a tuning split and an independent held-out realization:

| Family | Expected behaviour |
|---|---|
| Dense patch | Recover one planted dense area and leave isolated reports unclustered |
| Scattered | Do not invent a hotspot from geographically separated locations |
| Repeated pin | Forty reports at ONE location must not create spatial density |
| Two patches | Keep widely separated dense areas in two clusters |
| Nearby patches | Keep two planted areas ~650 m apart separate; large eps can merge them |
| Elongated patch | Recover a connected elongated area, rather than assuming every cluster is a tight circle |
| Exclusion guards | Ignore old, future, undated, inactive, invalid-coordinate and outside-Argao decoys |

Eligible coordinates are generated within the bundled Argao polygons by
seeded rejection sampling. Dense areas use uniformly sampled discs or a
designed elongated shape, not repeated barangay-centre pins. Dates, incident
types and severities are fictional. Out-of-boundary / invalid-coordinate rows
are deliberate exception scenarios and explicitly recorded as excluded truth.

Random streams are independent per split/scenario. Existing reports and people
are not copied. The generator does not model roads, buildings, population,
weather or real reporting behaviour. Sampling is not representative of actual
Argao incident distributions.

## Evaluation protocol

1. Generate scenarios and their expected labels from the design, **without
   calling DBSCAN**. Input reports contain no expected cluster labels.
2. Compare **16 settings** on tuning scenarios only: eps = 100/150/300/500 m;
   minLocations = 3/4/5/6, including the point itself.
3. Select by micro pair-F1; ties use exact-scenario count, exclusion errors,
   falsely clustered noise locations, smaller eps, then larger minimum count.
   The tie-break is a declared convention, not evidence that smaller eps is
   inherently best. Application settings remain unchanged.
4. Freeze the selected setting, then score held-out scenarios **only for that
   setting**. Do not retune using the held-out results. They are new synthetic
   realizations of the same scenario families, not independent real-world data.
5. Store hashes of the input dataset, boundary version and engine source to
   support reproducibility. Dataset/truth mismatches are rejected.

### Metrics

- **Pair precision / recall / F1:** whether pairs of distinct locations belong
  to the same non-noise cluster. Cluster names/numbers do not affect scores.
- **Noise precision / recall:** whether isolated locations remain unclustered.
  Noise locations are not treated as one shared cluster.
- **Exclusion errors:** expected-excluded reports mistakenly returned as
  clustered OR noise, plus a separate count of missing eligible reports.
- **Exact scenario match:** correct partition, noise labels, cluster count,
  eligibility and consistent treatment of duplicate-coordinate reports.

Scoring counts locations, not duplicate report pairs, so repeatedly copying
one pin cannot inflate accuracy. Metrics with no applicable denominator are
`N/A`, not an automatic 100%. All raw counts and per-location assignments are
retained. There is no incident-probability percentage or forecast hit rate.

## First default-seed experiment

Generator `synthetic-hotspots-v1`, seed `20261021`, reference time above:

- 14 independent scenarios; **494 fictional report rows**.
- Selected on tuning: **100 m / 3 distinct locations**. Several settings tied
  on tuning score; the declared tie-break chose this setting.
- Held-out micro pair-F1: **0.9698**; exact scenarios: **6 / 7**.
- The exclusion-guards realization's valid planted patch was split into two
  clusters; its pair-F1 was **0.4507**, despite zero exclusion errors.
- The imperfect result was retained. Production remains **300 m / 4 locations**.

These figures are evidence about this particular synthetic generator, **not
96.98% real-world prediction accuracy**. Micro averages can hide a weak
scenario, which is why per-scenario results and the failure are reported.

Suggested research wording:

> Due to restrictions on access to official incident records, the prototype
> was evaluated on reproducible synthetic geospatial scenarios within Argao's
> boundaries. Parameter selection used a tuning split, with separate held-out
> synthetic realizations for evaluation. Results measure recovery of planted
> clusters and robustness to duplicate/invalid records; they do not establish
> real-world predictive accuracy or operational policing effectiveness.

## Tests

`tests/server/SyntheticHotspots.test.ts` covers reproducibility, input/truth
integrity, coordinates, held-out isolation, known metric values, noise,
duplicate-resistant scoring and missing/excluded reports. It runs with
`npm test` alongside the engine's existing tests. The commands above exercise
the full parameter grid and produce inspectable artifacts.
