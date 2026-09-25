export type PersonViewState = "loading" | "populated" | "notFound" | "error";

type Inputs = {
  /** `GET /people/{key}` answered 404 `PersonNotFound`. */
  readonly notFound: boolean;
  /** Any other failure of either request. */
  readonly failed: boolean;
  /** Both requests have answered. */
  readonly settled: boolean;
};

// docs/spec/phase-8.md §3.2: not found wins over error, and error wins over loading.
export function personViewState({
  failed,
  notFound,
  settled,
}: Inputs): PersonViewState {
  if (notFound) {
    return "notFound";
  }
  if (failed) {
    return "error";
  }
  return settled ? "populated" : "loading";
}

export type PersonLines = {
  readonly domain: string | null;
  readonly email: string | null;
  readonly name: string;
};

/**
 * What the header draws. Until the person answers, only `?name=` is known, so there are no email
 * or domain lines yet; a name-only person never has them (§3.2).
 */
export function personLines(
  person:
    | {
        readonly domain: string | null;
        readonly email: string | null;
        readonly name: string;
      }
    | undefined,
  paramName: string | undefined
): PersonLines {
  if (person === undefined) {
    return { domain: null, email: null, name: paramName ?? "" };
  }
  return {
    domain: person.email === null ? null : person.domain,
    email: person.email,
    name: person.name,
  };
}
