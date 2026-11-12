# Rom-hackwclaude-26

Two-person hackathon repo for independent Claude Code sessions. The stack is
not chosen yet; there is no application, build, or test command to run.

Use a separate clone on each person's computer, one branch per task, and GitHub
Issues for live ownership. Open pull requests into `main` for teammate review.
Branches isolate commits; separate checkouts isolate concurrent file edits.

## One-time setup

1. The owner invites the teammate under repository **Settings → Collaborators**.
   The teammate accepts; each person uses their own GitHub account and credentials.
2. Ensure **Issues** are enabled in repository settings. Use the
   [task template](https://github.com/lucasraicu/Rom-hackwclaude-26/issues/new/choose)
   for assignments. Check assignees and comments before claiming a task.
3. Install Git and Claude Code on each computer and sign in individually.
   Authenticate Git for GitHub using your own HTTPS credential manager or SSH key.
   If Claude will manage issues and PRs through the CLI, also install GitHub CLI,
   run `gh auth login`, and verify `gh auth status`.
4. Recommended: protect `main` with required pull requests and one teammate
   approval, where your GitHub plan supports it. Add required CI checks only
   after real checks exist. See [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

These are GitHub/account setup steps; files in this folder do not grant access
or enforce remote branch protection.

Each person clones once:

```bash
git clone https://github.com/lucasraicu/Rom-hackwclaude-26.git
cd Rom-hackwclaude-26
```

## Each task

1. Open or select a [GitHub issue](https://github.com/lucasraicu/Rom-hackwclaude-26/issues).
   Assign yourself and record the branch, intended files, acceptance criteria,
   and dependencies. Refresh and confirm the claim; coordinate overlapping files
   and shared interfaces before coding. `TASKS.md` is an overview, not a live lock.
2. With a clean checkout, create a branch from current remote `main`. Replace
   `lucas/12-task-name` throughout these examples with your own name, real issue
   number, and task description. The teammate uses a different branch and issue.

   ```bash
   git status --short
   git fetch origin
   git switch --no-track -c lucas/12-task-name origin/main
   claude
   ```

3. Give Claude the issue URL and scope. For example:

   ```text
   Read CLAUDE.md and TASKS.md. I own issue <issue URL> on branch
   <my task branch>. Check its current assignee and comments; work only in
   the files agreed there. Implement the acceptance criteria and run relevant
   checks. Commit only this task's changes, push this branch, and open a PR
   to main linked to the issue. Report checks and remaining work. Do not merge.
   ```

   If Claude cannot access the issue, check it yourself and provide its current
   assignment and scope. Do not guess ownership from a stale local file.

4. Inspect the diff and run relevant checks. For a manual commit and push,
   replace the sample file path and message with the actual task changes:

   ```bash
   git diff
   git add path/to/changed-file
   git diff --cached
   git commit -m "Describe the completed task"
   git push -u origin lucas/12-task-name
   ```

5. Open a PR to `main` in GitHub (or use `gh pr create --base main --web`).
   Link the issue with `Closes #12` using the real issue number, describe checks,
   and request your teammate's review. After approval, a developer merges it.
   For partial work, reference the issue without a closing keyword.

If `main` advances during your task, first finish or safely save your own work,
then run these commands on your task branch:

```bash
git fetch origin
git merge origin/main
```

Resolve conflicts together where needed, rerun affected checks, and push your
branch again. Never force-push or silently discard either person's changes.

## Two sessions on one computer

Give each session a separate worktree rather than sharing one working directory.
From an existing clone, create a new branch and checkout for the second task:

```bash
git fetch origin
git worktree add --no-track -b teammate/13-task-name ../rom-teammate-13 origin/main
cd ../rom-teammate-13
claude
```

The original session stays in its original checkout and branch. Each worktree
needs its own dependencies, local environment files, and dev-server port once
the stack exists. See [Claude parallel sessions](https://code.claude.com/docs/en/common-workflows#run-parallel-sessions-with-worktrees)
and [Git worktrees](https://git-scm.com/docs/git-worktree).

## Shared context

- [CLAUDE.md](CLAUDE.md): shared assistant and collaboration rules.
- [AGENTS.md](AGENTS.md): explicit entry point for other coding assistants.
- [TASKS.md](TASKS.md): high-level scope and decisions; issues hold live status.

Use issues and PRs for handoffs: decisions, changed files, checks, and remaining
work. Independent Claude conversations are not the team's shared record.
Keep personal preferences in ignored `.claude/settings.local.json` or
`CLAUDE.local.md`. Add a placeholder-only `.env.example` when environment
variables are introduced, and document setup/build/test commands when the stack
is selected.
