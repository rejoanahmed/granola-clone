import type { UserType } from "@gc/domain/Domain/Profile";

// #84's menu, in its order. The values are the API's; the labels are what the menu shows.
export const USER_TYPES: readonly {
  readonly label: string;
  readonly value: UserType;
}[] = [
  { label: "Investing", value: "investing" },
  { label: "Recruiting", value: "recruiting" },
  { label: "Customer Facing", value: "customer_facing" },
  { label: "Startup/Generalist", value: "startup_generalist" },
  { label: "Other", value: "other" },
];

export const userTypeLabel = (value: UserType | null): string | null =>
  USER_TYPES.find((option) => option.value === value)?.label ?? null;
