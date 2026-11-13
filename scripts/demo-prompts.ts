// Builds the exact prompts the live pipeline sends to Claude, as text files you can paste into Claude
// on a subscription account (no API key). Save each JSON reply where the prompt file says, then run
// scripts/replay-claude-runs.ts. Run: npx tsx scripts/demo-prompts.ts
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { RULES_SYSTEM, RuleSchema, rulesUserText } from "../lib/ai/extractRules";
import { PROPOSE_SYSTEM, ProposalSchema, proposalUserText } from "../lib/ai/proposeAllocations";
import { loadDataset } from "../lib/data/loadDataset";
import { RUNS_DIR, SCENARIOS, loadRecordedRules, scenarioOpts } from "./claude-runs";

const PROMPTS_DIR = path.join(RUNS_DIR, "prompts");

const outputFormat = (schema: z.ZodType) =>
  `OUTPUT FORMAT\nReply with one JSON object and nothing else: no prose before or after it, no comments. It must match this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema), null, 2)}`;

const prompt = (system: string, user: string, schema: z.ZodType) =>
  `${system}\n\n${user}\n\n${outputFormat(schema)}\n`;

async function main() {
  await fs.mkdir(PROMPTS_DIR, { recursive: true });
  const ds = await loadDataset();

  // Step 1: one prompt per grant agreement. Attach the PDF named in the file.
  for (const fund of ds.funds.filter((f) => f.sourceDoc)) {
    const file = path.join(PROMPTS_DIR, `1-rules-${fund.code}.txt`);
    await fs.writeFile(file, prompt(RULES_SYSTEM, rulesUserText(fund), RuleSchema));
    console.log(`wrote ${path.relative(process.cwd(), file)}  (attach data/inputs/${fund.sourceDoc}; save reply as data/claude-runs/rules.${fund.code}.json)`);
  }

  // Step 2: proposal prompts need the rule ids from step 1.
  const rules = await loadRecordedRules(ds).catch((err: Error) => {
    console.log(`\nStep 2 prompts not written yet: ${err.message}\nSave the step 1 replies, then run this script again.`);
    return null;
  });
  if (!rules) return;
  for (const [i, s] of SCENARIOS.entries()) {
    const opts = await scenarioOpts(s);
    const sds = await loadDataset({ timesheetsCsv: opts.timesheetsCsv });
    const file = path.join(PROMPTS_DIR, `${i + 2}-proposals-${s.name}.txt`);
    await fs.writeFile(file, prompt(PROPOSE_SYSTEM, proposalUserText(sds, rules, opts.supportingDocs), ProposalSchema));
    console.log(`wrote ${path.relative(process.cwd(), file)}  (no attachments; save reply as data/claude-runs/proposals.${s.name}.json)`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
