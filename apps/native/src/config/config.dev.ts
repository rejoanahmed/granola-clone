// `localhost` covers the iOS simulator. A physical device needs `EXPO_PUBLIC_SERVER_URL` on a LAN
// address or a tunnel, because its `localhost` is the phone.
export default {
  API_URL: "http://localhost:3001",
} as const;
