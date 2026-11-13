# Recorded Claude runs (demo without an API key)

We have no API credits, so the demo replays real Claude replies recorded on a Claude subscription.
The prompts are byte-for-byte what the live pipeline sends (`lib/ai/extractRules.ts`,
`lib/ai/proposeAllocations.ts`). Each reply then goes through the same code as a live run:
`buildResult` in `lib/pipeline.ts` checks every quote against the PDF text and computes every dollar.
Nothing in `data/cache` is hand-written. On stage, call it a **recorded Claude run**, not a live one.

## The three demo states

| State | Input the user gives | What changes |
|---|---|---|
| `initial` | the October bundle in `data/inputs/` | 9 supported, 2 not allowable, 2 need evidence (Maria, Brightpath) |
| `after-fix` | + `timesheets-corrected.csv` | Maria becomes supported, split by her logged hours |
| `scope-of-work` | + `brightpath-scope-of-work.txt` | Brightpath's $3,500 becomes supported on the federal grant |

## Steps

1. `npx tsx scripts/demo-prompts.ts` writes `prompts/1-rules-GRANT-FED.txt` and `prompts/1-rules-GRANT-FDN.txt`.
2. For each one, open a **new** chat on claude.ai (Opus), attach the PDF the script names, paste the
   whole file and send. Save Claude's reply exactly as given to `rules.GRANT-FED.json` / `rules.GRANT-FDN.json` here.
   A reply wrapped in a ```json fence is fine.
3. Run `npx tsx scripts/demo-prompts.ts` again. It now writes `prompts/2-proposals-initial.txt`,
   `3-proposals-after-fix.txt` and `4-proposals-scope-of-work.txt` with the rule ids from step 2.
4. Paste each into a **new** chat (no attachments) and save the reply as `proposals.<state>.json`.
5. `npx tsx scripts/replay-claude-runs.ts` writes `data/cache/analysis.<state>.json` and scores each
   one against `data/expected.json`.
6. Demo with `FUNDPROOF_MOCK=cache` in `.env.local`. `POST /api/analyze` picks the state from the
   request: nothing, `timesheetsCsv`, or `timesheetsCsv` + `supportingDocs`.

If a reply disagrees with `data/expected.json`, don't edit the JSON. Re-run that prompt in a fresh
chat, or show the result as it is. The point is that it's what Claude actually said.
