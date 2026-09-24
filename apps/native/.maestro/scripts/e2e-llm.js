// POST /e2e/llm { mode: MODE } (docs/spec/phase-6.md §6.6): the fake LLM's scripted mode for this
// run — `auto`, `hold`, `fail`, `malformed` or `truncated`. A reset puts it back to auto.
// Runs in Maestro's embedded JS engine through `runScript`, not in node.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;
const MODES = ["auto", "hold", "fail", "malformed", "truncated"];

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}
if (typeof MODE === "undefined" || MODES.indexOf(MODE) === -1) {
  throw new Error(`e2e-llm.js needs MODE, one of ${MODES.join(", ")}`);
}

const response = http.post(`${base}/e2e/llm`, {
  body: JSON.stringify({ mode: MODE }),
  headers: { "content-type": "application/json", "x-e2e-secret": E2E_SECRET },
});
if (response.status !== 200) {
  throw new Error(
    `POST ${base}/e2e/llm answered ${response.status}: ${response.body}`
  );
}
