// POST /e2e/llm/run { times: TIMES } (docs/spec/phase-6.md §6.6, §8 note 1): TIMES inline passes over
// every queued generation, whatever its age, each spending one attempt, with the LLM switch left as
// it is. It is how a flow drives a `fail` job to "Couldn’t generate notes." without waiting out the
// queue's retry delay. Runs in Maestro's embedded JS engine.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}
const times = typeof TIMES === "undefined" ? Number.NaN : Number(TIMES);
if (!(times >= 1 && times <= 5 && Math.floor(times) === times)) {
  throw new Error("e2e-llm-run.js needs TIMES, a whole number from 1 to 5");
}

const response = http.post(`${base}/e2e/llm/run`, {
  body: JSON.stringify({ times }),
  headers: { "content-type": "application/json", "x-e2e-secret": E2E_SECRET },
});
if (response.status !== 200) {
  throw new Error(
    `POST ${base}/e2e/llm/run answered ${response.status}: ${response.body}`
  );
}
output.llmRun = json(response.body);
