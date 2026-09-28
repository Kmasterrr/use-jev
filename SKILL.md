---
name: use-jev
description: Use Jev (typesafe/jev-1.13 via OpenRouter) when text needs a bounded semantic decision: route, detect, classify, score, rank, or verify. Trigger on "ask Jev", triage, categorize, prioritize, lead scoring, relevance ranking, guardrail checks, or yes/no judgments over text. Jev decides; Claude writes and controls the workflow.
---

# Use Jev

Jev is TypeSafe's System One decision model. Give it text `state` and typed
`questions`; it returns choices, scores, or yes/no probabilities rather than
prose. Use it for a narrow semantic judgment, then let Claude or code explain,
route, or act on the result. Read actual latency and cost from each call's
output; they vary with the request and the service.

## Rules

1. **Privacy first.** Anything sent to Jev leaves the computer (OpenRouter, then
   TypeSafe). Before sending text that could be private (personal email,
   customer data, credentials, health or financial information, or anything not
   obviously public or made-up), ask the user for a yes. Never send secrets.
   This applies to inboxes, agent traces, tables, and evaluation data too.
2. **Jev is a signal, not an authority.** It can recommend a route or flag a
   risk. It does not grant tool permissions, override system policy, or
   authorize a consequential action. For permission checks, enforce the actual
   platform permissions independently. For high-stakes decisions, use human
   review or another required control.
3. **Handle uncertainty for the stakes.** `choice` and `score` include
   `confidence` (0-1); `noul` returns the probability of yes. A common default
   for low-stakes sorting is to review choice/score confidence below 0.6 and
   treat noul values between 0.35 and 0.65 as uncertain. These are starting
   points, not universal safety thresholds. For a new or consequential workflow,
   test labeled examples, choose thresholds for the cost of errors, and route
   ambiguous results to review. Do not treat confidence as proof that an
   individual answer is correct. When Claude resolves a low-confidence result,
   say "Claude decided."
4. **Keep the question bounded.** Define concrete options or ordered rubric
   levels. Give Jev only the state relevant to that decision. Keep arithmetic,
   counting, date comparisons, policy enforcement, and execution in code. Do not
   ask Jev to write prose.
5. **Never show or print the API key.** It is read from `OPENROUTER_API_KEY`, or
   from `~/.claude/secrets/openrouter.key` (0600), or from
   `~/.claude/secrets/openrouter.dpapi` (Windows DPAPI). To set a new key, the
   user runs `scripts/set-key.ps1` (Windows) or `scripts/set-key.sh`
   (macOS/Linux) in their own terminal, with hidden input. Never ask them to
   paste it into chat.
6. If a call fails, show the exact error from the script output. Do not imply
   Jev made a decision when the call failed.

## Choose a pattern

| Pattern | Useful for | Question shape | After Jev answers |
| --- | --- | --- | --- |
| Route | Model or handler routing, inbox triage, tool-call categories | `choice` for the destination; optional `score` for complexity | Claude or the application chooses a supported handler. A Claude skill cannot switch its own underlying model unless the host supports routing. Tool permission categories do not replace actual permission checks. |
| Detect and gate | Prompt or output guardrails, sensitive-data flags, escalation | `noul` for a specific condition; optional `score` for severity | Compare with a workflow-specific threshold; allow, review, or block through the host's controls. Test adversarial cases before deployment. |
| Score and rank | Passage reranking, LLM-output evaluation, lead scoring, bulk labeling | `score` with descriptive ordered levels, or `choice` with a fixed label set | Rank, aggregate, and count in code. Preserve uncertainty and review ambiguous or high-impact items. |
| Repeated decisions | Fast decisions inside a loop | The smallest question that captures the needed judgment | Run only after evaluating the decision on representative data and defining a fallback for errors and uncertain answers. Do not make trading or other consequential actions autonomous on Jev's answer alone. |

Confidence gating is a rule applied to any of these patterns, not a separate
question type. Batch several independent questions about the **same** state in
one call when useful. For a large set of independent items, evaluate each item
(or a small group) and aggregate the results outside Jev.

## How to call

Write a request file in the scratchpad or a temp directory, not the repo, then
run the script from wherever this skill is installed:

```
node <skill-dir>/scripts/jev.mjs request.json
```

Installed as a personal skill, that is:

```
node ~/.claude/skills/use-jev/scripts/jev.mjs request.json
```

`request.json`:

```json
{
  "state": "The customer says the invoice was paid twice.",
  "questions": {
    "queue": {
      "type": "choice",
      "instructions": "Which team should handle this message?",
      "criteria": {
        "billing": "The message concerns charges, invoices, or payment.",
        "technical": "The message concerns a product fault or error."
      }
    },
    "duplicate_charge": {
      "type": "noul",
      "instructions": "Does the message report being charged more than once for the same payment?"
    }
  }
}
```

Output: `{ ok, ms, route, model, cost, usage, answers }` on success;
`{ ok:false, error, status, body }` on failure. Exit code 1 on failure. Timeout
15s (`JEV_TIMEOUT_MS` to change).

## The three question shapes

- **choice** — pick one. `criteria` is an object
  `{ option: "description of when to pick it" }` (max 255 options). Returns
  `choice`, `probabilities`, `confidence`.
- **score** — rate on ordered levels. `criteria` is an array of 2-10
  descriptions, lowest to highest. Returns a probability-weighted `score` over
  0-based levels, plus `probabilities`, `legend`, `confidence`. It is a rubric
  position, not an exact numerical measurement.
- **noul** — yes/no. `criteria` is `{ "true": "...", "false": "..." }` (both
  optional). Returns `noul`, the probability of yes (0-1), without a separate
  confidence field.

Write criteria as concrete descriptions, including boundary cases. Avoid
compound questions and double negatives. For reranking, put the query and one
candidate passage in state, ask for relevance on an ordered rubric, then sort
the resulting scores in code. For an LLM eval, specify the output, source
evidence, and one failure mode or quality dimension per question; do not present
Jev's score as a comprehensive quality verdict.

## Workflow for "use Jev to sort these"

1. Inspect the items and apply the privacy rule.
2. Design 1-4 questions that capture the requested category, priority, or need
   for action.
3. Run Jev per item; collect answers and per-call cost.
4. Show a table with item, Jev's answer, uncertainty, and cost total. Resolve
   low-confidence rows according to the stakes and mark any independent
   judgment "Claude decided."
5. Write replies or summaries yourself based on the decisions.

## Ready-made examples

`examples/` holds runnable request files: `lead-triage.json`,
`support-routing.json`, `rerank-passage.json`, `output-guardrail.json`. Run one
to check the setup:

```
node ~/.claude/skills/use-jev/scripts/jev.mjs ~/.claude/skills/use-jev/examples/lead-triage.json
```

## Endpoint facts (checked 2026-09-28)

- `POST https://openrouter.ai/api/v1/systemone`, `Authorization: Bearer <key>`,
  model `typesafe/jev-1.13`.
- The older `/api/alpha/decisions` route is an automatic fallback when the first
  route returns 404.
- Billing is on input tokens; `usage.cost` is USD per call. 401 bad key, 402 no
  credits, 429 rate limit, 529 overloaded.
- Docs: https://docs.typesafe.ai/llms.txt and
  https://docs.typesafe.ai/model-jaggedness/jev-1.13
