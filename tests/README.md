# CommuniShield tests

All automated test suites live in this folder. Keep new tests here instead of
mixing them into production source directories.

| Folder | Coverage |
|---|---|
| `server/` | Backend TypeScript unit/integration tests (`*.test.ts`) |
| `clients/` | Client helpers and source regressions (`*.test.mjs`) |
| `datasets/` | Offline Python training/data-tool tests (`test_*.py`) |
| `database/` | Isolated PostgreSQL migration/schema tests (`*.postgres.mjs`) |
| `browser/` | Exported-web browser tests with mocked APIs (`*.browser.mjs`) |
| `helpers/` | Shared test-only setup |

## Commands (repository root)

```powershell
npm test                   # Backend + client tests; no database/browser setup
npm run test:server
npm run test:clients
npm run test:types
.\.venv-data\Scripts\python.exe -m unittest discover -s tests -t .
npm run test:database
npm run test:browser
```

`npm run test:datasets` uses the active `python`, so activate `.venv-data` first.
Use discovery from `tests` with `-t .` as shown: the Python test package sets up
the production dataset-tool import path. Do not run the Python test files directly.
Python dependencies remain in the existing data virtual environment.

Install the normal root/backend/client dependencies first. Tests reuse backend
`tsx`, dotenv and TypeScript dependencies; there is no duplicate test dependency
installation. `npm test` inside `server` or `clients` still runs that area's suite.
Backend `npm run build` type-checks production code and the relocated TS tests.

The runner discovers files by suffix, works independently of the caller's working
directory, and runs children from `server/` to preserve existing dotenv/model-path
behavior. It never automatically runs seed scripts, training or model activation.

## Optional suites

- **Database:** set `PGLITE_MODULE` to the file URL of an installed
  `@electric-sql/pglite` entry module (the finalized schema uses version `0.5.10`).
  These tests create isolated databases, not connections to live Supabase.
- **Browser:** provide `PLAYWRIGHT_MODULE` (installed `playwright-core` entry file
  URL), `WEB_EXPORT_DIR` (absolute Expo web export directory), and `CHROME_PATH`
  (local browser executable). See each test's header for additional screenshot
  output settings. These tests are opt-in; build the web export first.

You can run a single database/client `.mjs` file with `node --test <path>`.
For a single backend/browser test requiring TypeScript, run from `server/`:
`node --import tsx --test ../tests/server/SentimentTraining.test.ts`.

Benchmark `test.csv` files, model-evaluation tools and optional database-seeding
scripts are **not automated test suites**. They stay with their data/tools so
training paths, provenance and operational commands do not break.
