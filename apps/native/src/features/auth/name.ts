/** What "You’re all set, {firstName}" greets: the first word, or null so the title drops the comma. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0] ?? "";
  return first === "" ? null : first;
}
