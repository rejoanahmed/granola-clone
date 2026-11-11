import { appError } from "@kn/domain/Errors";

// Its own tag, not the router's `NotFound`: a flow polling for a code, or its author reading the
// response, must be able to tell "nothing sent to this address yet" from "no such route" — the
// second means the harness is disarmed or the path is wrong, and retrying it will never help.
export class NoOutboxMail extends appError("NoOutboxMail", 404) {}
