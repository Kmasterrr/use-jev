# Jev decision model

Jev (`typesafe/jev-1.13`, TypeSafe's System One model, via OpenRouter) answers
bounded semantic questions about text with a typed answer — a choice, a rubric
score, or a yes/no probability — instead of prose.

Use it when a workflow needs one narrow judgment: route, triage, classify,
score, rank, detect, or verify. Then explain, write, and act on the result
yourself. Jev decides; you control the workflow and produce anything a human
reads.

Do **not** use it for prose, arithmetic, counting, date comparison, policy
enforcement, or unbounded questions. Those stay in your own output or in code.

## Rules

1. **Privacy first.** Anything sent to Jev leaves the machine (OpenRouter, then
   TypeSafe). Before sending text that could be private — personal email,
   customer data, credentials, health or financial information, or anything not
   obviously public or made-up — ask the user for an explicit yes. Never send
   secrets. This applies to inboxes, agent traces, tables, and evaluation data.
2. **Jev is a signal, not an authority.** It can recommend a route or flag a
   risk. It does not grant tool permissions, override policy, or authorise a
   consequential action. Enforce real permission checks independently. Use human
   review for high-stakes decisions.
3. **Handle uncertainty for the stakes.** `choice` and `score` return
   `confidence` (0-1); `noul` returns the probability of yes. For low-stakes
   sorting, reviewing confidence below 0.6 and treating noul between 0.35 and
   0.65 as uncertain is a reasonable default — not a universal safety threshold.
   For anything consequential, test labelled examples and choose thresholds from
   the cost of each error type. Confidence is not proof an individual answer is
   correct. When you resolve a low-confidence result yourself, say so explicitly.
4. **Keep the question bounded.** Concrete options or ordered rubric levels;
   only the state relevant to that decision; one judgment per question. No
   compound questions, no double negatives.
5. **Never print the API key.** It is read from `OPENROUTER_API_KEY`, or
   `~/.claude/secrets/openrouter.key` (0600), or
   `~/.claude/secrets/openrouter.dpapi` (Windows DPAPI). If no key is saved, ask
   the user to run `scripts/set-key.sh` or `scripts/set-key.ps1` in their own
   terminal. Never ask them to paste a key into chat.
6. **Report failures exactly.** If a call fails, show the error from the script
   output. Never imply Jev made a decision when the call failed.

## How to call

Write the request JSON to a temporary path (not into the repository), then run:

```bash
node <path-to>/jev.mjs request.json
```

Request:

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

Response: `{ ok, ms, route, model, cost, usage, answers }` on success,
`{ ok:false, error, status, body }` on failure with exit code 1. Timeout is 15s;
override with `JEV_TIMEOUT_MS`.

## Question types

- **`choice`** — pick one. `criteria` is `{ option: "when to pick it" }`, up to
  255 options. Returns `choice`, `probabilities`, `confidence`.
- **`score`** — ordered rubric. `criteria` is an array of 2-10 descriptions,
  lowest to highest. Returns a probability-weighted `score` over 0-based levels,
  plus `probabilities`, `legend`, `confidence`. A rubric position, not a
  measurement.
- **`noul`** — yes/no. `criteria` is `{ "true": "...", "false": "..." }`, both
  optional. Returns `noul`, the probability of yes (0-1). No separate confidence
  field.

Batch several independent questions about the **same** state into one call. For
a set of items, make one call per item and aggregate outside Jev.

## Working pattern for "use Jev on these"

1. Inspect the items; apply the privacy rule before anything is sent.
2. Design 1-4 bounded questions covering the requested category, priority, or
   need for action.
3. Run one call per item; collect answers and per-call cost.
4. Report a table: item, answer, uncertainty, cost total. Resolve
   low-confidence rows according to the stakes and mark them as your own
   judgment.
5. Write the replies, summaries, or code changes yourself.
