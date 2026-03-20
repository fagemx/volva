---
name: issue-pipeline
description: "Wave-based issue pipeline with dependency resolution. Scans blockers, builds DAG, dispatches parallel sub-agents in waves. Usage: /issue-pipeline <issues...> [--skip-plan] [--skip-review] [--no-merge] [--auto]"
---

# Issue Pipeline Skill

You are a **wave-based dispatch orchestrator**. You resolve issue dependencies, group into waves, and drive each wave through plan → implement → review → merge using parallel sub-agents.

## Usage

```
/issue-pipeline <issue-numbers...> [flags]
/issue-pipeline all                          # all open issues
```

**Flags:**
- `--skip-plan` — Skip plan phase (issues already have plans)
- `--skip-review` — Skip review phase, merge after implement
- `--no-merge` — Stop after review, don't auto-merge
- `--auto` — Combine plan+implement into single agent (faster, default for waves 2+)

## Prerequisites

Sub-skills required in `.claude/skills/`:
- `issue-plan` — Deep-dive planning
- `issue-action` — Implementation from plan to PR
- `pr-review-loop` — Iterative review with auto-fix

## Orchestration Loop

```
1. Pre-flight scan
2. Build dependency DAG → wave schedule
3. Present plan to user, wait for confirmation
4. For each wave:
   a. Dispatch agents (plan → implement → review → merge)
   b. Report wave status table
   c. Unlock next wave
5. Final summary
```

### Step 1: Pre-flight Scan

For every issue in scope:

```bash
# Get all open issues (or specific ones)
gh issue list --state open --limit 100 --json number,title,body,labels,state

# For each issue, extract blocker line
gh issue view {number} --json body --jq '.body' | grep -i "blocked by"

# Check if blocker issues are closed (= unblocked)
gh issue view {blocker} --json state --jq '.state'

# Check for existing PRs
gh pr list --state all --search "{number}" --limit 5
```

Classify each issue:
- **already-done** — has merged PR or issue is closed → skip
- **has-open-pr** — PR exists, not merged → skip to review
- **unblocked** — all blockers closed or no blockers → ready
- **blocked** — has open blockers within the batch → schedule in later wave
- **externally-blocked** — blocker is outside batch and still open → warn user

### Step 2: Build Wave Schedule

See [references/dependency-resolution.md](references/dependency-resolution.md) for the algorithm.

Output a wave table + ASCII DAG for user confirmation:

```
| Wave | Issues | Parallelism | Notes |
|------|--------|-------------|-------|
| 1    | #283, #294, #299, #287 | 4 | No blockers |
| 2    | #295, #288 | 2 | ← Wave 1 |
| ...  | ...    | ...         | ...   |
```

### Step 3: Wave Execution

Each wave runs through up to 4 phases. See [references/agent-prompts.md](references/agent-prompts.md) for prompt templates.

#### Phase A: Plan + Implement (parallel)

For `--auto` mode (default), combine plan and implement into a single agent per issue:

```
Agent per issue:
  isolation: "worktree"
  run_in_background: true
  prompt: → COMBINED_PROMPT from references/agent-prompts.md
```

Launch ALL agents for the wave in a **single message** (parallel tool calls).

Wait for all `task-notification` events. For each result:
- **Already done** (existing PR found) → note PR number, skip to review
- **PR created** → note PR URL, proceed to review
- **Failed** → mark ❌, continue with rest

#### Phase B: Review (parallel)

For each PR from Phase A, launch review agent:

```
Agent per PR:
  isolation: "worktree"
  run_in_background: true
  prompt: → REVIEW_PROMPT from references/agent-prompts.md
```

#### Phase C: Merge (sequential)

For each PR with LGTM verdict:

```bash
gh pr merge {pr_number} --squash
```

If `--squash` fails with branch deletion error, retry without `--delete-branch`.

#### Phase D: Status Report

After each wave, output:

```
## Wave N Complete ✅

| Issue | PR | Tests | Result |
|-------|-----|-------|--------|
| #295  | #320 | 28 | ✅ merged |
| #288  | #321 | 19 | ✅ merged |
```

Then immediately start next wave.

### Step 4: Final Summary

```
## Pipeline Complete

- Issues: 20 processed, 17 merged, 3 already done
- PRs: 17 created, 17 merged
- Waves: 12
- Tests added: ~250
```

## Execution Rules

1. **All sub-agents use `isolation: "worktree"`** — never work on main directly
2. **All sub-agents use `run_in_background: true`** — maximize parallelism
3. **Launch ALL agents for a phase in a SINGLE message** — parallel tool calls
4. **Notification-driven** — wait for `task-notification`, never poll or sleep
5. **Status table after every wave** — issue, PR, status, key details
6. **Fail-forward** — if one agent fails, continue with the rest
7. **Merge gates** — only merge LGTM PRs; skip conflicted ones with user warning
8. **`git pull origin main`** — every implement agent pulls latest before starting

## Interrupt Recovery

See [references/recovery.md](references/recovery.md) for the full procedure.

Quick version: run `gh pr list --state open` + `gh issue list --state open` to rebuild state, then resume from the earliest incomplete wave.

## Error Handling

| Scenario | Action |
|----------|--------|
| Agent fails | Mark ❌, continue, report at end |
| Issue already has PR | Skip to review phase |
| Issue already closed | Skip entirely |
| PR creation fails | Report branch name, suggest manual fix |
| Review finds issues | Review loop auto-fixes + re-reviews |
| Merge conflict | Skip merge, warn user, suggest resolution |
| Broken git ref | `rm -f` the ref file, retry |
| Conversation interrupted | Use recovery procedure |
