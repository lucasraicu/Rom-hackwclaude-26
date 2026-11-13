# Hackathon

The stack is not chosen. Do not scaffold a full app unless asked.

## Implementation principles

- Read the relevant files and existing code before proposing or changing behavior.
  Do not invent requirements, APIs, dependencies, or facts about the repository.
- Ask when missing information would materially change scope, shared interfaces,
  architecture, or data handling. For minor, reversible choices, follow existing
  conventions and state any meaningful assumptions; avoid unnecessary questions.
- Make the smallest complete change that meets the task's acceptance criteria.
  Reuse existing code and dependencies. Add abstractions, packages, configuration,
  or files only when the current task needs them.
- Avoid speculative features, generic frameworks, unrelated cleanup, and code
  for hypothetical future requirements. Keep code readable and straightforward.
- Match planning and verification to the task. Handle clear, small tasks directly;
  use a short plan for complex work. Avoid elaborate orchestration or repeated
  analysis once the requirements and approach are clear.
- Verify changed behavior with relevant checks. Never claim a check passed unless
  it ran successfully. Once the task and checks are complete, stop expanding scope
  and give a concise summary of changes, results, and remaining limitations.

## Before editing

- Read `TASKS.md` for the project overview and the current GitHub issue for
  the assignment. GitHub Issues are the live source of task ownership.
- Check the issue's assignee and recent comments, and inspect `git status`,
  the current branch, and existing diffs. Preserve unrelated local changes.
- Claim an unassigned issue with your own GitHub account before coding.
  Record your intended files, acceptance criteria, and dependencies
  in the issue. Recheck ownership before editing; coordinate any overlap.
- If GitHub is unavailable, have both developers explicitly agree on ownership
  in a shared conversation before coding. A local `TASKS.md` edit is not a claim.

## Parallel development

- Multiple people may use independent Claude Code sessions simultaneously.
  Do not assume the other session knows your conversation or unpushed changes.
- Work in the same repository on the shared `main` branch, with a separate
  GitHub issue and owner for each task. Sessions on one computer may share the
  checkout. Never switch branches underneath another session.
- Assign separate files to concurrent tasks. If tasks need the same file, agree
  on an editing order before changing it; never edit the same lines concurrently.
- Coordinate all staging, commits, pulls, and pushes: only one session performs
  Git write operations at a time. The index is shared across the checkout.
- Do not edit files owned by the other developer without coordinating first.
  Agree on shared interfaces before implementing dependent components.
- Coordinate edits to shared configuration, dependency manifests and lockfiles,
  schemas, and these instructions; let one task own each overlapping change.
- Keep changes within the assigned scope. Preserve the existing architecture
  unless a necessary change is agreed upon. Avoid unrelated refactors.
- Never overwrite, revert, or discard another developer's changes.

## Integration

- Keep commits focused and descriptive. Stage only intended files.
- Before syncing, coordinate with the teammate and check the entire checkout.
  Pull with `git pull --ff-only origin main` only when the working tree and index
  are clean. If histories diverge, coordinate a merge; do not rewrite history.
- Resolve conflicts by preserving both developers' intended behavior. Coordinate
  uncertain resolutions with the affected developer and rerun relevant checks.
- Run checks appropriate to the change; report actual results and any blockers.
  No application build or tests exist yet. Add real commands here once chosen.
- Have the teammate review the task diff and checks before a requested push
  to shared `main`. Record the resulting commit in the task issue.
- Keep `main` working and demo-ready. Record handoff context in the issue:
  what changed, checks run, dependencies, and what remains.

## Git

- Commit or push shared `main` only when the developer requests it. Merge or
  deploy only on explicit request. Task branches and PRs are optional if requested.
- Stage only the task's agreed files or hunks, inspect `git diff --cached`, and
  confirm it contains no other task's changes before committing. Never use
  `git add .` or `git commit -a` in the shared checkout.
- Never stash, restore, or clean another session's work to make syncing possible.
- Never force-push or hard-reset.
- Never commit secrets or local `.env` files. When configuration is introduced,
  use a tracked `.env.example` containing placeholders only.

Shared Claude permissions live in `.claude/settings.json`. Personal preferences
go in gitignored `.claude/settings.local.json` or `CLAUDE.local.md`.
