# use-jev

A skill that lets **Claude Code** and **Codex** hand off bounded semantic
decisions to [Jev](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
(`typesafe/jev-1.13`), TypeSafe's System One decision model, through OpenRouter.

You give Jev some text and a typed question. It gives you back a choice, a
score, or a probability — with calibrated confidence — instead of prose. Your
agent stays in charge of the workflow and writes anything a human will read.

```
  text  ──▶  Jev  ──▶  { queue: "billing", confidence: 0.91 }  ──▶  your agent acts
```

---

## Why this is useful

A general-purpose model asked "which queue does this ticket belong in?" will
think out loud, hedge, and hand you a paragraph you then have to parse. That is
slow, costs more than the decision is worth, and gives you no usable measure of
how sure it was.

Jev is built for exactly that shape of question:

| | General model | Jev |
| --- | --- | --- |
| Output | Prose you must parse | Typed answer: choice / score / probability |
| Uncertainty | Implied in wording | An explicit `confidence` or probability you can threshold |
| Cost | Billed on input **and** generated tokens | Billed on input tokens; `usage.cost` is returned per call |
| Determinism | Format drifts between calls | Fixed answer shape, every call |

That makes it a good fit whenever a decision sits inside a bigger workflow:

- **Triage** — route tickets, emails, or leads to the right queue
- **Classify and label** — bulk-label a backlog with a fixed taxonomy
- **Score and rank** — rerank search passages, score leads, grade LLM output
- **Detect and gate** — flag PII, hallucinated claims, or escalation conditions
- **Route** — pick a handler or model tier per request

The point is division of labour: **Jev decides, your agent explains and acts.**
Latency and cost come back in every response, so you can see what the decision
actually cost rather than guessing.

### When *not* to use it

- Anything that needs prose written — Claude or Codex does that.
- Arithmetic, counting, date comparison, policy enforcement — do it in code.
- Unbounded questions with no defined options or rubric levels.
- As an authority. Jev is a **signal**. It does not grant permissions, override
  policy, or authorise a consequential action on its own.

---

## Requirements

- **Node.js 18+** (uses global `fetch` and `AbortSignal.timeout`)
- An **OpenRouter API key** with credit — <https://openrouter.ai/keys>
- Claude Code, Codex CLI, or any agent that can run a shell command

---

## Install

### 1. Get the files

```bash
git clone https://github.com/kmasterrr/use-jev.git
cd use-jev
```

### 2. Install as a personal skill

**Windows**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

**macOS / Linux**

```bash
bash scripts/install.sh
```

Either one copies `SKILL.md`, `scripts/`, and `examples/` into
`~/.claude/skills/use-jev`. To install it for one project instead of your whole
account, copy the same files into `<project>/.claude/skills/use-jev`.

### 3. Save your OpenRouter key

Run this **in your own terminal**, not through an agent — input is hidden and
the key is never printed.

**Windows** (encrypted with DPAPI; only your Windows user on that PC can read it)

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\skills\use-jev\scripts\set-key.ps1"
```

**macOS / Linux** (written to `~/.claude/secrets/openrouter.key`, mode 0600)

```bash
bash ~/.claude/skills/use-jev/scripts/set-key.sh
```

**Or skip both** and export the key from your own secret manager:

```bash
export OPENROUTER_API_KEY="sk-or-..."
```

The script looks for a key in that order: `OPENROUTER_API_KEY`, then
`~/.claude/secrets/openrouter.key`, then `~/.claude/secrets/openrouter.dpapi`.

### 4. Check it works

```bash
node ~/.claude/skills/use-jev/scripts/jev.mjs ~/.claude/skills/use-jev/examples/lead-triage.json
```

You should get `"ok": true` and an `answers` object. Restart Claude Code so it
picks up the new skill, then just say **"use Jev to triage these"** and it will
load on its own.

---

## Using it with Codex

`AGENTS.md` in this repo carries the same operating rules as `SKILL.md`, in the
convention Codex reads. Two ways to wire it up:

**Per project** — copy `AGENTS.md` and `scripts/jev.mjs` into the project, or
merge the contents of `AGENTS.md` into the project's existing `AGENTS.md`:

```bash
cp AGENTS.md /path/to/project/
mkdir -p /path/to/project/tools/jev && cp scripts/jev.mjs /path/to/project/tools/jev/
```

**Globally** — append `AGENTS.md` to `~/.codex/AGENTS.md` and point it at the
installed copy:

```bash
cat AGENTS.md >> ~/.codex/AGENTS.md
```

Codex needs shell access to run `node`, and it needs the key: either export
`OPENROUTER_API_KEY` in the shell you launch it from, or let it read the same
`~/.claude/secrets/` files the Claude Code install uses. Nothing about the
script is Claude-specific — any agent that can write a JSON file and run a
command can use it.

---

## Usage

Write a request file somewhere temporary (not in your repo), then run:

```bash
node ~/.claude/skills/use-jev/scripts/jev.mjs request.json
```

You can also pipe it:

```bash
cat request.json | node ~/.claude/skills/use-jev/scripts/jev.mjs
```

### Request shape

```json
{
  "state": "The text Jev should judge. String, object, or array.",
  "questions": {
    "question_id": {
      "type": "choice | score | noul",
      "instructions": "The question, in one sentence.",
      "criteria": "Shape depends on the type - see below."
    }
  }
}
```

Several independent questions about the **same** state go in one call. A batch
of different items means one call per item; aggregate the results in code.

### The three question types

**`choice`** — pick one option. `criteria` is an object mapping each option to a
description of when to pick it (up to 255 options).

```json
{
  "type": "choice",
  "instructions": "Which team should handle this message?",
  "criteria": {
    "billing": "The message concerns charges, invoices, or payment.",
    "technical": "The message concerns a product fault or error."
  }
}
```

Returns `choice`, `probabilities`, `confidence`.

**`score`** — place on an ordered rubric. `criteria` is an array of 2–10
descriptions, lowest to highest.

```json
{
  "type": "score",
  "instructions": "How urgently does this need a human response?",
  "criteria": [
    "No response needed",
    "Routine, normal queue",
    "Elevated, customer is blocked",
    "Critical, money or data at risk"
  ]
}
```

Returns a probability-weighted `score` across 0-based levels, plus
`probabilities`, `legend`, `confidence`. It is a rubric position, not a
measurement — 2.4 means "between level 2 and level 3, nearer 2."

**`noul`** — yes/no. `criteria` is `{ "true": "...", "false": "..." }`, both
optional.

```json
{
  "type": "noul",
  "instructions": "Does this email need a personal, human-written reply?",
  "criteria": {
    "true": "A real person should respond individually.",
    "false": "Can be ignored or handled with a template."
  }
}
```

Returns `noul` — the probability of yes, 0 to 1. There is no separate confidence
field; the value near 0.5 *is* the uncertainty.

### Response shape

Success:

```json
{
  "ok": true,
  "ms": 412,
  "route": "https://openrouter.ai/api/v1/systemone",
  "model": "typesafe/jev-1.13",
  "cost": 0.0000312,
  "usage": { "...": "..." },
  "answers": {
    "queue": { "choice": "billing", "probabilities": { "billing": 0.94, "technical": 0.06 }, "confidence": 0.94 },
    "duplicate_charge": { "noul": 0.97 }
  }
}
```

Failure (exit code 1):

```json
{ "ok": false, "status": 402, "error": "...", "body": "..." }
```

`JEV_TIMEOUT_MS` overrides the 15-second timeout.

---

## Examples

Four runnable request files live in [`examples/`](examples/):

| File | Pattern | What it shows |
| --- | --- | --- |
| [`lead-triage.json`](examples/lead-triage.json) | Score + classify | Rate a cold email as a sales lead, label its type, decide if it needs a personal reply |
| [`support-routing.json`](examples/support-routing.json) | Route | Pick a queue, rate urgency, flag money at stake and customer frustration — four questions, one call |
| [`rerank-passage.json`](examples/rerank-passage.json) | Rank | Score one query/passage pair for relevance; run per candidate and sort in code |
| [`output-guardrail.json`](examples/output-guardrail.json) | Detect and gate | Check a draft reply for unsupported claims and third-party data leaks before it is sent |

Run any of them:

```bash
node ~/.claude/skills/use-jev/scripts/jev.mjs examples/support-routing.json
```

### What it looks like in practice

> **You:** Here are 30 support tickets in `tickets.json`. Use Jev to route them
> and tell me which ones need me today.

The agent will apply the privacy rule first (these tickets leave your machine —
it asks before sending anything that could be private), build one request per
ticket from a shared question set, run them, and come back with a table:

| # | Queue | Urgency | Confidence | Cost |
| --- | --- | --- | --- | --- |
| 4821 | billing | 2.8 / 3 | 0.94 | $0.000031 |
| 4822 | technical | 1.1 / 3 | 0.88 | $0.000024 |
| 4823 | billing | 2.0 / 3 | **0.41** ← review | $0.000029 |

Row 4823 falls below the confidence floor, so the agent resolves it itself and
marks the row **"Claude decided"** rather than passing off a coin flip as a
verdict. Then it drafts the replies — Jev never writes prose.

### Reranking a candidate set

Jev scores one pair at a time. Fan out, then sort in code:

```bash
for f in candidates/*.json; do
  node ~/.claude/skills/use-jev/scripts/jev.mjs "$f" |
    jq --arg file "$f" '{file: $file, score: .answers.relevance.score}'
done | jq -s 'sort_by(-.score)'
```

---

## Safety and operating rules

These are baked into `SKILL.md` and `AGENTS.md`, so a well-behaved agent follows
them without being told. They matter to you as the operator too:

1. **Privacy.** Everything sent to Jev leaves your machine — OpenRouter first,
   then TypeSafe. The skill requires an explicit yes before sending anything
   that could be private: email, customer data, health or financial
   information, credentials. Never send secrets.
2. **Jev is a signal, not an authority.** It can recommend a route or raise a
   flag. It cannot grant tool permissions, override policy, or authorise a
   consequential action. Enforce real permission checks independently, and keep
   a human in the loop for high-stakes calls.
3. **Calibrate thresholds to your stakes.** Reviewing `confidence` below 0.6,
   and treating `noul` between 0.35 and 0.65 as uncertain, is a reasonable
   starting point for low-stakes sorting — not a universal safety threshold. For
   anything consequential, test on labelled examples and pick thresholds from
   the cost of each error type. Confidence is not proof that one particular
   answer is right.
4. **Keep the question bounded.** Concrete options, concrete rubric levels, only
   the state relevant to that decision. One judgment per question — no compound
   questions, no double negatives.
5. **Keys stay hidden.** Never printed, never pasted into chat, stored outside
   any repo.
6. **Failures are reported, not smoothed over.** If a call fails the agent shows
   the exact error rather than implying Jev decided something.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `no API key` | Nothing found in env or `~/.claude/secrets/`. Run a `set-key` script or export `OPENROUTER_API_KEY`. |
| `401` | The key is wrong or revoked. Re-save it. |
| `402` | The OpenRouter account has no credit. |
| `429` | Rate limited — back off and retry. |
| `529` | Upstream overloaded — retry. |
| `timeout after 15000ms` | Raise it: `JEV_TIMEOUT_MS=30000 node ... request.json` |
| `bad request file` | The JSON did not parse. Check trailing commas and unescaped newlines in `state`. |
| Claude does not pick up the skill | Confirm `~/.claude/skills/use-jev/SKILL.md` exists and restart Claude Code. |
| `set-key.ps1` will not run | Use the `-ExecutionPolicy Bypass` form shown above. |

The script tries `POST /api/v1/systemone` first and falls back to the older
`/api/alpha/decisions` route only on a 404, so it keeps working if the endpoint
moves back.

---

## Endpoint facts

Checked 2026-09-28:

- `POST https://openrouter.ai/api/v1/systemone`, `Authorization: Bearer <key>`,
  model `typesafe/jev-1.13`
- Billing is on input tokens; `usage.cost` is USD for that call
- Docs: <https://docs.typesafe.ai/llms.txt> ·
  <https://docs.typesafe.ai/model-jaggedness/jev-1.13>

---

## Repository layout

```
use-jev/
  SKILL.md              Claude Code skill definition (the operating rules)
  AGENTS.md             The same rules in the convention Codex reads
  scripts/
    jev.mjs             The client - reads a request file, prints JSON
    set-key.ps1         Save a key, DPAPI-encrypted (Windows)
    set-key.sh          Save a key, mode 0600 (macOS/Linux)
    install.ps1         Copy the skill into ~/.claude/skills (Windows)
    install.sh          Copy the skill into ~/.claude/skills (macOS/Linux)
  examples/             Four runnable request files
```

## License

MIT — see [LICENSE](LICENSE).

Jev and the `typesafe/jev-1.13` model are products of TypeSafe, accessed here
through OpenRouter. This repository is an unaffiliated client and skill
definition.
