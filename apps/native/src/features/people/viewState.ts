export type PersonViewState = "loading" | "populated" | "notFound" | "error";

type Inputs = {
  /** `GET /people/{key}` answered 404 `PersonNotFound`. */
  readonly notFound: boolean;
  /** The list's first page answered with no notes. */
  readonly noNotes: boolean;
  /** Any other failure of either request. */
  readonly failed: boolean;
  /** Both requests have answered. */
  readonly settled: boolean;
};

// docs/spec/phase-8.md §3.2: not found wins over error, and error wins over loading. A person who
// resolves with no notes is not found too: a cached person whose last note was trashed since has
// nothing to list, and a header over a blank page would say nothing.
export function personViewState({
  failed,
  noNotes,
  notFound,
  settled,
}: Inputs): PersonViewState {
  if (notFound) {
    return "notFound";
  }
  if (failed) {
    return "error";
  }
  if (!settled) {
    return "loading";
  }
  return noNotes ? "notFound" : "populated";
}

export type PersonLines = {
  readonly domain: string | null;
  readonly email: string | null;
  readonly name: string;
  /** A person who answered with no address. While loading this is false: the layout waits. */
  readonly nameOnly: boolean;
};

/**
 * What the header draws. Until the person answers, only `?name=` is known, so there are no email
 * or domain lines yet, but the layout stays the populated one so nothing jumps when they land.
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
    return {
      domain: null,
      email: null,
      name: paramName ?? "",
      nameOnly: false,
    };
  }
  return {
    domain: person.domain,
    email: person.email,
    name: person.name,
    nameOnly: person.email === null,
  };
}
