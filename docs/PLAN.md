FundProof — revised hackathon plan
Hack With Claude · UC Berkeley · Friday, November 13, 2026
Track: 05 Day Zero — pitch as day one of a real startup
Code freeze: 4:15 PM · Live demos: 4:30–5:30 PM, Chou Hall N100 · No slides
One-line pitch
Drop in a nonprofit's messy grant PDFs, emails, payroll lists, expense records, and spreadsheets. FundProof identifies the costs, proposes which restricted or unrestricted funds can cover each one, links every recommendation to actual source evidence and applicable rules, and flags what is missing or contradictory before a human approves the allocation.

This is evidence-backed allocation assistance, not automated bookkeeping, posting to the general ledger, or a legal/compliance certification.
The problem and the demo hook
A real contact at a small nonprofit manually tracks restricted-fund allocations in spreadsheets every month. Supporting information is scattered across grant documents, payroll files, timesheets, email approvals, and receipts. The difficult part is not just entering expenses: it is knowing which fund can pay, why, and whether the documentation actually substantiates that charge.

Ask the contact, if feasible, for (1) hours spent on this per month and (2) a quotable sentence. Never put their real grant, salary, donor, or personnel data in the hackathon demo without explicit permission; use fictional/synthetic records.
What the judges should see (under two minutes)
1. Messy input, one drop zone. Upload a mixed bundle containing two grant-agreement PDFs, a transaction spreadsheet, a salary/payroll list, a timesheet, a receipt, and an email approval (.eml or pasted text). Files are not pre-labeled by the user. Show their detected types, what records were extracted, and any unsupported/uncertain extraction.
2. FundProof connects the dots. The dashboard shows 13 distinct cost items (not 13 documents), funding proposals, totals by fund, and statuses: Supported, Needs Evidence, Conflict, or Not Eligible. Each row has a concrete rationale; no unexplained green checkmarks.
3. Click one cost. The evidence drawer shows the expense and candidate funds; grant clause, source filename/page or email metadata; applicable federal provision only if the award is federal or an applicable subaward; calculation; and missing/contradictory documents. Clearly differentiate source quote verified from allocation supported.
4. The climax: fix Maria's salary. The original payroll list proposes a charge, but the evidence for the work performed is absent or conflicts with the budget estimate. Upload a corrected timesheet PDF or emailed work-activity record (CSV still works as fallback). Re-analyze; FundProof matches the new evidence to Maria and proposes the documented 60% / 20% / 20% distribution, with dollar amounts computed in code. Show which source and reason changed. If the new record still does not substantiate the split, keep Needs Evidence; never force green.
5. Close: “FundProof doesn't just tell small nonprofits where to put money. It shows why—and what proof they still need.”
Product behavior: from arbitrary-looking files to allocation proposals
The user should not have to prepare a standard template or identify which file is a grant, expense, payroll list, or email. For the demo, handle common formats reliably and reject unsupported ones explicitly rather than promising literally every format.
Input support and priorities
Priority	Input	What to extract	Source locator
Must	Machine-readable PDF (grant terms, receipts, salary reports, timesheets)	Funding rules, dates, budgets, payee/cost, work activity, approvals	Filename + PDF page + matched excerpt
Must	CSV (bank/transaction exports, payroll, hours)	Transactions, employees, dates, descriptions, amounts, hours	Filename + row/column
Must	XLSX (salary list, payroll, expenses, timesheets)	Equivalent tabular records regardless of header naming	Filename + sheet/row/column
Must	EML or pasted email text	Sender/date/subject, approvals, clarifications, restrictions, activity evidence	Filename or email subject/date + quoted passage
Should	TXT	Plain-language rules, explanations, or records	Filename + line/text offset
Stretch	DOCX, pasted multi-message threads	Text/paragraph/table extraction	Filename + paragraph/table location
Out for today	Images, screenshots, scanned-image PDFs with no extractable text, MSG/OST, cloud inbox sync, password-protected PDFs, arbitrary proprietary files	Show Unsupported / needs readable source and continue with supported files	N/A


Claude can inspect PDFs visually, but the demo only calls a PDF citation verified when an extractable text passage can be matched to the page. No OCR dependency in today's critical path. If an email's authenticity or a corrected timesheet's reliability is unclear, say so; an email saying “approved” is not automatically sufficient proof of time worked.
End-to-end processing
1. Ingest & classify. Accept many files at once. Detect file format, extract raw text/tables and document metadata, classify each file (grant, policy, transaction list, payroll, timesheet, receipt, email, unknown). Keep unknowns with a visible warning. File size/type validation, sane page/row limits, and basic error handling.
2. Normalize. Claude maps varied headers and prose into shared structures: Grant, Rule, CostItem, EmployeeWorkRecord, SupportingEvidence. Keep original source references for every extracted field. Missing fields remain null; no fictional amounts, employees, or evidence.
3. Reconcile, don't double-count. Link receipts, emails, payroll and timesheets to the same underlying cost when supported. The salary list and a bank payroll debit are not automatically separate costs. Use exact identifiers where available and candidate matches by date/employee/vendor/amount; ambiguous matches are flagged for review. Build a canonical 13-item cost ledger from the synthetic dataset.
4. Identify fund types & rules. Determine whether each potential funding source is federal award/subaward, private donor-restricted, or unrestricted. Extract grant-specific restrictions (eligible purposes, dates, approvals, line-item ceilings, remaining funding when data is available). Apply the curated federal rule subset only when relevant. Unclear award type becomes Needs Evidence rather than an assumed federal or private classification.
5. Propose allocations and status. Claude proposes fund percentages, reasons, linked evidence IDs, linked rule IDs, and evidence gaps/conflicts. It may recommend no allocation if support is insufficient. For shared expenses, require a defensible benefit/work basis; a budgeted percentage by itself is not a final payroll substantiation.
6. Deterministic validation. TypeScript validates that all IDs exist, percentages sum to 100% for fully allocated items, funding periods/amounts/budget caps are checked when known, no cost is counted twice, all citation excerpts can be found at their source locations, and money rounds correctly to cents (final cent assigned deterministically). Missing budget balance is unknown, not assumed sufficient. Fail validation to Needs Evidence or Conflict, never fabricate a verified badge.
7. Present actionable review. Show proposed split, evidence-backed explanation, rule applicability, and the exact missing file or fact that could resolve a flag. The user accepts/rejects only as a local review state; do not claim to post funds or approve reimbursement.
8. Incremental fix loop. Newly uploaded evidence is parsed and linked to existing cost/employee IDs. Re-evaluate affected items, update the proposed split, and show before/after source and reasoning. Re-running all 13 is acceptable under the hackathon time budget if simpler and reliable.
Status and evidence semantics
- Supported: Available evidence corroborates the proposed allocation under the implemented checks; not a certification of compliance.
- Needs Evidence: Important documentation absent, an award type unclear, or source not machine-readable. Display the precise missing item.
- Conflict: Two sources disagree on a material fact (hours, amount, date, restriction, or proposed split); do not silently choose one.
- Not Eligible: A known grant term or checked restriction rules out the charge; cite the actual restriction.
- Source verified: An extracted quote and location match the original source text. This badge does not mean the underlying claim is true.
- Proposed vs approved: All generated fund splits remain proposals until a human reviewer decides.
Example review row (illustrative only)
Maria · October payroll · $3,000 · Needs Evidence
Tentative funds: Federal tutoring 60%, private foundation 20%, unrestricted 20%
Why flagged: Payroll establishes salary amount, but the original activity records do not substantiate all claimed tutoring hours; an approved budget is not sufficient final support.
Evidence: payroll-oct.xlsx / Salaries row 7; tutoring-grant.pdf p. 3; timesheets-original.xlsx / October row 12.
Needed: Records of actual work that are reliable, compatible with the organization's records, and support the distribution.
After corrected evidence: If supported, code computes $1,800 / $600 / $600, keeps the supporting provenance, and shows the change.
Rulebook: narrow, applicable, sourced
Do not build a universal nonprofit legal rules engine. Use two mandatory layers and one optional classification:
1. Grant/funder terms (must). Extract eligible and prohibited activities, approved periods, restrictions, required approvals, budget line limits and donor restrictions from each agreement; store actual snippets with page numbers. Private foundation restrictions matter even without federal funding.
2. Curated federal subset (must for applicable awards only). Read-only, version-labeled data/rules/federal-subset.json with selected checks and source URLs: 2 CFR §§ 200.403 (allowability/documentation), 200.405 (allocability/relative benefit), and 200.430(g) (personnel cost documentation). Other provisions and agency-specific award terms are outside today's automated check scope. If a grant is federal, show what is checked and what is not; do not claim that passing these three rules proves compliance.
3. ASC 958-oriented classifications (stretch). Optionally suggest program, management/general, or fundraising, separately from which grant pays. Do not confuse functional expense category with donor-restricted versus unrestricted net-asset classification. IRS Form 990, payroll-law compliance, Section 4958 compensation reviews, state charity registration, and complete ASC 958 reporting are explicitly future roadmap, not pass/fail rules in the hackathon.
Federal rules are based on the award's applicable terms/version and may require agency-specific interpretation. Federal regulations are reference material, not a substitute for reading the grant. No real legal conclusion, audit assurance, or clawback prediction.

Reference URLs (curated, not scraped live):
- https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/section-200.403
- https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/section-200.405
- https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/section-200.430
Architecture (keep it simple)
Upload PDF / CSV / XLSX / EML / text  +  fictional starter files
                |
                v
lib/data/parseFiles.ts        format-specific parsing and metadata
lib/ai/classifyAndExtract.ts  document types + structured facts with source refs
                |
                v
lib/data/normalize.ts        Grants, CostItems, WorkRecords, Evidence
lib/data/reconcile.ts        connect evidence; deduplicate expense records
                |
                v
lib/ai/extractRules.ts       grant clauses (cache: grant-rules.json)
+ data/rules/federal-subset.json + fund applicability checks
                |
                v
lib/ai/proposeAllocations.ts statuses, proposed fund %, explanation,
                             evidence IDs, rule IDs, missing/conflict flags
                |
                v
lib/pipeline.ts              deterministic validation + split math + summaries
                |
                v
POST /api/analyze  <------ POST /api/upload (uploaded files / parsed set)
                |
                v
app/page.tsx                 drop zone + 13-row review + evidence drawer
                             + upload-fix + before/after + fallback mode

FUNDPROOF_MOCK=1 -> lib/fixtures/*  |  live cached results -> data/cache/*
Stack: Next.js 15 App Router, TypeScript, Tailwind, @anthropic-ai/sdk (claude-opus-5-5) and Zod validation. Use appropriate lightweight server-side PDF, CSV, XLSX and EML parsers. Keep all parsing server-side. No database, authentication, third-party mailbox integration, autonomous multi-agent network, OCR service, or live accounting API. Demo-only files may be kept in a temp folder or process memory; don't rely on cross-request in-memory state alone if it breaks the fix loop. Never log secrets or sensitive payroll contents.
Shared types (lock before the three lanes split)
The exact TypeScript interfaces belong in lib/types.ts, agreed by all three developers before other work. Minimum shared fields:
Document { id, filename, kind, mimeType, parseStatus, warnings[] }
SourceRef { documentId, page?, sheet?, row?, column?, emailSubject?,
            emailDate?, textStart?, textEnd?, exactExcerpt?, verified }
Evidence { id, type, source: SourceRef, facts, linkedCostIds[] }
Fund { id, name, kind: 'federal'|'private_restricted'|'unrestricted'|'unknown',
       period?, restrictions?, availableBalance? }
Rule { id, fundId?, jurisdiction: 'grant'|'federal',
       reference, quotedText, source: SourceRef, applicability }
CostItem { id, date, payeeOrEmployee, description, amountCents,
           sourceEvidenceIds[], category? }
Proposal { costId, status: 'supported'|'needs_evidence'|'conflict'|'not_eligible',
           splits: { fundId, percent, amountCents }[], evidenceIds[],
           ruleIds[], explanation, missingEvidence[], conflicts[], checks[] }
AnalysisResult { documents[], funds[], costs[], proposals[], summary,
                 warnings[], runMode, analyzedAt }
Make amountCents the only source of truth for dollar arithmetic. Every decision must link to the underlying evidence and rule identifiers, not just a paragraph written by Claude. Verify text excerpts against source text rather than trusting a model-supplied verified boolean. unknown/unreadable inputs must be visible to reviewers.
Fictional dataset and acceptance tests
Use a single fictional nonprofit, one October accounting period, two grant PDFs, and exactly 13 distinct cost items. Spread evidence across formats so the upload itself demonstrates the product:
data/inputs/
  tutoring-federal-grant.pdf
  community-foundation-grant.pdf
  october-transactions.xlsx       # or CSV backup
  october-salary-list.xlsx         # salary amounts and employee names
  october-timesheets.xlsx          # work-activity evidence
  approval-email.eml              # an approval/clarification, not a new cost
  equipment-receipt.pdf           # supports an existing transaction
  maria-correction.eml            # or corrected-timesheet.pdf for fix loop
  timesheets-corrected.csv        # guaranteed fallback
Data lane owns data/expected.json. Include cases for supported private grant expense; supported federal cost with allocation basis; unsupported federal personnel allocation; expense outside grant dates; prohibited charge; duplicate receipt/ledger description; email approval that still lacks essential supporting data; conflicting records; unrestricted expense; and at least one mixed-fund split. Exact case composition can change, but the 13 canonical costs must remain stable.

npm run eval must test both before and after Maria's correction:
- 13/13 items returned, IDs and cent totals correct; no duplicates.
- Required status and proposed fund splits match the synthetic expected cases (no guessing when evidence absent).
- Every asserted grant quote resolves to the specified file/page; spreadsheet evidence resolves to sheet/row; email evidence to the correct source.
- Correctly flags missing and conflicting evidence; never uses a federal rule for private-only funds.
- Maria's correction changes the intended row and support explanation, giving 60/20/20 only if the supplied evidence justifies it.
- Unsupported/unreadable file and Claude API failure yield a usable warning/fallback, not a crash.
- FUNDPROOF_MOCK=1 returns an identical AnalysisResult schema; UI works independently of AI.
Score 13/13 is a target on the synthetic evaluation, not a guarantee of real-world accounting accuracy. Test the one-step manual review states and an upload re-run end to end.
Three work lanes (one developer + one Claude coding agent each)
Lane	Ownership — do not edit other lanes	Deliverable
UI	app/page.tsx, app/components/**, app/globals.css, app/layout.tsx	Multi-file drop zone, processing state, summary by fund/status, 13-item allocation table, evidence drawer with source locators and verified-source badge, explicit flags, fix-upload, before/after row. Build from mock first.
AI	lib/ai/**, lib/pipeline.ts, app/api/analyze/**	Document classification/extraction calls, grant-rule extraction, fund-applicability logic, evidence-aware allocation proposal, citations, server validation integration, reliable live and cached paths. Tune against 13-item expected results.
DATA	data/**, lib/data/**, scripts/**, app/api/upload/**, app/api/dataset/**	Fictional mixed-format dataset, format parsers, normalization, reconciliation/dedup, source-locator verification helpers, math/test helpers (expose functions to AI), eval script, caches/fallback, demo script and rehearsal.
Shared, announce before editing	lib/types.ts, lib/fixtures/**, package.json, package-lock.json, CLAUDE.md, docs/**	Freeze schemas and endpoint contracts first; one person handles package installs; small commits and Murmur announcements for shared changes.


Contract boundaries: POST /api/upload yields parsed Document[] + normalized facts or a dataset/session ID; POST /api/analyze accepts that ID/parsed dataset and returns AnalysisResult. Prefer one simple server runtime where uploaded files and cache remain reachable. If easier, a single multipart /api/analyze is acceptable—agree on one approach before implementation and do not build both. A re-upload can re-run the bundle plus the added file. The DATA lane owns parsing/source verification helpers; AI lane calls them from the pipeline.
Timeline (today — retain the 4:15 deadline)
Time	Milestone	Required proof
1:15–1:30	Setup; npm install, .env.local, mur join; freeze lib/types.ts and upload/analyze contracts; claim lanes	Mock page renders and everybody knows the contract
1:30–2:30	Parallel M1. DATA: PDF/CSV/XLSX/EML parsing and synthetic bundle. AI: live extract → propose pipeline. UI: mock drop zone, table, drawer	13 canonical costs visible; first live run produces schema-valid proposals
2:00	Move to Chou N100; lunch 2:30	
2:30	Integration check: pull main, run FUNDPROOF_MOCK=0	Mixed-file upload → 13 rows → evidence drawer on one laptop
2:30–3:30	M2: strict evidence flags, deterministic validation, Maria's unstructured corrected evidence, evaluators	npm run eval for initial + fixed states; live fix loop succeeds
3:30	Feature complete; no new formats/features	Mandatory product behavior works
3:30–4:00	Polish, cache one known-good result for each scenario, rehearse three times	Full two-minute demo, even with no network
4:00	One person meets judges; two rehearse	
4:15	Code freeze	Clean build; demo laptop ready; fallback pretested


Cut list if behind at 3:00 (cut top first)
1. CSV/export of allocations; on-screen eval scoring.
2. DOCX, multi-email parsing, additional extension support; keep PDF/CSV/XLSX/EML.
3. Incremental reprocessing (re-run all 13); before/after animation (simple highlighted row sufficient).
4. Live grant-rule extraction during demo (use committed extracted rule cache).
5. Live arbitrary-header normalization of every input (fallback to known synthetic files but do not pretend this is general support).
6. If XLSX/EML parser is the blocker, convert the demo's spreadsheet to CSV and email to pasted text as an explicit fallback; keep the story and evidence flow honest.
Never cut: actual source links, missing/contradictory evidence flags, deterministic allocation amounts, credible fund-specific applicability, and the Maria fix loop. Preserve one reliable live end-to-end path over many half-working formats.
Risks and controls
Risk	Mitigation
Variable input files produce broken extraction	Require a shared normalized schema, show warnings, use small tested files and robust parser errors; supported formats are stated explicitly.
Same payroll/receipt appears twice	Canonical cost IDs plus explicit dedup/reconciliation; ambiguous joins remain flagged.
Claude invents a clause, location, amount, or split	Verify provenance, reject unknown IDs and unsupported percentages, compute cents in code, fail closed to Needs Evidence/Conflict.
Grant/federal applicability is ambiguous	Preserve unknown, don't impose 2 CFR on private-only grants, show uncertainty and human review needed.
Scan/image lacks verifiable text	Warn that source is unreadable/unverified; no fake verified quote.
API is slow, down, or Wi-Fi drops	FUNDPROOF_MOCK=1, known-good cached data/cache/analysis.initial.json and analysis.fixed.json, cached rules, and offline demo script; disclose demo mode.
New uploaded evidence does not automatically prove a split	Require corroborating work/activity records and valid source; conflict remains until resolved.
Sensitive salary or donor information	Fictional demo records only; no logging/uploading actual records without permission; never expose API keys client-side.
Merge conflicts	Strict file ownership; shared edits announced in Murmur.
Judges don't know grant accounting	Start with the real manual-work pain, drop messy files, reveal one flagged decision and resolve it. Avoid legal jargon in the first 20 seconds.


Demo script (target ~110 seconds)
0–20s: “A small nonprofit spends hours figuring out which grant can pay for each cost. All the proof lives in disconnected PDFs, emails, and payroll sheets.” Drop a mixed bundle in FundProof.

20–45s: “We classified the documents, extracted 13 expenses, matched receipts and payroll to evidence, and proposed allocations.” Show the summaries and one supported row.

45–75s: Open Maria. “The planned split is not enough—we cannot substantiate her work activity. Here's the grant clause, the personnel documentation requirement, and the exact record we're missing.”

75–100s: Upload a corrected time record or email-backed record; re-analyze. “Now we can trace the proposed 60/20/20 split to actual work evidence; the dollars are calculated in code.”

100–110s: “FundProof makes fund allocations explainable, reviewable, and evidence-backed for nonprofits still operating in spreadsheets.”
Definition of done
A skeptical judge can hand FundProof the supported kinds of messy files, see 13 non-duplicated cost items, understand why each fund split was proposed, click real source locations and applicable rules, watch the system flag missing or conflicting proof rather than invent it, upload corrected documentation, and see a defensible recalculation. All in under two minutes, with a pretested fallback