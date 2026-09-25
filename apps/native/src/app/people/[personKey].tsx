import { PersonScreen } from "@native/features/people/PersonScreen";
import { useLocalSearchParams } from "expo-router";

// The person page (#65). `name` paints the header before the person answers, as the person chat's
// title does (docs/spec/phase-8.md §3.2).
export default function Person() {
  const { name, personKey } = useLocalSearchParams<{
    name?: string;
    personKey: string;
  }>();
  return <PersonScreen paramName={name} personKey={personKey} />;
}
