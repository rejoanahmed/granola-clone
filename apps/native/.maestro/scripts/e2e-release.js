// POST /e2e/transcription/release (docs/spec/phase-5.md §6.4): the switch back to auto, then one
// sweep, so a recording held at "Uploading transcript..." finishes now rather than on the next
// cron. The sweep's counts land in `output.released`. Runs in Maestro's embedded JS engine.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}

const response = http.post(`${base}/e2e/transcription/release`, {
  body: "",
  headers: { "x-e2e-secret": E2E_SECRET },
});
if (response.status !== 200) {
  throw new Error(
    `POST ${base}/e2e/transcription/release answered ${response.status}: ${response.body}`
  );
}
output.released = json(response.body);
