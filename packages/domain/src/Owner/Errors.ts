import { appError } from "../Errors";

// The token did not match. One error for "wrong" and "empty" alike, and no hint of how close.
export class OwnerTokenInvalid extends appError("OwnerTokenInvalid", 401) {}

// This server signs people in by email code; there is no owner to pair with. A 404, because to
// a client it is a route this server does not have.
export class OwnerPairingDisabled extends appError(
  "OwnerPairingDisabled",
  404
) {}
