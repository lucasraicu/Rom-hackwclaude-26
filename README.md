# FundProof

From messy nonprofit records to explainable fund allocations. Built at Hack With Claude, UC Berkeley, Nov 13 2026.

FundProof reads a small nonprofit's grant agreements, transactions and payroll. Claude proposes which fund pays for each cost and cites the exact grant clause behind each decision. Code computes every amount and checks every quote against the PDF. When the evidence is missing, FundProof says what document would fix it instead of guessing.

- Plan: [docs/PLAN.md](docs/PLAN.md)
- Demo script: [docs/DEMO.md](docs/DEMO.md)
- Team rules for people and agents: [CLAUDE.md](CLAUDE.md)

## Setup (each teammate, about 5 minutes)

1. Accept the collaborator invite for this repo (Murmur needs push access).
2. Clone and install:

   ```bash
   git clone https://github.com/lucasraicu/Rom-hackwclaude-26.git
   cd Rom-hackwclaude-26
   npm install
   cp .env.example .env.local
   ```

3. Put your Anthropic API key in `.env.local`. Leave `FUNDPROOF_MOCK=1` while building UI.
4. `npm run dev` and open http://localhost:3000. Click **Analyze October**; you should see 13 rows.
5. Open the repo in T3 Code (or Claude Code) and start your agent. It reads the Murmur section in `CLAUDE.md` and asks whether to join. Say yes. Then run `mur ui` to see everyone's agents.
6. On GitHub, assign yourself to your lane issue (UI, AI or DATA). Tell your agent:

   ```text
   Read CLAUDE.md, TASKS.md and docs/PLAN.md. I own the <UI|AI|DATA> lane, issue <URL>.
   Set your Murmur status and tags for this lane, then work through the issue's
   acceptance criteria in order. Stay in my lane's files. Run typecheck before any push.
   ```

## Data

Everything in `data/inputs/` is fictional: "Eastbay Youth Literacy", a federal subaward and a foundation grant. The grant PDFs are rendered from `data/source/*.html`. `data/expected.json` is the answer key for `npm run eval` and is never sent to Claude.
