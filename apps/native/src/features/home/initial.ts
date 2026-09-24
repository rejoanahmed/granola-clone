// The avatar's letter. Email-OTP sign-up leaves `name` empty, and a name of only spaces is no
// better, so both fall back to the product's own initial rather than to a blank circle.
export function initialFor(name: string | null | undefined): string {
  return name?.trim().charAt(0).toUpperCase() || "N";
}
