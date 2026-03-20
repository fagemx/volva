# Interrupt Recovery Procedure

When a conversation is interrupted mid-pipeline, follow this procedure to resume.

## Step 1: Assess Current State

Run these commands to rebuild the picture:

```bash
# What PRs exist?
gh pr list --state open --limit 20
gh pr list --state merged --limit 20

# What issues are still open?
gh issue list --state open --limit 50

# What's on main now?
git log --oneline -10
```

## Step 2: Classify Each Issue

For each issue in the original batch:

| Check | Meaning |
|-------|---------|
| Issue is CLOSED | ✅ Done — skip |
| Issue has merged PR | ✅ Done — skip |
| Issue has open PR | Partially done — skip to review |
| Issue has plan comment but no PR | Plan done — skip to implement |
| Issue has no activity | Not started — full pipeline |

## Step 3: Rebuild Wave Schedule

Take the remaining issues and re-run the dependency resolution algorithm (see [dependency-resolution.md](dependency-resolution.md)). Issues that were in earlier waves are now done, so their dependents should be unblocked.

## Step 4: Resume

Start from the earliest incomplete wave. Issues that were mid-flight when the interruption happened may have:

- **Stale worktrees** — the system handles cleanup automatically
- **Broken git refs** — empty ref files from interrupted agents. Fix with:
  ```bash
  rm -f .git/refs/heads/{broken-branch-name}
  ```
- **Orphan branches** — pushed to remote but no PR. Check with:
  ```bash
  git branch -r --no-merged main | grep "issue-{number}"
  ```

## Step 5: Verify Before Continuing

Before launching new agents, verify the build is clean on main:

```bash
git pull origin main
bun run build
bun test
```

If there are failures, fix them before resuming the pipeline — otherwise all agents will encounter the same errors.

## Common Recovery Scenarios

### Scenario: Agent created PR but review didn't happen

```bash
gh pr list --state open  # Find the PR
# → Launch review agent for that PR
```

### Scenario: Agent was mid-implementation when interrupted

The worktree is gone, but the agent may have pushed a branch:

```bash
git branch -r | grep "{issue-number}"
# If branch exists with commits, create PR manually:
gh pr create --head {branch} --title "..." --body "..."
# Then review
```

### Scenario: PR was merged but next wave wasn't started

Just re-run dependency resolution on remaining open issues. The merged issues' dependents are now unblocked.

### Scenario: Multiple waves completed, lost track of progress

```bash
# Compare original issue list with current state
for i in 283 287 288 289 290 294 295 296 297 299 300 301 302 303 304 305 306 307 308 309; do
  state=$(gh issue view $i --json state --jq '.state')
  echo "#$i: $state"
done
```

All CLOSED issues are done. Resume from the first OPEN issue's wave.
