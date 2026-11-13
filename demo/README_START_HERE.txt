FUNDPROOF - SYNTHETIC HACKATHON DEMO KIT
=========================================
ALL DATA IS FABRICATED. No real nonprofit, funder, employee, or transaction is represented.

PRODUCT PURPOSE
FundProof proposes and explains allocations of nonprofit expenses and payroll to funding sources, based on grant-specific restrictions and evidence. The user reviews proposals before approval. This demo does NOT determine legal compliance.

FILES TO UPLOAD
1. Grant_A_Digital_Skills.pdf       grant agreement for digital skills program
2. Grant_B_Outreach.pdf             grant agreement for outreach program
3. transactions.csv                9 fictional financial transactions
4. employee_time_records.csv       time/effort details for payroll transaction T003
5. Sample_Receipts_and_Invoices.pdf fictional receipts and invoices
6. evidence_register.csv            pretend document-availability ledger; not proof itself
7. EXPECTED_TEST_CASES.txt          ground-truth review guide; DO NOT include in model's input

BACKGROUND
The fictional nonprofit also has an unrestricted operating fund. It can potentially cover general operating costs after authorized reviewer decisions. No unrestricted-fund accounting agreement or rules are supplied, so do not automatically allocate costs there.

HACKATHON DEMO FLOW
- Upload the grant agreements and CSVs.
- Display all nine transactions.
- Extract and cite the grant dates, categories, documentary requirements and restrictions.
- Suggest transaction-level allocations only when supported.
- For T003, reconcile 24h Digital Skills and 12h Outreach; flag the 4h with no program evidence.
- Ask for missing approval for T005 and payment proof for T009.
- Flag the pizza as excluded from Grant A and the early projector rental as outside award term.
- Export proposed allocations with reasoning, source text, uncertainty, and a human-review status.

IMPORTANT LIMITATIONS
The attached supporting PDF contains fictional document facsimiles. The evidence_register.csv says certain payment records are present but does not include them as separate documents. A robust agent should distinguish register assertions from actual source evidence and should not claim all proof has been verified.
