// POST /e2e/session/ROLE (docs/TESTING.md §8, "Fast sign-in"): the harness mints a real
// better-auth session for a seeded person and answers its signed cookie. This turns it into the
// Set-Cookie header the dev build's `-gcE2eSession` launch argument carries into the auth jar,
// in `output.session`. Runs in Maestro's embedded JS engine through `runScript`, not in node.
//
// No Max-Age: the jar then keeps the cookie until the server stops honouring it, and the server's
// session row (30 days) is the expiry that decides anything.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;
const ROLES = ["person", "other", "empty"];

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}
if (typeof ROLE === "undefined" || ROLES.indexOf(ROLE) === -1) {
  throw new Error(`e2e-session.js needs ROLE, one of ${ROLES.join(", ")}`);
}

const response = http.post(`${base}/e2e/session/${ROLE}`, {
  body: "",
  headers: { "x-e2e-secret": E2E_SECRET },
});
if (response.status !== 200) {
  throw new Error(
    `POST ${base}/e2e/session/${ROLE} answered ${response.status}: ${response.body}`
  );
}

const minted = json(response.body);
output.session = `${minted.cookie.name}=${minted.cookie.value}; Path=/; HttpOnly; SameSite=Lax`;
