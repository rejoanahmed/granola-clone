// `registrations.attendee_phone` is stored normalised because it doubles as the bKash
// `payerReference`; an unnormalised number makes merchant reconciliation hand-matching.

const DIVISIONS = [
  "Barishal",
  "Chattogram",
  "Dhaka",
  "Khulna",
  "Mymensingh",
  "Rajshahi",
  "Rangpur",
  "Sylhet",
] as const;

export type BdDivision = (typeof DIVISIONS)[number];

// Widened to `readonly string[]` on purpose: `includes`/`Set.has` take an invariant parameter, so
// a literal tuple stops callers passing a plain `string`. The narrow type is `BdDivision`.
export const BD_DIVISIONS: readonly string[] = DIVISIONS;

const DISTRICTS = [
  "Bagerhat",
  "Bandarban",
  "Barguna",
  "Barishal",
  "Bhola",
  "Bogura",
  "Brahmanbaria",
  "Chandpur",
  "Chapai Nawabganj",
  "Chattogram",
  "Chuadanga",
  "Cox's Bazar",
  "Cumilla",
  "Dhaka",
  "Dinajpur",
  "Faridpur",
  "Feni",
  "Gaibandha",
  "Gazipur",
  "Gopalganj",
  "Habiganj",
  "Jamalpur",
  "Jashore",
  "Jhalokati",
  "Jhenaidah",
  "Joypurhat",
  "Khagrachhari",
  "Khulna",
  "Kishoreganj",
  "Kurigram",
  "Kushtia",
  "Lakshmipur",
  "Lalmonirhat",
  "Madaripur",
  "Magura",
  "Manikganj",
  "Meherpur",
  "Moulvibazar",
  "Munshiganj",
  "Mymensingh",
  "Naogaon",
  "Narail",
  "Narayanganj",
  "Narsingdi",
  "Natore",
  "Netrokona",
  "Nilphamari",
  "Noakhali",
  "Pabna",
  "Panchagarh",
  "Patuakhali",
  "Pirojpur",
  "Rajbari",
  "Rajshahi",
  "Rangamati",
  "Rangpur",
  "Satkhira",
  "Shariatpur",
  "Sherpur",
  "Sirajganj",
  "Sunamganj",
  "Sylhet",
  "Tangail",
  "Thakurgaon",
] as const;

export type BdDistrict = (typeof DISTRICTS)[number];

/** `readonly string[]`, for the reason given on `BD_DIVISIONS`. */
export const BD_DISTRICTS: readonly string[] = DISTRICTS;

const NON_DIGITS = /\D/g;
const INTERNATIONAL_PREFIX = "00";
const COUNTRY_CODE = "880";

// `1`, an allocated operator digit (3–9), then eight subscriber digits — the same pattern
// `CreateRegistration` validates with, so what this accepts the API accepts.
const MSISDN_PATTERN = /^8801[3-9]\d{8}$/;

const withCountryCode = (digits: string): string => {
  if (digits.startsWith(COUNTRY_CODE)) {
    return digits;
  }
  // A leading 0 is the national trunk prefix: the country code replaces it, not prefixes it.
  if (digits.startsWith("0")) {
    return `88${digits}`;
  }
  return `${COUNTRY_CODE}${digits}`;
};

// `null` rather than a throw: every caller is a form or a validator, and both want the failure
// as a value.
export const normaliseMsisdn = (raw: string): string | null => {
  const digits = raw.replace(NON_DIGITS, "");
  const national = digits.startsWith(INTERNATIONAL_PREFIX)
    ? digits.slice(INTERNATIONAL_PREFIX.length)
    : digits;
  const msisdn = withCountryCode(national);
  return MSISDN_PATTERN.test(msisdn) ? msisdn : null;
};

export const isBdMsisdn = (raw: string): boolean =>
  normaliseMsisdn(raw) !== null;
