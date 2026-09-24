import { appError } from "@gc/domain/Errors";

// Tagged `NotFound`, the app's own not-found tag, because to a flow polling for a code "nothing
// sent yet" and "no such route" call for the same retry. The details name the address, which is
// how it differs from the router's 404 when a flow's author is reading the response.
export class NoOutboxMail extends appError("NotFound", 404) {}
