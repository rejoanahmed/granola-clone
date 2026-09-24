// POST /e2e/reset, then /e2e/seed, against the local API (docs/spec/phase-3.md §8). Runs in
// Maestro's embedded JS engine through `runScript`, not in node.
//
// API_URL defaults here rather than in a flow's `env:`, because a subflow's own `env:` default wins
// over `-e API_URL=…` from the command line — the trap `launch-app.yaml` records for DEV_SERVER_URL.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}

for (const path of ["/e2e/reset", "/e2e/seed"]) {
  const response = http.post(`${base}${path}`, {
    body: "",
    headers: { "x-e2e-secret": E2E_SECRET },
  });
  if (response.status !== 200) {
    throw new Error(
      `POST ${base}${path} answered ${response.status}: ${response.body}`
    );
  }
}
