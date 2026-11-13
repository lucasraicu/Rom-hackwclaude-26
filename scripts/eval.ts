// DATA lane. Runs the live pipeline on both scenarios and scores it against data/expected.json.
// Usage: npm run eval   (needs ANTHROPIC_API_KEY in .env.local; makes real API calls)
import fs from "node:fs/promises";
import { runAnalysis } from "../lib/pipeline";

type Expected = Record<string, { status: string; splits: Record<string, number> }>;

async function score(name: string, expected: Expected, timesheetsCsv?: string) {
  const result = await runAnalysis({ timesheetsCsv });
  let pass = 0;
  for (const [id, exp] of Object.entries(expected)) {
    const got = result.allocations.find((a) => a.itemId === id);
    const gotSplits = Object.fromEntries((got?.splits ?? []).map((s) => [s.fund, s.amount]));
    const statusOk = got?.status === exp.status;
    const splitsOk =
      JSON.stringify(Object.entries(gotSplits).sort()) === JSON.stringify(Object.entries(exp.splits).sort());
    if (statusOk && splitsOk) pass++;
    else
      console.log(
        `  MISS ${id}: expected ${exp.status} ${JSON.stringify(exp.splits)}, got ${got?.status} ${JSON.stringify(gotSplits)}`,
      );
  }
  const s = result.summary;
  console.log(
    `${name}: ${pass}/${Object.keys(expected).length} items match; citations verified ${s.citationsVerified}/${s.citationsTotal}`,
  );
}

async function main() {
  const expected = JSON.parse(await fs.readFile("data/expected.json", "utf8"));
  await score("initial", expected.initial);
  await score("afterFix", expected.afterFix, await fs.readFile("data/inputs/timesheets-corrected.csv", "utf8"));
}

main();
