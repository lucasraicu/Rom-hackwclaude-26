# Project overview

**FundProof**: an AI allocation reviewer for small nonprofits with restricted grants.
Full plan: [docs/PLAN.md](docs/PLAN.md). Demo script: [docs/DEMO.md](docs/DEMO.md).
Live task ownership: [GitHub Issues](https://github.com/lucasraicu/Rom-hackwclaude-26/issues).

## Team

Three people, three laptops, one agent each, coordinating through Murmur.
Each person claims one lane issue by assigning themselves on GitHub.

- Repo owner: Lucas (`lucasraicu`).
- UI lane: claim the "UI lane" issue.
- AI lane: claim the "AI lane" issue.
- DATA lane: claim the "DATA lane" issue.

## Decisions (agreed)

- Track: 05 Day Zero. Theme fit: Claude does the work, not a chat box.
- Stack: Next.js 15 + TypeScript + Tailwind; `@anthropic-ai/sdk` with model `claude-opus-5-5`; zod structured outputs.
- No database. Inputs in `data/inputs/`; results are JSON.
- Synthetic, fictional data only. No real salaries or donor records go to an API or into this public repo.
- Claude recommends; a person approves. Claude never computes dollar amounts.
- Shared contract: `lib/types.ts`. Mock fixtures in `lib/fixtures/` match it.

## Milestones

| Time | Milestone |
|---|---|
| 1:30 PM | Everyone set up and joined on Murmur |
| 2:30 PM | Live pipeline end to end on `main` |
| 3:30 PM | Feature complete; eval 13/13 both scenarios |
| 4:15 PM | Code freeze |
| 4:30 PM | Live demos |
