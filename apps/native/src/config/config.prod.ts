// No server: every user brings their own (D019), so a store build starts at the connect screen and
// keeps the address the user gives it (`src/lib/server.ts`). An internal build can still point at
// one with `EXPO_PUBLIC_SERVER_URL`.
export default {
  API_URL: "",
  RECORDER: "expo",
} as const;
