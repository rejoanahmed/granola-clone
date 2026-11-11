import { connectParamsOf } from "@native/features/server/connect";
import { Redirect, useLocalSearchParams } from "expo-router";

// `<scheme>://connect?server=…&token=…`, the link scripts/selfhost.sh prints and draws as a QR code
// (D019): it fills the connect step on welcome, and the user still taps Connect.
export default function ConnectLink() {
  const params = useLocalSearchParams<{ server?: string; token?: string }>();
  const { server, token } = connectParamsOf(params);
  return (
    <Redirect
      href={{ params: { server, token }, pathname: "/screens/welcome" }}
    />
  );
}
