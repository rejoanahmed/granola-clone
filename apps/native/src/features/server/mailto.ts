// A `mailto:` link the iOS mail composer opens prefilled. Encoded per RFC 6068, so a message with
// `&`, `?` or a newline arrives as written rather than cut at the first one.
export const mailtoUrl = (to: string, subject: string, body: string): string =>
  `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
