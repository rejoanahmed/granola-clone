// `localhost` covers the iOS simulator and an `adb reverse`d emulator. A physical device needs
// `EXPO_PUBLIC_SERVER_URL` on a LAN address or tunnel — bKash redirects the *device's* browser.
export default {
  API_URL: "http://localhost:3001",
} as const;
