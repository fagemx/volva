# Demo Path — End-to-End Proof of Closure

> Status: `working draft`
>
> Purpose: Walk through two complete scenarios to prove the integration protocol works from Völva dispatch to Karvi result.

---

## 1. One-Liner

> **If you can't run through it step by step with concrete data, it's not a spec — it's a wish.**

---

## Demo 1: Skill Dispatch — Deploy Service

### Scenario
User says "deploy checkout-service to staging" in Völva. Völva's container router selects Skill container, finds matching `skill.deploy-service`, and dispatches to Karvi.

### Pre-conditions
- `skill.deploy-service` exists in Völva's skill registry (status: promoted)
- Karvi is running on localhost:3463
- SKILL.md for deploy-service exists in Karvi's skill directory

### Steps

**Step 1: Völva builds dispatch request**
```
Container Router → Skill container → registry.findMatching("deploy checkout-service")
→ match: skill.deploy-service (priority: 80, confidence: high)
→ skill.dispatch.mode === 'karvi'
→ Build SkillDispatchRequest from skill object + user context
```

**Step 2: Völva sends to Karvi**
```bash
curl -X POST http://localhost:3463/api/volva/dispatch-skill \
  -H 'Content-Type: application/json' \
  -d '{
    "skillId": "skill.deploy-service",
    "skillName": "deploy-service",
    "skillVersion": "1.2.0",
    "skillContent": "# deploy-service\n\nDeploy a service to target environment...\n\n## Method\n1. Pull artifact\n2. Build image\n3. Deploy to env\n4. Run smoke tests\n",
    "environment": {
      "toolsRequired": ["git", "docker"],
      "toolsOptional": ["kubectl"],
      "permissions": { "filesystem": {"read":true,"write":true}, "network": {"read":true,"write":true}, "process": {"spawn":true}, "secrets": {"read":["DEPLOY_KEY"]} },
      "externalSideEffects": true,
      "executionMode": "active"
    },
    "dispatch": {
      "targetSelection": { "repoPolicy": "explicit", "runtimeOptions": ["claude", "opencode"] },
      "workerClass": ["implementation"],
      "handoff": { "inputArtifacts": [], "outputArtifacts": ["deploy_url"] },
      "executionPolicy": { "sync": false, "retries": 1, "timeoutMinutes": 20, "escalationOnFailure": true },
      "approval": { "requireHumanBeforeDispatch": false, "requireHumanBeforeMerge": true }
    },
    "verification": { "smokeChecks": ["staging-smoke-pass"], "assertions": [], "humanCheckpoints": ["prod-rollout-approval"], "outcomeSignals": [] },
    "context": { "userMessage": "Deploy checkout-service to staging", "workingDir": "/repos/checkout-service", "inputs": {"service_name":"checkout-service","artifact_ref":"v2.3.1","target_env":"staging"} }
  }'
```

**Step 3: Karvi responds (async)**
```json
{ "ok": true, "data": { "dispatchId": "disp_ck9f2a", "status": "queued", "estimatedDurationSec": 600 } }
```

**Step 4: Karvi executes internally**
```
→ Use skillContent from request (no filesystem read needed)
→ Pick runtime from targetSelection.runtimeOptions ["claude", "opencode"] → claude
→ Build dispatch plan: { message: "Deploy checkout-service...", skillContent: "...", timeoutSec: 1200 }
→ Create worktree
→ step 1: plan (agent reads SKILL.md + context)
→ step 2: implement (agent runs deploy)
→ step 3: review (agent checks smoke tests)
```

**Step 5: Völva polls status**
```bash
curl http://localhost:3463/api/volva/status/disp_ck9f2a
```
```json
{ "ok": true, "data": { "id": "disp_ck9f2a", "status": "running", "currentStep": "implement", "progress": {"stepsCompleted":1,"stepsTotal":3} } }
```

**Step 6: Karvi returns result**
```json
{
  "ok": true,
  "data": {
    "skillId": "skill.deploy-service",
    "status": "success",
    "durationMs": 342000,
    "steps": [
      {"stepId":"plan","type":"plan","status":"success","artifacts":[]},
      {"stepId":"implement","type":"implement","status":"success","artifacts":["https://github.com/org/checkout-service/pull/89"]},
      {"stepId":"review","type":"review","status":"success","artifacts":[]}
    ],
    "outputs": { "deploy_url": "https://staging.checkout.example.com", "deploy_status": "success" },
    "verification": { "smokeChecksPassed": true, "failedChecks": [] },
    "telemetry": { "tokensUsed": 45200, "costUsd": 0.18, "runtime": "claude", "model": "claude-sonnet-4-5-20250514", "stepsExecuted": 3 }
  }
}
```

**Step 7: Völva records telemetry**
```
recordRun(db, { skillInstanceId: "si_deploy", outcome: "success", durationMs: 342000 })
→ run_count: 6, success_count: 6, last_used_at: now
```

### Verification
- SkillDispatchResult.status === 'success'
- smokeChecksPassed === true
- Telemetry recorded in Völva's skill_instances table
- PR created in target repo

---

## Demo 2: Forge Build — Economic Service

### Scenario
Decision pipeline committed to "workflow install service for video studios." CommitMemo produced. Völva sends forge build request to Karvi.

### Pre-conditions
- Decision session `ds_abc123` reached `commit-review` stage
- EconomicCommitMemo produced with verdict: commit
- Karvi has `forge-economic` pipeline template

### Steps

**Step 1: Völva translates CommitMemo**
```
translateToSettlement(commitMemo) → ForgeBuildRequest
```

**Step 2: Völva sends to Karvi**
```bash
curl -X POST http://localhost:3463/api/volva/forge-build \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId": "ds_abc123",
    "candidateId": "cand_xyz789",
    "regime": "economic",
    "verdict": "commit",
    "whatToBuild": ["Landing page", "Intake form", "Install checklist"],
    "whatNotToBuild": ["Full SaaS platform", "Payment processing"],
    "rationale": ["3/10 studios responded, 1 willing to pay"],
    "evidenceUsed": ["buyer_interest_signal: 3/10 replied", "payment_intent: 1 studio"],
    "unresolvedRisks": ["pricing not validated", "delivery timeline unknown"],
    "regimeContext": { "kind": "economic", "buyerHypothesis": "Video studios need workflow help", "painHypothesis": "4+ hours wasted on manual setup", "vehicleType": "productized_service", "paymentEvidence": ["1 studio willing to pay $500/install"], "whyThisVehicleNow": ["low setup cost", "repeatable"], "nextSignalAfterBuild": ["first paid install within 2 weeks"] },
    "context": { "targetRepo": "org/workflow-install-service" }
  }'
```

**Step 3: Karvi selects pipeline**
```
regime === 'economic' → template: 'forge-economic'
→ step 1: plan (read CommitMemo, plan deliverables)
→ step 2: implement (build landing page + intake form + checklist)
→ step 3: review (check against whatNotToBuild)
```

**Step 4: Result**
```json
{
  "ok": true,
  "data": {
    "sessionId": "ds_abc123",
    "status": "success",
    "durationMs": 580000,
    "artifacts": [
      {"type":"file","path":"pages/index.html","description":"Landing page with service description"},
      {"type":"file","path":"forms/intake.json","description":"Client intake form schema"},
      {"type":"file","path":"docs/install-checklist.md","description":"First delivery checklist"},
      {"type":"pr","path":"https://github.com/org/workflow-install-service/pull/1","description":"Initial service setup PR"}
    ],
    "steps": [
      {"stepId":"plan","type":"plan","status":"success","artifacts":[]},
      {"stepId":"implement","type":"implement","status":"success","artifacts":["pages/index.html","forms/intake.json","docs/install-checklist.md"]},
      {"stepId":"review","type":"review","status":"success","artifacts":[]}
    ],
    "telemetry": { "tokensUsed": 62000, "costUsd": 0.25, "runtime": "claude", "model": "claude-sonnet-4-5-20250514", "stepsExecuted": 3 }
  }
}
```

### Verification
- ForgeBuildResult.status === 'success'
- 3 artifacts match whatToBuild items
- No artifact matches whatNotToBuild items
- PR created in target repo

---

## Kill Criteria

| If this fails | The protocol is broken |
|--------------|----------------------|
| Karvi can't parse SkillDispatchRequest | Schema contract mismatch |
| Karvi ignores skillContent and tries filesystem | Content transfer broken |
| Karvi picks runtime not in runtimeOptions | Target selection broken |
| Forge builds something in whatNotToBuild | Constraint injection failed |
| Telemetry missing runtime/model/stepsExecuted | Völva can't track lifecycle |
| SSE events never fire | Progress monitoring broken |
| Approval gate returns APPROVAL_REQUIRED but no pendingApprovalId | Re-submission flow broken |

---

## Closing Line

> **Two demos. Concrete JSON in, concrete JSON out. If these don't work end-to-end, nothing else matters.**
