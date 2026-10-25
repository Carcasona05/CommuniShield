/** Read-only comparison of an ONNX candidate with the model actually active in the app.
 * node --import tsx scripts/seed/checkContrastiveCandidate.ts <run-directory>
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { InferenceSession, Tensor } from "onnxruntime-node";
import { getActiveModelBundle } from "../../src/services/sentimentModelRegistry.js";

const labels = ["negative", "neutral", "positive"];
async function main() {
  const run = resolve(process.argv[2] || "");
  const report = JSON.parse(readFileSync(join(run, "report.json"), "utf8"));
  if (!report.eligible) throw new Error("Candidate failed its training gates.");
  const bundle = await getActiveModelBundle(resolve("models"));
  const active = await InferenceSession.create(join(bundle.directory, "sentiment_cebuano.onnx"));
  const candidate = await InferenceSession.create(join(run, "models", "sentiment_cebuano.onnx"));
  const language = await InferenceSession.create(join(bundle.directory, "language_id.onnx"));
  try {
    const checks = [];
    for (const check of report.after) {
      const input = { text: new Tensor("string", [check.text], [1, 1]) };
      const a = await active.run(input);
      const c = await candidate.run(input);
      const l = await language.run(input);
      const classify = (output: Record<string, Tensor>) => {
        const p = Array.from(output.probabilities!.data, Number);
        const index = p.indexOf(Math.max(...p));
        return { label: labels[index], confidence: p[index], probabilities: p };
      };
      const old = classify(a);
      const next = classify(c);
      const lp = Array.from(l.probabilities!.data, Number);
      checks.push({ text: check.text, expected: check.expected, active: old, candidate: next,
        routedLanguage: ["cebuano", "english", "filipino"][lp.indexOf(Math.max(...lp))] });
      // Exported text vectorizers can differ slightly in tokenization/precision;
      // require identical labels and bounded probability drift on these checks.
      if (next.label !== check.predicted || Math.abs(next.confidence! - check.confidence) > 0.02) {
        throw new Error(`ONNX export differs from Python: ${JSON.stringify({ text: check.text, python: { label: check.predicted, confidence: check.confidence }, onnx: next })}`);
      }
    }
    const output = { activeVersion: bundle.version, activeDirectory: bundle.directory,
      activeCorrect: checks.filter(c => c.active.label === c.expected).length,
      candidateCorrect: checks.filter(c => c.candidate.label === c.expected).length,
      total: checks.length, checks,
      test: {} as Record<string, { macroF1: number; recalls: Record<string, number> }> };
    const test: Array<{ text: string; label: string }> = JSON.parse(readFileSync(join(run, "evaluation-input.json"), "utf8"));
    for (const [name, session] of [["active", active], ["candidate", candidate]] as const) {
      const matrix = labels.map(() => labels.map(() => 0));
      for (let offset = 0; offset < test.length; offset += 64) {
        const batch = test.slice(offset, offset + 64);
        const result = await session.run({ text: new Tensor("string", batch.map(r => r.text), [batch.length, 1]) });
        const p = Array.from(result.probabilities!.data, Number);
        for (let i = 0; i < batch.length; i++) {
          const scores = p.slice(i * 3, i * 3 + 3);
          matrix[labels.indexOf(batch[i]!.label)]![scores.indexOf(Math.max(...scores))]!++;
        }
      }
      const recalls: Record<string, number> = {};
      let macroF1 = 0;
      for (let i = 0; i < labels.length; i++) {
        const tp = matrix[i]![i]!;
        const support = matrix[i]!.reduce((a, b) => a + b, 0);
        const predicted = matrix.reduce((sum, row) => sum + row[i]!, 0);
        recalls[labels[i]!] = support ? tp / support : 0;
        macroF1 += support + predicted ? 2 * tp / (support + predicted) / labels.length : 0;
      }
      output.test[name] = { macroF1, recalls };
    }
    const a = output.test.active!;
    const c = output.test.candidate!;
    const passed = c.macroF1 >= a.macroF1 - 0.005 && c.recalls.negative! >= a.recalls.negative! - 0.02
      && c.recalls.positive! >= a.recalls.positive! - 0.02 && output.candidateCorrect > output.activeCorrect;
    writeFileSync(join(run, "onnx-verification.json"), JSON.stringify(output, null, 2));
    console.log(JSON.stringify({ activeVersion: output.activeVersion, activeCorrect: output.activeCorrect,
      candidateCorrect: output.candidateCorrect, total: output.total, test: output.test, passed, reportedComment: checks[0] }, null, 2));
    if (!passed) throw new Error("Candidate failed comparison against the actual active ONNX model.");
  } finally {
    await Promise.all([active.release(), candidate.release(), language.release()]);
  }
}
main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
