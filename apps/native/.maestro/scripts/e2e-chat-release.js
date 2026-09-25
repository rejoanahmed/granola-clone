// POST /e2e/chat/release (docs/spec/phase-7.md §6.6): the chat switch back to auto. A held answer
// sees it on its next poll and streams to done. Runs in Maestro's embedded JS engine.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}

const response = http.post(`${base}/e2e/chat/release`, {
  body: "",
  headers: { "x-e2e-secret": E2E_SECRET },
});
if (response.status !== 200) {
  throw new Error(
    `POST ${base}/e2e/chat/release answered ${response.status}: ${response.body}`
  );
}
