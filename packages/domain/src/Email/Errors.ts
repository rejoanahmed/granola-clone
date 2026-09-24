import { appError } from "../Errors";

// The provider could not take the message. A 503, not a 500: nothing on our side is broken, and a
// client's honest answer is to try again shortly rather than to report a bug.
export class EmailUnavailable extends appError("EmailUnavailable", 503) {}
