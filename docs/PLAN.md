# FundProof plan

Hack With Claude, UC Berkeley, Friday Nov 13 2026. Track: **05 Day Zero** (pitch it like day one of a startup).
Code freeze **4:15 PM**. Live demos **4:30 to 5:30 PM** in Chou Hall N100. Judges rotate; no slides.

## One-line pitch

FundProof reads a small nonprofit's grant agreements, transactions and payroll, proposes which fund pays for each cost, and cites the exact grant clause behind every decision. When the evidence is missing, it refuses to guess and says what document would fix it.

## The problem (open the demo with this)

A real contact runs a small nonprofit with restricted grants and tracks allocations by hand in a spreadsheet every month. Charging a cost to the wrong grant is an audit finding, and on a federal award the money can be clawed back. Tools like Sage Intacct, MIP and Aplos do fund accounting, but they need setup and a consultant. Small orgs live in spreadsheets.

Get from the contact before 2:30: **hours per month she spends on this**, and one sentence we can quote.

## What we build (and what we don't)

Build:
1. Load one fictional org's October records: 2 grant agreement PDFs, transactions, payroll, timesheets (`data/inputs/`).
2. Claude extracts each grant's rules with exact quotes and page numbers.
3. Claude proposes a status, funds and a reason for all 13 items, citing rule ids.
4. Code computes every dollar amount and checks every quote against the PDF text ("verified" badge).
5. Review screen: summary, table, evidence panel per item.
6. **Fix loop (the climax):** Maria's salary is flagged because the budget says 30% foundation but her timesheet shows no tutoring hours. Upload `timesheets-corrected.csv`, re-run, and her split becomes supported at 60/20/20.

Don't build: a database, auth, multi-org support, real accounting integrations, multi-agent orchestration, or OCR. Export is a stretch goal.

## Architecture

```
data/inputs/*.pdf,*.csv ──> lib/data/loadDataset.ts ──> Dataset
                                                          │
grant PDFs ──> lib/ai/extractRules.ts (Claude) ──> GrantRule[] (cached in data/cache/grant-rules.json)
                                                          │
Dataset + rules ──> lib/ai/proposeAllocations.ts (Claude) ──> status, funds %, reason, ruleIds
                                                          │
lib/pipeline.ts: computeSplits ($) + verifyCitations (quote in PDF?) + summarize ──> AnalysisResult
                                                          │
POST /api/analyze ──> app/page.tsx (review UI)        FUNDPROOF_MOCK=1 returns lib/fixtures/*.json
```

- Stack: Next.js 15 (App Router) + TypeScript + Tailwind. Claude via `@anthropic-ai/sdk`, model `claude-opus-5-5`, structured outputs with zod.
- No database. Inputs are files; results are JSON in memory.
- The shared contract is `lib/types.ts`. The mock fixtures match it exactly, so the UI never waits on the AI lane.
- Claude never does arithmetic. It picks statuses, funds and reasons; code computes amounts.

## Lanes (one person + one agent each)

| Lane | Owns (only edit these) | Delivers |
|---|---|---|
| **UI** | `app/page.tsx`, `app/components/**`, `app/globals.css`, `app/layout.tsx` | Review screen: summary bar (totals by status and fund), allocation table with status chips, evidence drawer (reason, quotes with verified badge and page, regulations, missing evidence), upload for the corrected timesheet, before/after highlight on the changed row. Builds against mock mode. |
| **AI** | `lib/ai/**`, `lib/pipeline.ts`, `app/api/analyze/**` | Live pipeline returns correct results for both scenarios. Tune prompts until `npm run eval` scores 13/13 on both. Commit a good `data/cache/grant-rules.json`. Handle errors so the demo can't crash. |
| **DATA** | `data/**`, `lib/data/**`, `scripts/**`, `app/api/dataset/**` | Dataset correct and realistic, `/api/dataset` working, citation verifier and split math tested, eval script reliable. Then: save a known-good live result as `data/cache/analysis.*.json` demo fallback, and own the demo script and rehearsal. |
| **Shared** | `lib/types.ts`, `lib/fixtures/**`, `package.json`, `package-lock.json`, `CLAUDE.md`, `docs/**` | Announce on Murmur before editing. One small commit per change. |

## Timeline (today)

| Time | Milestone | Done when |
|---|---|---|
| 1:15–1:30 | **Setup.** Clone, `npm install`, `.env.local`, `mur join`, claim your lane issue. | Everyone sees the others in `who`; `npm run dev` shows the placeholder table in mock mode. |
| 1:30–2:30 | **M1: lanes in parallel.** UI on mock data; AI gets the live pipeline running; DATA checks the dataset and `/api/dataset`. | Live `/api/analyze` returns 13 items (any quality). UI table and evidence drawer render the mock. |
| 2:00 | Move to Chou N100. Lunch at 2:30. | |
| 2:30 | **Integration check 1.** Everyone pulls `main`; run with `FUNDPROOF_MOCK=0`. | End to end works live on one laptop. |
| 2:30–3:30 | **M2: correctness and the fix loop.** AI tunes to 13/13; UI builds the upload and before/after; DATA runs eval after every prompt change. | Eval 13/13 initial and after-fix; fix loop works live. |
| **3:30** | **Feature complete.** Nothing new after this. | |
| 3:30–4:00 | Polish, demo fallback (mock or cached result toggle), rehearse 3 times. | Demo runs in under 2 minutes. |
| 4:00 | Meet the judges (one person goes; two keep rehearsing). | |
| **4:15** | **Code freeze.** | `main` builds; demo laptop ready. |

## Cut list (cut from the top if behind at 3:00)

1. CSV export of allocations.
2. Eval score shown on screen.
3. Live grant-rule extraction (use the committed cache).
4. Before/after animation.

Never cut: the needs-evidence refusal, the fix loop, verified citations.

## Risks

| Risk | Plan |
|---|---|
| API slow or Wi-Fi drops during judging | Demo laptop keeps `FUNDPROOF_MOCK=1` ready, or a cached live result. Rules are cached. |
| Claude miscategorizes an item | Eval catches it; tune prompt; the answer key is `data/expected.json`. |
| Merge conflicts | Lanes own separate files; shared files are announced on Murmur first. |
| Judges glaze over "fund accounting" | Open with the person and the dollars, not the product. See `docs/DEMO.md`. |
