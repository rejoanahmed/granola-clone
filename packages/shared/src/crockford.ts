// Crockford base32: drops I, L, O and U because gate staff retype these codes by hand. Encoding
// is strict and decoding forgiving on purpose — what we emit is canonical, what a human hands
// back is not.
export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const BITS_PER_CHAR = 5;
const BITS_PER_BYTE = 8;
const CHAR_MASK = 0b1_1111;
const BYTE_MASK = 0xff;

const SEPARATORS = /[\s-]/g;

const DECODE_ALIASES: Readonly<Record<string, string>> = {
  I: "1",
  L: "1",
  O: "0",
};

// Big-endian 5-bit groups, no padding char; trailing bits are zeros and `decodeCrockford` drops
// exactly those, which is what makes the pair round-trip at every input length.
export const encodeCrockford = (bytes: Uint8Array): string => {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    // At most 4 bits are carried, so masking to 5 keeps `buffer` clear of `<<`'s 32-bit edge.
    buffer = ((buffer & CHAR_MASK) << BITS_PER_BYTE) | byte;
    bits += BITS_PER_BYTE;
    while (bits >= BITS_PER_CHAR) {
      bits -= BITS_PER_CHAR;
      out += CROCKFORD_ALPHABET.charAt((buffer >>> bits) & CHAR_MASK);
    }
  }
  if (bits > 0) {
    out += CROCKFORD_ALPHABET.charAt(
      (buffer << (BITS_PER_CHAR - bits)) & CHAR_MASK
    );
  }
  return out;
};

// Returns `null` on any symbol outside the alphabet (U included) rather than throwing: the caller
// is a check-in handler, and an unreadable code is an answer, not an exception.
export const decodeCrockford = (text: string): Uint8Array | null => {
  const normalised = text.replace(SEPARATORS, "").toUpperCase();
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of normalised) {
    const index = CROCKFORD_ALPHABET.indexOf(DECODE_ALIASES[char] ?? char);
    if (index < 0) {
      return null;
    }
    buffer = ((buffer & BYTE_MASK) << BITS_PER_CHAR) | index;
    bits += BITS_PER_CHAR;
    if (bits >= BITS_PER_BYTE) {
      bits -= BITS_PER_BYTE;
      out.push((buffer >>> bits) & BYTE_MASK);
    }
  }
  return new Uint8Array(out);
};
