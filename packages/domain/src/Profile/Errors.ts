import { appError } from "../Errors";

// A session whose user row is gone: the account was deleted while a device still held a cookie.
export class ProfileNotFound extends appError("ProfileNotFound", 404) {}
