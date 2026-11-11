import { UserId } from "@gc/domain/Domain/Ids";
import type { OwnerSession, ServerInfo } from "@gc/domain/Domain/Server";
import {
  OwnerPairingDisabled,
  OwnerTokenInvalid,
} from "@gc/domain/Owner/Errors";
import { secretMatches, sessionCookieFor } from "../Auth/SessionCookie";
import type { Clock } from "../Runtime/Clock";
import type { Ids } from "../Runtime/Ids";
import type { UnitOfWork } from "../Runtime/UnitOfWork";
import type { OwnersRepo } from "./OwnersRepo";

// The one account on a self-hosted server. Fixed, so a second pairing (a new phone, a reinstall)
// signs in to the same notes rather than an empty account beside them.
export const OWNER_ID = UserId.parse("usr_owner");

// The same lifetime as a code sign-in's session (`createAuth`'s `session.expiresIn`), refreshed by
// better-auth's `updateAge` as the app is used.
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type OwnerAuth = {
  readonly ownerEmail: string;
  readonly ownerName: string;
  readonly token: string;
};

export type OwnersDeps = {
  /** Signs the session cookie better-auth verifies. */
  readonly authSecret: string;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly info: ServerInfo;
  /** `null` when the server signs people in by email code: pairing is then not a route it has. */
  readonly owner: OwnerAuth | null;
  readonly repo: OwnersRepo;
  readonly uow: UnitOfWork;
};

const setCookieOf = (
  cookie: { readonly name: string; readonly value: string },
  maxAgeSeconds: number,
  secure: boolean
): string =>
  [
    `${cookie.name}=${cookie.value}`,
    `Max-Age=${maxAgeSeconds}`,
    "Path=/",
    "HttpOnly",
    ...(secure ? ["Secure", "SameSite=None"] : ["SameSite=Lax"]),
  ].join("; ");

export const makeOwnersService = (deps: OwnersDeps) => ({
  info: (): ServerInfo => deps.info,

  // `origin` is the request's: better-auth names its cookie by the origin it answers on, so a
  // cookie minted for another one is silently ignored (the E2E harness learned this first).
  pair: async (token: string, origin: string): Promise<OwnerSession> => {
    if (deps.owner === null) {
      throw new OwnerPairingDisabled({});
    }
    // Constant time, so the comparison leaks nothing a timing attacker can climb. The rate limit
    // in front of the route bounds the guesses; the token's length makes them pointless.
    if (!secretMatches(token, deps.owner.token)) {
      throw new OwnerTokenInvalid({});
    }
    const now = deps.clock.now();
    const expiresAt = now + SESSION_LIFETIME_MS;
    const sessionToken = deps.ids.uuid();
    const existing = await deps.repo.byId(OWNER_ID);
    await deps.uow.commit((stage) => {
      deps.repo.stageOwner(
        stage,
        {
          email: deps.owner?.ownerEmail ?? "",
          id: OWNER_ID,
          name: existing?.name ?? deps.owner?.ownerName ?? "",
        },
        now
      );
      deps.repo.stageSession(
        stage,
        {
          expiresAt,
          id: deps.ids.generate("ses_"),
          token: sessionToken,
          userId: OWNER_ID,
        },
        now
      );
    });
    const cookie = await sessionCookieFor({
      authSecret: deps.authSecret,
      origin,
      token: sessionToken,
    });
    return {
      cookie,
      expiresAt,
      setCookie: setCookieOf(
        cookie,
        Math.floor(SESSION_LIFETIME_MS / 1000),
        origin.startsWith("https://")
      ),
    };
  },
});

export type OwnersService = ReturnType<typeof makeOwnersService>;
