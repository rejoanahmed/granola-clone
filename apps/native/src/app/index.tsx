import { HomeShell } from "@native/features/home/HomeShell";
import { useAuth } from "@native/lib/auth-provider";

// The session already carries the name the avatar needs, so home makes no request of its own.
export default function HomeScreen() {
  const { session } = useAuth();
  return <HomeShell name={session?.user.name} />;
}
