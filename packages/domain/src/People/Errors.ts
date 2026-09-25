import { appError } from "../Errors";

// No live note of the caller's has this attendee. Another user's guest and a person whose only note
// is trashed answer exactly as an unknown key does. Person-scoped Ask raises the same class.
export class PersonNotFound extends appError("PersonNotFound", 404) {}
