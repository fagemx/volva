# Dependency Resolution Algorithm

## Input

A list of issue numbers to process.

## Step 1: Gather Blocker Data

For each issue, extract the `Blocked by: #NNN` line from the issue body:

```bash
gh issue view {number} --json body --jq '.body' | grep -i "blocked by"
```

Common formats to handle:
- `- Blocked by: #295`
- `- Blocked by: #297, #299, #302` (multiple)
- `- Blocked by: #$C2` (template bug — infer from context)
- No blocker line = no dependencies

## Step 2: Check Blocker Status

For each blocker found:

```bash
gh issue view {blocker_number} --json state --jq '.state'
```

- **CLOSED** → dependency satisfied, ignore
- **OPEN + in batch** → real dependency, must schedule after
- **OPEN + not in batch** → external blocker, warn user

## Step 3: Build Adjacency List

```
deps = {
  295: [],           // no open blockers
  296: [295],        // blocked by 295
  297: [296],        // blocked by 296
  303: [302],        // fork point
  305: [302],        // fork point (same parent)
  307: [297, 299, 302, 304, 306],  // convergence point
}
```

## Step 4: Topological Sort into Waves

Algorithm (BFS-based level assignment):

```
wave = 0
ready = issues with no dependencies (in-degree 0)

while ready is not empty:
  waves[wave] = ready
  wave++
  for each issue in ready:
    remove issue from dependency graph
    check which issues now have in-degree 0
  ready = newly unblocked issues
```

Issues in the same wave can run in parallel. Issues in wave N+1 depend on at least one issue in wave N or earlier.

## Step 5: Validate

- **Cycle detection**: If after all waves some issues remain, there's a circular dependency. Report to user.
- **Orphan detection**: Issues not reachable from any root. Add to wave 0.

## Example Output

```
Wave 1:  #283  #294  #299  #287     (4 parallel, no blockers)
Wave 2:  #295  #288                  (2 parallel, ← Wave 1)
Wave 3:  #296  #289                  (2 parallel, ← Wave 2)
Wave 4:  #297  #290                  (2 parallel, ← Wave 3)
Wave 5:  #300                        (1, ← #297)
Wave 6:  #301                        (1, ← #300)
Wave 7:  #302                        (1, ← #301)
Wave 8:  #303  #305                  (2 parallel, fork from #302)
Wave 9:  #304  #306                  (2 parallel, ← Wave 8)
Wave 10: #307                        (1, convergence: #297+#299+#302+#304+#306)
Wave 11: #308                        (1, ← #307)
Wave 12: #309                        (1, ← #308)
```

## Optimization: Chain Collapsing

If a wave has exactly 1 issue and the next wave also has exactly 1 issue, consider combining plan+implement into a single agent call (saves one round-trip). This is the `--auto` behavior.

## Visualization

Output an ASCII DAG for user confirmation:

```
#294 ──→ #295 ──→ #296 ──→ #297 ──→ #300 ──→ #301 ──→ #302 ─┬→ #303 ──→ #304 ─┐
                                                               └→ #305 ──→ #306 ─┤
#299 ────────────────────────────────────────────────────────────────────────────┤
                                                                    #307 ←──────┘
                                                                      ↓
                                                                    #308
                                                                      ↓
                                                                    #309
```
