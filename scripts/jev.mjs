#!/usr/bin/env node
// jev.mjs - call the Jev decision model (typesafe/jev-1.13) through OpenRouter.
//
// Usage:
//   node jev.mjs request.json
//   cat request.json | node jev.mjs
//
// request.json: { "state": <string|object|array>,
//                 "questions": { id: { type, instructions, criteria } } }
//
// Prints JSON: { ok, ms, route, model, cost, usage, answers }
//           or { ok:false, error, status, body }   (exit code 1)
// Never prints the API key.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const MODEL = "typesafe/jev-1.13";
const ROUTES = [
  "https://openrouter.ai/api/v1/systemone",
  "https://openrouter.ai/api/alpha/decisions",
];
const TIMEOUT_MS = Number(process.env.JEV_TIMEOUT_MS || 15000);
const SECRETS = join(homedir(), ".claude", "secrets");

const out = (o) => {
  console.log(JSON.stringify(o, null, 2));
  process.exit(o.ok ? 0 : 1);
};

if (process.argv[2] === "--help" || process.argv[2] === "-h") {
  console.log("usage: node jev.mjs <request.json>   (or pipe the JSON on stdin)");
  process.exit(0);
}

// Key lookup, in order: environment -> plain file (chmod 600) -> Windows DPAPI file.
function getKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim();

  const plain = join(SECRETS, "openrouter.key");
  if (existsSync(plain)) return readFileSync(plain, "utf8").trim();

  const dpapi = join(SECRETS, "openrouter.dpapi");
  if (platform() === "win32" && existsSync(dpapi)) {
    const ps =
      // Double any apostrophes so paths like C:\Users\O'Brien survive PowerShell quoting.
      `$s = Get-Content -LiteralPath '${dpapi.replace(/'/g, "''")}' | ConvertTo-SecureString; ` +
      `[Runtime.InteropServices.Marshal]::PtrToStringAuto(` +
      `[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))`;
    return execFileSync("powershell", ["-NoProfile", "-Command", ps], {
      encoding: "utf8",
    }).trim();
  }
  return null;
}

let req;
try {
  req = JSON.parse(readFileSync(process.argv[2] || 0, "utf8"));
} catch (e) {
  out({ ok: false, error: "bad request file: " + e.message });
}
if (!req?.questions || typeof req.questions !== "object") {
  out({ ok: false, error: "request needs a 'questions' object" });
}

let key;
try {
  key = getKey();
} catch {
  out({ ok: false, error: "could not read the saved key" });
}
if (!key) {
  out({
    ok: false,
    error:
      "no API key. Set OPENROUTER_API_KEY, or run scripts/set-key.ps1 (Windows) " +
      "or scripts/set-key.sh (macOS/Linux).",
  });
}

const body = JSON.stringify({
  model: MODEL,
  state: req.state,
  questions: req.questions,
});

let last;
for (const url of ROUTES) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = Date.now() - t0;
    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      j = null;
    }
    if (r.ok && j?.answers) {
      out({
        ok: true,
        ms,
        route: url,
        model: j.model,
        cost: j.usage?.cost,
        usage: j.usage,
        answers: j.answers,
      });
    }
    last = {
      ok: false,
      ms,
      route: url,
      status: r.status,
      error: j?.error?.message || `HTTP ${r.status}`,
      body: text.slice(0, 1000),
    };
    if (r.status !== 404) break; // only fall back when this route has moved
  } catch (e) {
    last = {
      ok: false,
      ms: Date.now() - t0,
      route: url,
      error:
        e.name === "TimeoutError" ? `timeout after ${TIMEOUT_MS}ms` : e.message,
    };
    break;
  }
}
out(last);
