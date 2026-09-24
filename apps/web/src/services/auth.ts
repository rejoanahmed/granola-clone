import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeaders } from "@tanstack/react-start/server";
import { authClient } from "@web/lib/auth-client";

// Exported because three places must agree on it: the root seeds it, `login.tsx` invalidates it,
// the header clears it on sign-out.
export const SESSION_QUERY_KEY = ["session"] as const;

export type UserSession = {
  readonly user: {
    readonly email: string;
    readonly id: string;
    readonly name: string;
  };
};

// The raw `Cookie` re-read off `getRequest()` is deliberate belt-and-braces: on Cloudflare the
// framework's header view has been seen to arrive without it, and the failure is a silent null
// session.
export const getUserSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<UserSession | null> => {
    const request = getRequest();
    const requestHeaders = getRequestHeaders();

    const headers = new Headers();
    if (requestHeaders) {
      for (const [key, value] of requestHeaders.entries()) {
        headers.set(key, value);
      }
    }

    const cookieHeader =
      request?.headers.get("cookie") ?? request?.headers.get("Cookie");
    if (cookieHeader) {
      headers.set("Cookie", cookieHeader);
    }

    // No cookie at all is the common case (crawlers, first visits); answering here skips a round
    // trip to the API.
    if (!cookieHeader) {
      return null;
    }

    const result = await authClient.getSession({
      fetchOptions: { credentials: "include", headers },
    });

    const user = result?.data?.user;
    if (!(user && result?.data?.session)) {
      return null;
    }

    return {
      user: { email: user.email, id: user.id, name: user.name },
    };
  }
);
