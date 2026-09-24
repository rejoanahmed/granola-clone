import { nanoid } from "nanoid";

// Sixteen, not nanoid's default 21: short enough that a derived id (`<prefix><body>_<seq>`) still
// fits the 64-character ceiling every branded id schema declares.
const ID_ENTROPY = 16;

export type Ids = {
  generate: (prefix: string) => string;
  uuid: () => string;
};

export const makeIds = (): Ids => ({
  generate: (prefix) => `${prefix}${nanoid(ID_ENTROPY)}`,
  uuid: () => crypto.randomUUID(),
});
