import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { InferenceSession, Tensor } from "onnxruntime-node";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { MODEL_FILES, prepareModelBundle, supportingModelsEnabled } from "./sentimentModelRegistry.js";
import { needsSupport, ranked, validRule, validIndependentPolicy, type PoolPolicy, type Scores, type SupportProposal } from "./supportingModelRouting.js";

type Record = { id: string; artifact_manifest: unknown; routing_policy: PoolPolicy };
export const supportingRegistryDependencies = {
  now: () => Date.now(),
  async readEnabled(): Promise<Record[]> {
    const { data, error } = await supabaseAdmin.from("sentiment_supporting_models")
      .select("id, artifact_manifest, routing_policy").eq("status", "enabled").order("id").limit(4);
    if (error || !data || data.length > 3) throw new Error("Supporting model pool unavailable");
    return data as Record[];
  },
};
const hashes = new Map<string, Promise<{ [key: string]: string }>>();
export function builtinModelHashes(directory: string) {
  let result = hashes.get(directory);
  if (!result) {
    result = Promise.all(MODEL_FILES.map(async (name) => [name, createHash("sha256").update(await readFile(join(directory, name))).digest("hex")]))
      .then((entries) => Object.fromEntries(entries));
    hashes.set(directory, result);
  }
  return result;
}

let checkedAt = 0;
let records: Record[] = [];
let loading: Promise<Record[]> | null = null;
type Session = { promise: Promise<InferenceSession>; users: number; retired: boolean };
const sessions = new Map<string, Session>();
async function release(key: string, entry: Session) {
  if (!entry.retired || entry.users) return;
  if (sessions.get(key) === entry) sessions.delete(key);
  try { await (await entry.promise).release(); } catch { /* Failed loads have no live session. */ }
}
export function invalidateSupportingRegistry() { checkedAt = 0; records = []; }

async function enabled(directory: string): Promise<Record[]> {
  if (!supportingModelsEnabled()) return [];
  if (checkedAt && supportingRegistryDependencies.now() - checkedAt < 10000) return records;
  if (loading) return loading;
  loading = (async () => {
    try {
      const primary = await builtinModelHashes(directory);
      const rows = await supportingRegistryDependencies.readEnabled();
      const enabledIds = new Set(rows.map((row) => row.id));
      records = rows.filter((row) => (validIndependentPolicy(row.routing_policy) || (row.routing_policy?.version === 1 && row.routing_policy.cascade_test?.passed === true &&
        row.routing_policy.passed === true && Array.isArray(row.routing_policy.evaluated_pool_ids) &&
        row.routing_policy.evaluated_pool_ids.every((id) => enabledIds.has(id)))) &&
        MODEL_FILES.every((name) => row.routing_policy.builtin_hashes?.[name] === primary[name]));
      for (let pass = 0; pass < 3; pass++) {
        const validIds = new Set(records.map((row) => row.id));
        records = records.filter((row) => row.routing_policy.evaluated_pool_ids.every((id) => validIds.has(id)));
      }
    } catch {
      records = []; // Never retain a disabled/unknown pool after a registry error.
    }
    checkedAt = supportingRegistryDependencies.now();
    const current = new Set(records.map((row) => row.id));
    for (const [key, entry] of sessions) if (!current.has(key.split(":")[0]!)) { entry.retired = true; void release(key, entry); }
    return records;
  })();
  try { return await loading; } finally { loading = null; }
}

export async function supportingProposals(directory: string, language: string, text: string, primary: Scores): Promise<SupportProposal[]> {
  const models = await enabled(directory);
  const candidates = models.filter((row) => validRule(row.routing_policy.languages?.[language]) && needsSupport(primary, row.routing_policy.languages[language]!));
  const results = await Promise.all(candidates.map(async (row): Promise<SupportProposal | null> => {
    const key = `${row.id}:${language}`;
    let entry = sessions.get(key);
    if (!entry) {
      entry = { users: 0, retired: false, promise: prepareModelBundle(row.id, row.artifact_manifest)
        .then((bundle) => InferenceSession.create(join(bundle.directory, `sentiment_${language}.onnx`))) };
      sessions.set(key, entry);
    }
    entry.users++;
    try {
      const session = await entry.promise;
      const output = await session.run({ text: new Tensor("string", [text], [1, 1]) });
      const values = Array.from(output.probabilities?.data || [], Number);
      if (values.length !== 3) throw new Error("Invalid supporting model output");
      const scores = { negative: values[0]!, neutral: values[1]!, positive: values[2]! };
      ranked(scores);
      return { id: row.id, version: row.id, rule: row.routing_policy.languages[language]!, scores, independent: row.routing_policy.version === 2 };
    } catch {
      entry.retired = true;
      return null; // Missing/broken supports do not break built-in inference.
    } finally { entry.users--; await release(key, entry); }
  }));
  return results.filter((value): value is SupportProposal => value !== null);
}
