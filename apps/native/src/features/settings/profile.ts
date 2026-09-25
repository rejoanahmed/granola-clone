import { SETTINGS_COPY } from "./copy";

export type ProfileTextField =
  | "companyDescription"
  | "companyName"
  | "jobTitle"
  | "linkedinUsername"
  | "name";

export type ProfileFieldResult =
  | { readonly kind: "unchanged"; readonly value: string }
  | { readonly kind: "invalid"; readonly error: string }
  | {
      readonly kind: "patch";
      /** The field's key and its new value; `null` clears it (never for `name`). */
      readonly patch: Partial<Record<ProfileTextField, string | null>>;
      /** What the field should show once saved: the trimmed, normalised draft. */
      readonly value: string;
    };

const LINKEDIN_PREFIX = /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\//i;
const LINKEDIN_USERNAME = /^[A-Za-z0-9-]{3,100}$/;

// A pasted profile URL keeps only its username (docs/spec/phase-10.md §3.2).
export function normaliseLinkedin(input: string): string {
  return input.trim().replace(LINKEDIN_PREFIX, "").replace(/\/+$/, "");
}

// Decides what an `onEndEditing` on one field sends. `saved` is the last value the server holds;
// a blank draft clears an optional field and is refused for the name, which better-auth requires.
export function profileFieldPatch(
  field: ProfileTextField,
  draft: string,
  saved: string | null
): ProfileFieldResult {
  const value =
    field === "linkedinUsername" ? normaliseLinkedin(draft) : draft.trim();
  if (field === "name" && value === "") {
    return { error: SETTINGS_COPY.profile.nameError, kind: "invalid" };
  }
  if (
    field === "linkedinUsername" &&
    value !== "" &&
    !LINKEDIN_USERNAME.test(value)
  ) {
    return { error: SETTINGS_COPY.profile.linkedinError, kind: "invalid" };
  }
  if (value === (saved ?? "").trim()) {
    return { kind: "unchanged", value };
  }
  return {
    kind: "patch",
    patch: { [field]: value === "" ? null : value },
    value,
  };
}
