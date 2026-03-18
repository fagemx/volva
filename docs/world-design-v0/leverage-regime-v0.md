# leverage-regime-v0.md

> Status: `stub — needs full spec`
>
> Purpose: Define the leverage regime — when the user's terminal intent is about saving time, increasing throughput, or reducing cognitive load.
>
> Reference: See `probe-commit-evaluators.md` Section 9 for the evaluator summary.
> See `intent-router-and-space-builder.md` Section 10.3 for space-builder outputs.

---

## 1. Terminal Intent

> **The user wants to make a repeated process faster, cheaper, or less error-prone.**

Core variables: throughput, time saved, repeatability, error reduction, cognitive load

---

## 2. Space Builder Output

Space builder for leverage regime produces **bottleneck targets**, not business opportunities:
- Prompt-to-storyboard bottleneck
- FFmpeg postprocess chain
- Dispatch/review loop
- Repetitive project bootstrap
- Cross-tool copy/paste reduction path

---

## 3. Probe Form

Typical probe: "Does automating this step actually save meaningful time vs the setup cost?"

Cheapest believable probe: time a manual run vs a semi-automated run of the same task.

---

## 4. Commit Threshold

- Measured time savings exceed automation setup cost
- The bottleneck recurs frequently enough to justify investment
- Error rate improves measurably

---

## 5. Forge Entry

CommitMemo for leverage regime should specify:
- Which bottleneck to automate
- Expected time savings per occurrence
- Build complexity estimate
- What NOT to build (e.g., don't automate low-frequency steps)

---

## 6. Gaps (to be filled)

- [ ] Full bottleneck identification patterns
- [ ] Kill filter specifics (when automation isn't worth it)
- [ ] ROI calculation framework
- [ ] Signal interpretation logic
- [ ] LeverageCommitMemo type extension
