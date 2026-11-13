# Demo script (under 2 minutes)

Judges score: impact, use of Claude, technical execution, demo and storytelling, creativity, and up to +2 for track fit (Day Zero). Small and working beats big and broken.

## 0:00 The problem (20 s)

"Our friend runs a small nonprofit with two grants: one federal, one from a foundation. Every month she spends [N hours, from the contact] in a spreadsheet deciding which grant pays for what. If she charges the wrong grant, a federal auditor can make them pay it back."

Show `data/inputs/transactions.csv` and a grant PDF for two seconds: this is what she starts with.

## 0:20 Run it (30 s)

Click **Analyze October**. While it runs: "Claude reads both grant agreements, pulls out every rule with the exact sentence and page, then checks each of 13 transactions and payroll lines against them."

Point at the summary: 9 supported, 2 not allowable, 2 need evidence.

## 0:50 Show judgment (30 s)

- Open **Luna Bistro, dinner with wine**: not allowable, cites the alcohol clause and 2 CFR 200.423. The quote has a **verified** badge: "Every quote is checked against the PDF text in code, so it can't make up a rule."
- Open **Maria Lopez**: "The budget says 30% of her salary comes from the foundation. Her timesheet shows zero tutoring hours. A spreadsheet would just apply the budget. FundProof won't. Federal rules say budget estimates aren't evidence."

## 1:20 The fix loop (25 s)

"She forgot to log her tutoring hours." Upload `timesheets-corrected.csv`. Maria's row turns supported: 60% federal, 20% foundation, 20% unrestricted, computed from hours.

## 1:45 Close (15 s)

"Claude recommends and a person approves. Any small nonprofit with restricted grants has this problem, and today they have a spreadsheet. Built today, on Claude." Name the limits honestly: one org, one month, synthetic data.

## If something breaks

Set `FUNDPROOF_MOCK=1` in `.env.local`, restart `npm run dev`, and run the same script. The fixtures match the live answers.
