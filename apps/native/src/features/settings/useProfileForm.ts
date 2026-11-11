import type { UserType } from "@kn/domain/Domain/Profile";
import { useSignOut } from "@native/features/auth/signOut";
import { hasTag, type Me, useUpdateMe } from "@native/lib/api";
import { authClient } from "@native/lib/auth-client";
import { useAuth } from "@native/lib/auth-provider";
import { useCallback, useRef, useState } from "react";
import { type ProfileTextField, profileFieldPatch } from "./profile";

export const PROFILE_FIELDS: readonly ProfileTextField[] = [
  "name",
  "jobTitle",
  "companyName",
  "companyDescription",
  "linkedinUsername",
];

type Values = Record<ProfileTextField, string>;
type Errors = { name?: string; linkedinUsername?: string; save?: boolean };

const valuesOf = (me: Me | null): Values => ({
  companyDescription: me?.companyDescription ?? "",
  companyName: me?.companyName ?? "",
  jobTitle: me?.jobTitle ?? "",
  linkedinUsername: me?.linkedinUsername ?? "",
  name: me?.name ?? "",
});

// Profile's save-on-edit (docs/spec/phase-10.md §3.2). Fields are initialised from `me` once; each
// `commit` sends only its own key, and a commit for a value already in flight joins that request,
// so Back's flush and the blur it causes never send one edit twice.
export function useProfileForm() {
  const { me, refetchSession } = useAuth();
  const updateMe = useUpdateMe();
  const signOut = useSignOut();
  const [drafts, setDrafts] = useState<Values>(() => valuesOf(me.profile));
  const saved = useRef<Values>(valuesOf(me.profile));
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const inFlight = useRef(new Map<string, Promise<void>>());
  const [userType, setUserType] = useState<UserType | null>(
    me.profile?.userType ?? null
  );
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(0);

  const setDraft = useCallback((field: ProfileTextField, text: string) => {
    setDrafts((current) => ({ ...current, [field]: text }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }, []);

  const track = useCallback(
    async (key: string, request: () => Promise<void>) => {
      const existing = inFlight.current.get(key);
      if (existing) {
        return await existing;
      }
      setPending((n) => n + 1);
      setErrors((current) => ({ ...current, save: false }));
      const promise = request()
        .catch((error: unknown) => {
          if (hasTag(error, "ProfileNotFound")) {
            signOut();
            return;
          }
          setErrors((current) => ({ ...current, save: true }));
        })
        .finally(() => {
          inFlight.current.delete(key);
          setPending((n) => n - 1);
        });
      inFlight.current.set(key, promise);
      return await promise;
    },
    [signOut]
  );

  const commit = useCallback(
    (field: ProfileTextField): Promise<void> => {
      const result = profileFieldPatch(
        field,
        draftsRef.current[field],
        saved.current[field]
      );
      if (result.kind === "invalid") {
        setErrors((current) => ({ ...current, [field]: result.error }));
        if (field === "name") {
          setDrafts((current) => ({ ...current, name: saved.current.name }));
        }
        return Promise.resolve();
      }
      setDrafts((current) => ({ ...current, [field]: result.value }));
      if (result.kind === "unchanged") {
        return Promise.resolve();
      }
      return track(`${field}:${result.value}`, async () => {
        if (field === "name") {
          const answer = await authClient.updateUser({ name: result.value });
          if (answer.error) {
            throw answer.error;
          }
          await refetchSession();
        } else {
          await updateMe.mutateAsync(result.patch);
        }
        saved.current = { ...saved.current, [field]: result.value };
      });
    },
    [refetchSession, track, updateMe]
  );

  const selectUserType = useCallback(
    (value: UserType) => {
      setUserType(value);
      track(`userType:${value}`, async () => {
        await updateMe.mutateAsync({ userType: value });
      }).catch(() => undefined);
    },
    [track, updateMe]
  );

  const flush = useCallback(async () => {
    await Promise.all(PROFILE_FIELDS.map(commit));
    await Promise.all([...inFlight.current.values()]);
  }, [commit]);

  return {
    commit,
    drafts,
    email: me.profile?.email ?? "",
    errors,
    flush,
    savedLinkedin: saved.current.linkedinUsername,
    saving: pending > 0,
    selectUserType,
    setDraft,
    userType,
  };
}
