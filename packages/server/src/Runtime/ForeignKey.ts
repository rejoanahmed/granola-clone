// SQLite's message, which D1 passes through; drizzle wraps it, so the chain of causes is walked.
const FOREIGN_KEY_FAILED = /FOREIGN KEY constraint failed/;

const isForeignKeyFailure = (error: unknown): boolean => {
  let current: unknown = error;
  while (current instanceof Error) {
    if (FOREIGN_KEY_FAILED.test(current.message)) {
      return true;
    }
    current = current.cause;
  }
  return false;
};

// A service reads the user row before it writes, but the account can be deleted between the two
// (the cascade takes the user's rows with it). The insert then fails the foreign key; answering
// `false` lets the service report the `ProfileNotFound` it would have reported a moment earlier,
// instead of the constraint surfacing as a 500.
export const unlessUserGone = async (
  write: Promise<unknown>
): Promise<boolean> => {
  try {
    await write;
    return true;
  } catch (error) {
    if (isForeignKeyFailure(error)) {
      return false;
    }
    throw error;
  }
};
