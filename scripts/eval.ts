// DATA lane. Default: live Claude calls. Offline: npx tsx scripts/eval.ts --fixtures
// --cache checks saved live fallbacks; --save-cache saves both scenarios only if both pass.
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { evaluateAnalysis, type ExpectedItems } from "../lib/data/evaluateAnalysis";
import { loadDataset } from "../lib/data/loadDataset";
import type { AnalysisResult } from "../lib/types";

async function main() {
  const args = new Set(process.argv.slice(2));
  for (const arg of args) if (!["--fixtures", "--cache", "--save-cache"].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
  if (args.has("--fixtures") && args.has("--cache")) throw new Error("Choose either --fixtures or --cache.");
  const mode = args.has("--fixtures") ? "fixtures" : args.has("--cache") ? "cache" : "live";
  if (args.has("--save-cache") && mode !== "live") throw new Error("Only live evaluation may save demo caches.");
  try { loadEnvFile(".env.local"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (mode === "live" && !process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("Live evaluation needs ANTHROPIC_API_KEY. Configure it locally, or use: npx tsx scripts/eval.ts --fixtures");
  const expected: { initial: ExpectedItems; afterFix: ExpectedItems } = JSON.parse(await fs.readFile("data/expected.json", "utf8"));
  const corrected = await fs.readFile("data/inputs/timesheets-corrected.csv", "utf8");
  const scenarios = [
    { name: "initial" as const, filename: "analysis.initial.json", opts: {} },
    { name: "afterFix" as const, filename: "analysis.after-fix.json", opts: { timesheetsCsv: corrected } },
  ];
  const passedResults: { filename: string; result: AnalysisResult }[] = [];
  let allPassed = true;
  console.log(`Evaluation source: ${mode}${mode === "live" ? " (real API calls; FUNDPROOF_MOCK does not bypass the pipeline)" : " (no API calls)"}`);
  for (const scenario of scenarios) {
    try {
      const result: AnalysisResult = mode === "live"
        ? await (await import("../lib/pipeline")).runAnalysis(scenario.opts)
        : JSON.parse(await fs.readFile(path.join(mode === "fixtures" ? "lib/fixtures" : "data/cache", scenario.filename), "utf8"));
      if (mode === "live" && result.mode !== "live") throw new Error("Live pipeline returned a non-live result.");
      if (mode === "fixtures" && result.mode !== "mock") throw new Error("Fixture result must be labeled mock.");
      if (mode === "cache" && result.mode !== "live" && result.mode !== "cache") throw new Error("Demo cache must contain a live or cached result, not a mock fixture.");
      const score = evaluateAnalysis(result, expected[scenario.name], await loadDataset(scenario.opts));
      console.log(`${scenario.name}: ${score.matched}/${score.total} items match; citations verified ${score.citationsVerified}/${score.citationsTotal}; ${score.passed ? "PASS" : "FAIL"}`);
      for (const issue of score.issues) console.error(`  FAIL ${issue}`);
      allPassed &&= score.passed;
      if (score.passed) passedResults.push({ filename: scenario.filename, result });
    } catch (error) {
      allPassed = false;
      console.error(`${scenario.name}: FAIL ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (allPassed && args.has("--save-cache")) {
    await fs.mkdir("data/cache", { recursive: true });
    for (const { filename, result } of passedResults) await fs.writeFile(path.join("data/cache", filename), JSON.stringify(result, null, 2) + "\n");
    console.log("Saved both passing live scenarios in data/cache/.");
  }
  if (!allPassed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`Evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
