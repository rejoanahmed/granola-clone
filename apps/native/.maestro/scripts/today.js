// The simulator's local date as `yyyy-mm-dd`, the key of today's day header (`home-day-<key>`).
// The simulator runs on this Mac, so Maestro's JS engine and the app share one time zone.
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
output.today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
