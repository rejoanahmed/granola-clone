import { describe, expect, it } from "vitest";
import { adtsDurationMs, contentTypeOf } from "./audioFormat";

// One ADTS frame of `length` bytes (header included), MPEG-4 AAC LC, mono, at sampling index
// `rateIndex` (4 = 44.1 kHz). The payload is zeros: only the headers are read.
const frame = (length: number, rateIndex = 4): number[] => {
  const bytes = new Array<number>(length).fill(0);
  bytes[0] = 0xff;
  bytes[1] = 0xf1; // sync, MPEG-4, layer 0, no CRC
  bytes[2] = 64 + rateIndex * 4; // profile LC, rate, channel bit 0
  bytes[3] = 64 + (Math.floor(length / 2048) % 4); // one channel, length's top bits
  bytes[4] = Math.floor(length / 8) % 256;
  bytes[5] = (length % 8) * 32 + 0x1f;
  bytes[6] = 0xfc;
  return bytes;
};

const stream = (...frames: number[][]): Uint8Array =>
  Uint8Array.from(frames.flat());

describe("adtsDurationMs", () => {
  it("counts 1024 samples a frame at the header's rate", () => {
    // 44.1 kHz: 1024 / 44100 s = 23.22 ms a frame; 431 frames is just under ten seconds.
    const frames = Array.from({ length: 431 }, () => frame(180));
    expect(adtsDurationMs(stream(...frames))).toBe(
      Math.floor((431 * 1024 * 1000) / 44_100)
    );
  });

  it("reads the rate from each header (48 kHz)", () => {
    expect(adtsDurationMs(stream(frame(100, 3), frame(100, 3)))).toBe(
      Math.floor((2 * 1024 * 1000) / 48_000)
    );
  });

  it("drops a trailing frame the kill cut short", () => {
    const whole = stream(frame(200), frame(200));
    const cut = Uint8Array.from([...whole, ...frame(200).slice(0, 90)]);
    expect(adtsDurationMs(cut)).toBe(adtsDurationMs(whole));
  });

  it("answers 0 for a file that is not ADTS (an unfinished m4a)", () => {
    const m4aHead = Uint8Array.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
    expect(adtsDurationMs(m4aHead)).toBe(0);
    expect(adtsDurationMs(new Uint8Array())).toBe(0);
  });
});

describe("contentTypeOf", () => {
  it("sends live ADTS recordings as audio/aac and older m4a files as audio/mp4", () => {
    expect(contentTypeOf(".aac")).toBe("audio/aac");
    expect(contentTypeOf(".m4a")).toBe("audio/mp4");
  });
});
