// POST /e2e/llm/release (docs/spec/phase-6.md §6.6): the LLM switch back to auto, then every queued
// generation run inline, so a note held at "Generating notes..." finishes now rather than whenever
// the local queue gets to it. The run's counts land in `output.llmReleased`. Runs in Maestro's
// embedded JS engine.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}

const response = http.post(`${base}/e2e/llm/release`, {
  body: "",
  headers: { "x-e2e-secret": E2E_SECRET },
});
if (response.status !== 200) {
  throw new Error(
    `POST ${base}/e2e/llm/release answered ${response.status}: ${response.body}`
  );
}
output.llmReleased = json(response.body);
