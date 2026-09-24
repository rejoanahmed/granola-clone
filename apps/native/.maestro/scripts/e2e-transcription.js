// POST /e2e/transcription { mode: MODE } (docs/spec/phase-5.md §6.4): the fake transcriber's
// scripted mode for this run — `auto`, `hold`, `fail` or `silent`. A reset puts it back to auto.
// Runs in Maestro's embedded JS engine through `runScript`, not in node.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;
const MODES = ["auto", "hold", "fail", "silent"];

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}
if (typeof MODE === "undefined" || MODES.indexOf(MODE) === -1) {
  throw new Error(
    `e2e-transcription.js needs MODE, one of ${MODES.join(", ")}`
  );
}

const response = http.post(`${base}/e2e/transcription`, {
  body: JSON.stringify({ mode: MODE }),
  headers: { "content-type": "application/json", "x-e2e-secret": E2E_SECRET },
});
if (response.status !== 200) {
  throw new Error(
    `POST ${base}/e2e/transcription answered ${response.status}: ${response.body}`
  );
}
