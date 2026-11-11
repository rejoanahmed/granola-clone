// POST /e2e/calendar { role, events } (docs/spec/phase-11.md §6.5): the fake calendar's rows for
// this run, for `person` and `other`. It REPLACES each role's rows, and a reset clears them. Times
// are computed here, in the simulator's zone (Maestro's JS engine shares this Mac's, as today.js
// relies on), because "tomorrow 13:00" means the device's tomorrow. Ids are left to the harness,
// which numbers them `cev_e2e_<role>_<n>` in array order, so the order below is the testIDs.
//
// PRESET=standard stages §6.5's table and sets `output.nowLine` to row 1's time text, formatted by
// hand as the app formats it (`h:mm AM ‒ h:mm AM`, U+2012 with spaces). PRESET=none stages nothing.
// Runs in Maestro's embedded JS engine through `runScript`, not in node.
const base = typeof API_URL === "undefined" ? "http://localhost:3001" : API_URL;
const PRESETS = ["standard", "none"];

if (typeof E2E_SECRET === "undefined" || E2E_SECRET === "") {
  throw new Error(
    "E2E_SECRET is not set: run through scripts/maestro.sh, which reads it from apps/api/.dev.vars"
  );
}
if (typeof PRESET === "undefined" || PRESETS.indexOf(PRESET) === -1) {
  throw new Error(`e2e-calendar.js needs PRESET, one of ${PRESETS.join(", ")}`);
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const nowMs = Math.floor(Date.now() / MINUTE) * MINUTE;

// Local wall-clock `hour:minute` on the day `dayOffset` days from today.
const at = (dayOffset, hour, minute) => {
  const day = new Date(nowMs);
  day.setDate(day.getDate() + dayOffset);
  day.setHours(hour, minute, 0, 0);
  return day.getTime();
};

const clock = (ms) => {
  const date = new Date(ms);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours < 12 ? "AM" : "PM";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${suffix}`;
};

const PRIYA = { email: "priya@example.com", name: "Priya Raman" };
const SAM = { email: "sam@example.com", name: "Sam Okafor" };
const ME = { email: "e2e-person@kothanote.test", name: "E2E Person" };

const nowStart = nowMs - 15 * MINUTE;
const nowEnd = nowMs + 45 * MINUTE;

const STANDARD = {
  other: [
    // cev_e2e_other_1: another user's, never on person's card.
    { endAt: at(1, 10, 0), startAt: at(1, 9, 0), title: "Other’s meeting" },
  ],
  person: [
    // cev_e2e_person_1: in progress, row 1 with the Now badge.
    {
      attendees: [PRIYA],
      endAt: nowEnd,
      startAt: nowStart,
      title: "Design review",
    },
    // cev_e2e_person_2: tomorrow, row 2.
    {
      attendees: [PRIYA, SAM, ME],
      endAt: at(1, 14, 0),
      startAt: at(1, 13, 0),
      title: "Catch up with the team",
    },
    // cev_e2e_person_3: tomorrow, row 3.
    { endAt: at(1, 15, 30), startAt: at(1, 15, 0), title: "Weekly planning" },
    // cev_e2e_person_4: the fourth, behind "+1 more".
    {
      attendees: [{ name: "Dana Lee" }],
      endAt: at(1, 17, 30),
      startAt: at(1, 17, 0),
      title: "1:1 with Dana",
    },
    // cev_e2e_person_5: ended.
    {
      endAt: nowMs - 2 * HOUR,
      startAt: nowMs - 3 * HOUR,
      title: "Morning sync",
    },
    // cev_e2e_person_6: beyond `until` (the end of tomorrow).
    { endAt: at(2, 11, 0), startAt: at(2, 10, 0), title: "Quarterly review" },
  ],
};

const eventsFor = (role) => (PRESET === "standard" ? STANDARD[role] : []);

for (const role of ["person", "other"]) {
  const response = http.post(`${base}/e2e/calendar`, {
    body: JSON.stringify({ events: eventsFor(role), role }),
    headers: { "content-type": "application/json", "x-e2e-secret": E2E_SECRET },
  });
  if (response.status !== 200) {
    throw new Error(
      `POST ${base}/e2e/calendar (${role}) answered ${response.status}: ${response.body}`
    );
  }
}

output.nowLine = `${clock(nowStart)} ‒ ${clock(nowEnd)}`;
