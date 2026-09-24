// The newest sign-in code the fake email provider wrote for EMAIL, from GET /e2e/otp
// (docs/spec/phase-3.md §6.6), into `output.otp` for the flow to type. Runs in Maestro's embedded
// JS engine through `runScript`, not in node.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;
const SIX_DIGITS = /^\d{6}$/;

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}
if (typeof EMAIL === "undefined" || EMAIL === "") {
  throw new Error("read-otp.js needs EMAIL");
}

const response = http.get(
  `${base}/e2e/otp?email=${encodeURIComponent(EMAIL)}`,
  { headers: { "x-e2e-secret": E2E_SECRET } }
);
if (response.status !== 200) {
  throw new Error(
    `GET /e2e/otp for ${EMAIL} answered ${response.status}: ${response.body}`
  );
}

const mail = json(response.body);
if (!SIX_DIGITS.test(String(mail.otp))) {
  throw new Error(`GET /e2e/otp answered no six-digit code: ${response.body}`);
}
output.otp = String(mail.otp);
