import { createRequire } from "node:module";

// Reuse backend dependencies without installing a duplicate test dependency tree.
const require = createRequire(new URL("../../server/package.json", import.meta.url));
require("dotenv/config");
