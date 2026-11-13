// Shared helpers for the recorded Claude runs in data/claude-runs (demo without an API key).
import fs from "node:fs/promises";
import path from "node:path";
import { RuleSchema, toGrantRules } from "../lib/ai/extractRules";
import { verifyCitation } from "../lib/data/verifyCitations";
import type { Dataset, GrantRule, SupportingDoc } from "../lib/types";

export const RUNS_DIR = path.join(process.cwd(), "data", "claude-runs");
const INPUTS = path.join(process.cwd(), "data", "inputs");

/** The three demo states. Each one adds an input to the one before. */
export const SCENARIOS = [
  { name: "initial", cacheFile: "analysis.initial.json", timesheets: null, docs: [] },
  { name: "after-fix", cacheFile: "analysis.after-fix.json", timesheets: "timesheets-corrected.csv", docs: [] },
  {
    name: "scope-of-work",
    cacheFile: "analysis.scope-of-work.json",
    timesheets: "timesheets-corrected.csv",
    docs: ["brightpath-scope-of-work.txt"],
  },
] as const;

export type Scenario = (typeof SCENARIOS)[number];

export async function scenarioOpts(s: Scenario): Promise<{ timesheetsCsv?: string; supportingDocs: SupportingDoc[] }> {
  const read = (f: string) => fs.readFile(path.join(INPUTS, f), "utf8");
  return {
    timesheetsCsv: s.timesheets ? await read(s.timesheets) : undefined,
    supportingDocs: await Promise.all(s.docs.map(async (file) => ({ file, text: await read(file) }))),
  };
}

/** Claude's reply pasted from a chat may be wrapped in a ```json fence; take the JSON object inside. */
export async function readReply(file: string): Promise<unknown> {
  const text = await fs.readFile(path.join(RUNS_DIR, file), "utf8");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`${file} has no JSON object`);
  return JSON.parse(text.slice(start, end + 1));
}

/** Recorded grant rules, with every quote checked against the PDF text in code. */
export async function loadRecordedRules(ds: Dataset): Promise<GrantRule[]> {
  const perFund = await Promise.all(
    ds.funds
      .filter((f) => f.sourceDoc)
      .map(async (f) => toGrantRules(f, RuleSchema.parse(await readReply(`rules.${f.code}.json`)))),
  );
  return perFund.flat().map((r) => ({ ...r, citation: verifyCitation(r.citation, ds.grantDocs) }));
}
