// POST /e2e/folders (docs/spec/phase-9.md §6.5): person's two folders, Personal (solo) and Product
// (launch, standup and the trashed archived note). Idempotent, and cleared by every reset, so a flow
// runs it after open-home.yaml's reset and before it first opens the drawer. Runs in Maestro's
// embedded JS engine through `runScript`, not in node.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}

const response = http.post(`${base}/e2e/folders`, {
  body: "",
  headers: { "x-e2e-secret": E2E_SECRET },
});
if (response.status !== 200) {
  throw new Error(
    `POST ${base}/e2e/folders answered ${response.status}: ${response.body}`
  );
}
