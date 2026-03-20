# Agent Prompt Templates

All prompts use these variables:
- `{project_root}` — absolute path to project root (e.g., `C:\ai_agent\thyra`)
- `{number}` — GitHub issue number
- `{pr_number}` — GitHub PR number

## PLAN_ONLY_PROMPT

Used in Phase A when `--auto` is NOT set, or for Wave 1 when you want to validate plans before implementing.

```
You are working on GitHub issue #{number} for this project at {project_root}.
Load and execute the issue-plan skill by reading {project_root}/.claude/skills/issue-plan/SKILL.md
and following its instructions for issue #{number}.
IMPORTANT: You are in a worktree. Do NOT modify source code — planning only.
```

## IMPLEMENT_ONLY_PROMPT

Used in Phase A when plan already exists (e.g., from a prior run or manual planning).

```
You are working on GitHub issue #{number} for this project at {project_root}.
Load and execute the issue-action skill by reading {project_root}/.claude/skills/issue-action/SKILL.md
and following its instructions for issue #{number}.
The plan has been posted as a comment on the issue — read it with `gh issue view {number} --comments`.
IMPORTANT: You are in a worktree. Pull latest main first: `git pull origin main`.
```

## COMBINED_PROMPT (default for --auto)

Combines plan + implement into a single agent. Faster — saves one agent round-trip per issue. Use this from Wave 2 onwards, or when you're confident the issues are well-specified.

```
You are working on GitHub issue #{number} for this project at {project_root}.

Phase 1 - Plan: Load and execute the issue-plan skill by reading {project_root}/.claude/skills/issue-plan/SKILL.md and following its instructions for issue #{number}. If there is already a plan comment on the issue, skip to Phase 2.

Phase 2 - Implement: Load and execute the issue-action skill by reading {project_root}/.claude/skills/issue-action/SKILL.md and following its instructions for issue #{number}. Read the plan from the issue comments with `gh issue view {number} --comments`.

IMPORTANT: You are in a worktree. Pull latest main first: `git pull origin main`.
```

## REVIEW_PROMPT

```
You are reviewing PR #{pr_number} for this project at {project_root}.
Load and execute the pr-review-loop skill by reading {project_root}/.claude/skills/pr-review-loop/SKILL.md
and following its instructions for PR #{pr_number}.
IMPORTANT: You are in a worktree. If fixes are needed, make them on the PR's branch, commit, and push.
```

## Agent Launch Parameters

All agents share these parameters:

```yaml
isolation: "worktree"        # Never work on main directly
run_in_background: true      # Notification-driven, not blocking
```

## When to Use Which Prompt

| Situation | Prompt |
|-----------|--------|
| First time seeing issue, want human review of plan | PLAN_ONLY |
| Issue already has plan comment | IMPLEMENT_ONLY |
| Well-specified issue, want speed | COMBINED |
| Wave 1 with many issues | PLAN_ONLY (validate first) |
| Wave 2+ after pattern is established | COMBINED |
| Issue has existing open PR | Skip to REVIEW |
| Issue is already closed/merged | Skip entirely |

## Handling Already-Done Issues

When an agent returns saying the issue already has a PR or is already implemented:

1. Note the existing PR number from the agent's result
2. If PR is open → add to review queue
3. If PR is merged → mark as ✅, skip
4. If issue is closed → mark as ✅, skip
