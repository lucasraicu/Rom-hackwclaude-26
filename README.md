# Rom-hackwclaude-26

Two-person hackathon repo for independent coding assistant sessions. The stack
is not chosen yet; there is no application, build, or test command to run.

Everyone works in the same repository on shared `main`, with separate GitHub
Issues and file ownership for each task. Sessions on one computer may use the
same checkout. Coordinate shared files and Git operations directly.

## One-time setup

1. The owner invites the teammate under repository **Settings → Collaborators**.
   The teammate accepts and uses their own GitHub account and credentials.
2. Ensure **Issues** are enabled. Use the
   [task template](https://github.com/lucasraicu/Rom-hackwclaude-26/issues/new/choose)
   for assignments. Check assignees and comments before claiming a task.
3. Install Git and your coding assistant. Authenticate Git for GitHub using
   your own HTTPS credential manager or SSH key.
4. Ensure repository rules allow the agreed direct pushes to `main`. Repository
   files do not change GitHub permissions or branch protection settings.

On one computer, open the existing checkout in each session. On separate
computers, each person clones the same repository and works on `main`:

```bash
git clone https://github.com/lucasraicu/Rom-hackwclaude-26.git
cd Rom-hackwclaude-26
```

## Each task

1. Open or select a [GitHub issue](https://github.com/lucasraicu/Rom-hackwclaude-26/issues).
   Assign yourself and record intended files, acceptance criteria, and dependencies.
   Refresh and confirm the claim. Use separate files for concurrent tasks; agree
   on an editing order when tasks need the same file. Never edit the same lines
   concurrently. `TASKS.md` holds the overview; issues hold live ownership.
2. Check `git status` and existing diffs before editing. Preserve all other tasks'
   changes. Stay on shared `main`; do not switch branches in an active checkout.
3. Give your assistant the issue URL and scope. For example:

   ```text
   Read CLAUDE.md and TASKS.md. I own issue <issue URL> on shared main.
   Check its assignee and comments. Work only in the agreed files, preserve
   other tasks' changes, implement the acceptance criteria, and run relevant
   checks. Report the diff and results. Coordinate Git operations with the
   other session. Commit or push only when I request it.
   ```

   If the assistant cannot access the issue, check it yourself and provide its
   current assignment and scope.
4. Review the diff and relevant checks with your teammate. When a developer
   requests a commit, coordinate an exclusive turn for Git operations. Inspect
   the existing index first; if it contains someone else's staged changes, have
   them finish before proceeding. Stage only this task's agreed files or hunks:

   ```bash
   git status --short
   git diff
   git diff --cached
   git add path/to/this-task-file
   git diff --cached
   git commit -m "Describe the completed task"
   ```

   Replace the sample path and message. Confirm the staged diff contains only
   this task. Never use `git add .` or `git commit -a` in the shared checkout.
5. When a developer requests a push, coordinate with all sessions and ensure
   the entire working tree and index are clean before syncing:

   ```bash
   git pull --ff-only origin main
   git push origin main
   ```

   If histories diverge, coordinate a merge and resolve conflicts together,
   preserving both tasks' intended behavior. Rerun affected checks before pushing.
   Never force-push, hard-reset, or stash or discard another session's changes.
6. Record the commit link, checks, dependencies, and remaining work in the issue.
   Close it when the acceptance criteria are met and the changes are pushed.

Only one session may stage, commit, pull, push, or otherwise change Git state
at a time. A shared checkout also shares its index and working tree; editing
separate files does not isolate Git operations. Keep `main` working and demo-ready.

## Shared context

- [CLAUDE.md](CLAUDE.md): shared assistant and collaboration rules.
- [AGENTS.md](AGENTS.md): explicit entry point for other coding assistants.
- [TASKS.md](TASKS.md): high-level scope and decisions; issues hold live status.

Use issues for handoffs: decisions, changed files, checks, and remaining work.
Independent assistant conversations are not the team's shared record.
Keep personal preferences in ignored `.claude/settings.local.json` or
`CLAUDE.local.md`. Add a placeholder-only `.env.example` when environment
variables are introduced, and document setup/build/test commands when the stack
is selected.
