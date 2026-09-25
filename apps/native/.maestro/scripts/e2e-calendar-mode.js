// POST /e2e/calendar/mode { mode: MODE } (docs/spec/phase-11.md §6.1): the fake calendar's scripted
// mode for this run — `auto`, or `fail`, which makes every read answer 503 CalendarUnavailable.
// A reset puts it back to auto. Runs in Maestro's embedded JS engine through `runScript`, not in node.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;
const MODES = ["auto", "fail"];

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}
if (typeof MODE === "undefined" || MODES.indexOf(MODE) === -1) {
  throw new Error(
    `e2e-calendar-mode.js needs MODE, one of ${MODES.join(", ")}`
  );
}

const response = http.post(`${base}/e2e/calendar/mode`, {
  body: JSON.stringify({ mode: MODE }),
  headers: { "content-type": "application/json", "x-e2e-secret": E2E_SECRET },
});
if (response.status !== 200) {
  throw new Error(
    `POST ${base}/e2e/calendar/mode answered ${response.status}: ${response.body}`
  );
}
