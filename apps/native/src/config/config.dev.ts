// `localhost` covers the iOS simulator. A physical device needs `EXPO_PUBLIC_SERVER_URL` on a LAN
// address or a tunnel, because its `localhost` is the phone.
//
// The recorder defaults to the fake in a dev build: a simulator microphone cannot be scripted, and
// the Maestro flows need a timer and a file they can predict (docs/spec/phase-5.md §8). Set
// `EXPO_PUBLIC_RECORDER=expo` to record for real on a dev build.
export default {
  API_URL: "http://localhost:3001",
  RECORDER: "fake",
} as const;
