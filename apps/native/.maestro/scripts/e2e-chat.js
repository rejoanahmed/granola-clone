// POST /e2e/chat { mode: MODE } (docs/spec/phase-7.md §6.6): the fake LLM's chat mode for this run,
// `auto`, `hold` or `fail`. `hold` keeps an answer at "Thinking..." until `e2e-chat-release.js`;
// `fail` makes the next answer fail before its first token. A reset puts it back to auto.
// Runs in Maestro's embedded JS engine through `runScript`, not in node.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;
const MODES = ["auto", "hold", "fail"];

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}
if (typeof MODE === "undefined" || MODES.indexOf(MODE) === -1) {
  throw new Error(`e2e-chat.js needs MODE, one of ${MODES.join(", ")}`);
}

const response = http.post(`${base}/e2e/chat`, {
  body: JSON.stringify({ mode: MODE }),
  headers: { "content-type": "application/json", "x-e2e-secret": E2E_SECRET },
});
if (response.status !== 200) {
  throw new Error(
    `POST ${base}/e2e/chat answered ${response.status}: ${response.body}`
  );
}
