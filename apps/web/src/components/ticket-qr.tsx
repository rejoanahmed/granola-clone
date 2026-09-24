// Hand-rolled, no QR dependency: every constant below is hard-wired to a version-1 symbol at EC
// level M, the only size a 10-character ticket code needs. Mask 0 is fixed rather than scored.

import type { Ticket } from "@evb/domain/Domain/Ticket";
import { formatDhakaDateTime } from "@evb/shared/time";

const SIZE = 21;
const EC_CODEWORDS = 10;
const DATA_CODEWORDS = 16;
/** 4 bits of mode + 8 bits of length + 4 bits of terminator leaves 14 whole bytes. */
const MAX_BYTES = 14;
const QUIET_ZONE = 4;

const UNSET = 0;
const LIGHT = 1;
const DARK = 2;

// GF(256) log/exp tables, modulo 0x11D; doubled so an exponent sum never needs a second reduce.
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if ((x & 0x100) !== 0) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255] ?? 0;
  }
}

const gfExp = (i: number): number => GF_EXP[i % 255] ?? 0;

const gfMul = (a: number, b: number): number =>
  a === 0 || b === 0
    ? 0
    : (GF_EXP[((GF_LOG[a] ?? 0) + (GF_LOG[b] ?? 0)) % 255] ?? 0);

const polyMul = (a: readonly number[], b: readonly number[]): number[] => {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      out[i + j] = (out[i + j] ?? 0) ^ gfMul(a[i] ?? 0, b[j] ?? 0);
    }
  }
  return out;
};

/** g(x) = ∏ (x − α^i) for i in [0, count), leading coefficient first. */
const rsGenerator = (count: number): number[] => {
  let poly: number[] = [1];
  for (let i = 0; i < count; i++) {
    poly = polyMul(poly, [1, gfExp(i)]);
  }
  return poly;
};

/** Polynomial long division; the remainder IS the error-correction block. */
const rsRemainder = (data: readonly number[], count: number): number[] => {
  const generator = rsGenerator(count);
  const remainder = new Array<number>(count).fill(0);
  for (const byte of data) {
    const factor = byte ^ (remainder[0] ?? 0);
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < count; i++) {
      remainder[i] = (remainder[i] ?? 0) ^ gfMul(generator[i + 1] ?? 0, factor);
    }
  }
  return remainder;
};

// Always exactly 16 data codewords — that is what lets the layout below be constants, not a table.
const dataCodewords = (text: string): number[] => {
  const bytes: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code > 0xff) {
      throw new Error("ticket-qr: payload must be latin-1");
    }
    bytes.push(code);
  }
  if (bytes.length > MAX_BYTES) {
    throw new Error(`ticket-qr: payload exceeds ${MAX_BYTES} bytes`);
  }

  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
    }
  };

  push(0b0100, 4);
  push(bytes.length, 8);
  for (const byte of bytes) {
    push(byte, 8);
  }

  const capacity = DATA_CODEWORDS * 8;
  for (let i = 0; i < 4 && bits.length < capacity; i++) {
    bits.push(0);
  }
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i + j] ?? 0);
    }
    codewords.push(byte);
  }

  const pad = [0xec, 0x11] as const;
  while (codewords.length < DATA_CODEWORDS) {
    codewords.push(pad[codewords.length % 2] ?? 0);
  }
  return codewords;
};

const index = (row: number, col: number): number => row * SIZE + col;
const read = (m: Uint8Array, row: number, col: number): number =>
  m[index(row, col)] ?? UNSET;
const write = (
  m: Uint8Array,
  row: number,
  col: number,
  dark: boolean
): void => {
  m[index(row, col)] = dark ? DARK : LIGHT;
};

/** The 7x7 eye plus its one-module light separator, clipped at the symbol edge. */
const placeFinder = (m: Uint8Array, row: number, col: number): void => {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) {
        continue;
      }
      const ring =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      write(m, rr, cc, ring || core);
    }
  }
};

const G15 = 0b101_0011_0111;
const G15_MASK = 0b101_0100_0001_0010;

const bchDigits = (value: number): number => {
  let digits = 0;
  let remaining = value;
  while (remaining !== 0) {
    digits++;
    remaining >>>= 1;
  }
  return digits;
};

// BCH(15,5) then XOR with a fixed pattern, so an all-zero selection is not an all-white region a
// scanner would mistake for quiet zone.
const formatBits = (ecIndicator: number, mask: number): number => {
  const data = (ecIndicator << 3) | mask;
  let d = data << 10;
  while (bchDigits(d) - bchDigits(G15) >= 0) {
    d ^= G15 << (bchDigits(d) - bchDigits(G15));
  }
  return ((data << 10) | d) ^ G15_MASK;
};

/** Both copies, so the symbol survives losing a corner. */
const placeFormat = (m: Uint8Array, bits: number): void => {
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;
    if (i < 6) {
      write(m, i, 8, dark);
    } else if (i < 8) {
      write(m, i + 1, 8, dark);
    } else {
      write(m, SIZE - 15 + i, 8, dark);
    }
  }
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;
    if (i < 8) {
      write(m, 8, SIZE - i - 1, dark);
    } else if (i < 9) {
      write(m, 8, 15 - i, dark);
    } else {
      write(m, 8, 14 - i, dark);
    }
  }
  // The module that is dark in every QR symbol ever made.
  write(m, SIZE - 8, 8, true);
};

// Skips any cell a function pattern already claimed, so format information must be placed first.
const placeData = (m: Uint8Array, codewords: readonly number[]): void => {
  let direction = -1;
  let row = SIZE - 1;
  let bit = 7;
  let byte = 0;

  for (let col = SIZE - 1; col > 0; col -= 2) {
    // Column 6 is timing; stepping the loop variable itself is what keeps the remaining pairs
    // aligned — 20/19 … 8/7, then 5/4, 3/2, 1/0, each non-timing column visited once.
    if (col === 6) {
      col--;
    }
    for (;;) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (read(m, row, cc) !== UNSET) {
          continue;
        }
        let dark = false;
        if (byte < codewords.length) {
          dark = (((codewords[byte] ?? 0) >>> bit) & 1) === 1;
        }
        // Mask 0, applied inline because a mask must never touch a function pattern and this
        // loop only visits cells that are not one.
        if ((row + cc) % 2 === 0) {
          dark = !dark;
        }
        write(m, row, cc, dark);
        bit--;
        if (bit === -1) {
          byte++;
          bit = 7;
        }
      }
      row += direction;
      if (row < 0 || row >= SIZE) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }
};

/** `true` where a module is dark, row-major, 21x21. */
export const qrMatrix = (text: string): boolean[] => {
  const modules = new Uint8Array(SIZE * SIZE);

  placeFinder(modules, 0, 0);
  placeFinder(modules, SIZE - 7, 0);
  placeFinder(modules, 0, SIZE - 7);
  for (let i = 8; i < SIZE - 8; i++) {
    write(modules, i, 6, i % 2 === 0);
    write(modules, 6, i, i % 2 === 0);
  }
  // Level M's indicator value is 0; the mask is 0.
  placeFormat(modules, formatBits(0, 0));

  const data = dataCodewords(text);
  placeData(modules, [...data, ...rsRemainder(data, EC_CODEWORDS)]);

  return Array.from(modules, (value) => value === DARK);
};

// `crispEdges` stops the browser antialiasing module boundaries into grey, and the four-module
// quiet zone is not optional — a scanner uses it to find the symbol at all.
export const TicketQr = ({
  className,
  value,
}: {
  readonly className?: string;
  readonly value: string;
}) => {
  const modules = qrMatrix(value);
  const span = SIZE + QUIET_ZONE * 2;

  const rects: string[] = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (modules[row * SIZE + col] === true) {
        rects.push(`M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
      }
    }
  }

  return (
    <svg
      className={className}
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${span} ${span}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{`Ticket ${value}`}</title>
      <rect fill="#ffffff" height={span} width={span} x="0" y="0" />
      <path d={rects.join("")} fill="#000000" />
    </svg>
  );
};

// The code is printed under the symbol because check-in is a human typing or reading out those
// ten characters — a cracked screen must not cost the attendee their seat.
export const TicketCard = ({ ticket }: { readonly ticket: Ticket }) => (
  <li className="evb-card grid justify-items-center gap-2">
    <TicketQr className="w-40" value={ticket.code} />
    <p className="font-mono text-sm tracking-widest">{ticket.code}</p>
    <p className="text-muted text-xs">
      #{ticket.seq} ·{" "}
      {ticket.status === "checked_in" && ticket.checkedInAt !== null
        ? `checked in ${formatDhakaDateTime(ticket.checkedInAt)}`
        : ticket.status}
    </p>
  </li>
);
