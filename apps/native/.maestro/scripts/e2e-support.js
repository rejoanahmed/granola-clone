// GET /e2e/support?kind=KIND (docs/spec/phase-10.md §6.1): the support mail the fake email port
// wrote to the outbox, newest first. Throws unless the newest message's subject is exactly
// EXPECT_SUBJECT and, when EXPECT_BODY is given, its body contains it. Runs in Maestro's embedded
// JS engine through `runScript`, not in node.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;
const KINDS = ["bug-report", "feedback", "desktop-reminder"];

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}
if (typeof KIND === "undefined" || KINDS.indexOf(KIND) === -1) {
  throw new Error(`e2e-support.js needs KIND, one of ${KINDS.join(", ")}`);
}
if (typeof EXPECT_SUBJECT === "undefined" || EXPECT_SUBJECT === "") {
  throw new Error("e2e-support.js needs EXPECT_SUBJECT");
}

const response = http.get(`${base}/e2e/support?kind=${KIND}`, {
  headers: { "x-e2e-secret": E2E_SECRET },
});
if (response.status !== 200) {
  throw new Error(
    `GET ${base}/e2e/support?kind=${KIND} answered ${response.status}: ${response.body}`
  );
}

const newest = json(response.body).items[0];
if (newest === undefined) {
  throw new Error(`GET /e2e/support?kind=${KIND} answered no messages`);
}
if (newest.subject !== EXPECT_SUBJECT) {
  throw new Error(
    `the newest ${KIND} is "${newest.subject}", expected "${EXPECT_SUBJECT}"`
  );
}
if (
  typeof EXPECT_BODY !== "undefined" &&
  EXPECT_BODY !== "" &&
  String(newest.body).indexOf(EXPECT_BODY) === -1
) {
  throw new Error(
    `the newest ${KIND}'s body does not contain "${EXPECT_BODY}": ${newest.body}`
  );
}
