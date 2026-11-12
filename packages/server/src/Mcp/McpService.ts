import type { Actor } from "../Auth/Actor";
import { secretMatches } from "../Auth/SessionCookie";
import type { OwnersRepo } from "../Owners/OwnersRepo";
import { OWNER_ID } from "../Owners/OwnersService";

export type McpDeps = {
  readonly ownerEmail: string;
  readonly ownerName: string;
  readonly repo: OwnersRepo;
  readonly token: string;
};

// D038. The token stands in for the server's one owner, read-only: there is no session, no cookie
// and no row, so revoking it is replacing the secret. `null` rather than a throw, because the
// router answers 401 with a `WWW-Authenticate` header that `on-error.ts` has no way to add.
export const makeMcpService = (deps: McpDeps) => ({
  actorFor: async (presented: string | null): Promise<Actor | null> => {
    if (presented === null || !secretMatches(presented, deps.token)) {
      return null;
    }
    // Before the first pairing there is no owner row: the reads below then find nothing, which is
    // the truth about an unpaired server.
    const owner = await deps.repo.byId(OWNER_ID);
    return {
      email: deps.ownerEmail,
      id: OWNER_ID,
      name: owner?.name ?? deps.ownerName,
    };
  },
});

export type McpService = ReturnType<typeof makeMcpService>;
