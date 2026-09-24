import { appError } from "../Errors";

// No row, or a draft requested by a non-organiser: 404 rather than 403, because a 403 would confirm
// the draft exists.
export class EventNotFound extends appError("EventNotFound", 404) {}

/** Authenticated, but not this event's organiser. `details.action` names the policy. */
export class NotEventOrganiser extends appError("NotEventOrganiser", 403) {}

/** A mutation outside `draft`; published events only allow raising `quantityTotal`. */
export class EventNotEditable extends appError("EventNotEditable", 409) {}

/** No stocked ticket type, or a start time in the past. */
export class EventNotPublishable extends appError("EventNotPublishable", 422) {}

// `quantityTotal` below `quantityClaimed` would oversell seats already held or sold, so it is
// refused rather than clamped. `details.quantityClaimed` is the floor.
export class QuantityBelowClaimed extends appError(
  "QuantityBelowClaimed",
  409
) {}
