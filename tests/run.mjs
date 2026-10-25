import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const directory = dirname(fileURLToPath(import.meta.url));
const server = resolve(directory, "../server");
const require = createRequire(resolve(server, "package.json"));
const suites = {
  server: { suffix: ".test.ts", typescript: true },
  clients: { suffix: ".test.mjs" },
  database: { suffix: ".postgres.mjs" },
  browser: { suffix: ".browser.mjs", typescript: true },
};
const selected = process.argv.slice(2);
if (!selected.length) selected.push("server", "clients");
for (const name of selected) {
  const suite = suites[name];
  if (!suite) throw new Error(`Unknown suite '${name}'. Choose: ${Object.keys(suites).join(", ")}`);
  const files = readdirSync(resolve(directory, name)).filter(file => file.endsWith(suite.suffix)).sort()
    .map(file => resolve(directory, name, file));
  if (!files.length) throw new Error(`No tests found for ${name}`);
  const loader = suite.typescript ? ["--import", pathToFileURL(require.resolve("tsx")).href] : [];
  // Keep the backend's established working directory for dotenv/model settings.
  // Serial database/browser files avoid exhausting memory or browser resources.
  const concurrency = ["database", "browser"].includes(name) ? ["--test-concurrency=1"] : [];
  const result = spawnSync(process.execPath, [...loader, "--test", ...concurrency, ...files], {
    cwd: server, stdio: "inherit", env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
