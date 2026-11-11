import type { AudioContentType } from "@kn/domain/Domain/Recording";

// The microphone records raw AAC in ADTS framing (`.aac`), not MPEG-4 (`.m4a`), and that is the
// whole of the kill-safety story (D037). An `.m4a` is unreadable until `stop()` writes its index
// (the `moov` atom) at the end, so an app killed mid-meeting used to leave an hour of audio no
// decoder would open. ADTS has no index: every frame carries its own header, so a file cut off at
// any point is valid up to its last whole frame, and a relaunch can upload what was captured.
export const LIVE_AUDIO_EXTENSION = ".aac";

/** The `Content-Type` an upload carries, from the file's extension. Older pending files are `.m4a`. */
export const contentTypeOf = (extension: string): AudioContentType =>
  extension === ".aac" ? "audio/aac" : "audio/mp4";

const ADTS_HEADER_BYTES = 7;
const SAMPLES_PER_FRAME = 1024;
// MPEG-4 sampling frequency index (ISO/IEC 14496-3 §1.6.3.4); 15 = explicit, never written by iOS.
const SAMPLE_RATES = [
  96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000,
  12_000, 11_025, 8000, 7350,
] as const;

// Arithmetic rather than bit operators (the lint forbids those): `x / 2 ** n` floored is `x >> n`,
// and `% 2 ** n` keeps the low n bits.
const bits = (byte: number, shift: number, width: number): number =>
  Math.floor(byte / 2 ** shift) % 2 ** width;

// 12 sync bits (0xFFF), then the layer (2 bits at 1–2), always 0.
const isSync = (bytes: Uint8Array, at: number): boolean => {
  const b1 = bytes[at + 1] ?? 0;
  return bytes[at] === 0xff && bits(b1, 4, 4) === 0x0f && bits(b1, 1, 2) === 0;
};

/**
 * The audio duration of an ADTS stream, by walking its frame headers: each frame is 1024 samples
 * at the rate its header names. A trailing partial frame (the kill landed mid-write) is not
 * counted. Bytes that are not ADTS at all answer 0, which the caller reads as "nothing to save".
 */
export function adtsDurationMs(bytes: Uint8Array): number {
  let at = 0;
  let samplesMs = 0;
  while (at + ADTS_HEADER_BYTES <= bytes.length && isSync(bytes, at)) {
    const b2 = bytes[at + 2] ?? 0;
    const b3 = bytes[at + 3] ?? 0;
    const b4 = bytes[at + 4] ?? 0;
    const b5 = bytes[at + 5] ?? 0;
    const rate = SAMPLE_RATES[bits(b2, 2, 4)];
    // 13 bits across bytes 3–5: the frame's length, header included.
    const frameLength = bits(b3, 0, 2) * 2 ** 11 + b4 * 2 ** 3 + bits(b5, 5, 3);
    if (rate === undefined || frameLength < ADTS_HEADER_BYTES) {
      break;
    }
    if (at + frameLength > bytes.length) {
      break;
    }
    samplesMs += (SAMPLES_PER_FRAME * 1000) / rate;
    at += frameLength;
  }
  return Math.floor(samplesMs);
}
