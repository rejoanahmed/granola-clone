import { describe, expect, it } from "vitest";
import {
  actionOfTarget,
  activityChanged,
  activityPropsOf,
} from "./activityProps";

const FIXED = {
  colors: { accent: "a", background: "b", stop: "s", text: "t" },
  labels: {
    interrupted: "Interrupted",
    pause: "Pause",
    paused: "Paused",
    recording: "Recording",
    resume: "Resume",
    stop: "Stop",
  },
  maxMs: 21_600_000,
  untitled: "Untitled note",
};

const NOW = 1_700_000_000_000;

describe("activityPropsOf", () => {
  it("anchors the system timer at now minus the recorded time, so it reads the card's elapsed", () => {
    const props = activityPropsOf(
      { elapsedMs: 65_000, now: NOW, state: "recording", title: "Standup" },
      FIXED
    );
    expect(props.anchorMs).toBe(NOW - 65_000);
    expect(props.pausedAtMs).toBeNull();
    expect(props.title).toBe("Standup");
  });

  it("freezes the timer at now when paused or interrupted", () => {
    for (const state of ["paused", "interrupted"] as const) {
      const props = activityPropsOf(
        { elapsedMs: 10_000, now: NOW, state, title: null },
        FIXED
      );
      expect(props.pausedAtMs).toBe(NOW);
      // pauseTime − lower is what the frozen timer shows: the recorded time.
      expect((props.pausedAtMs ?? 0) - props.anchorMs).toBe(10_000);
    }
  });

  it("names an untitled recording as the card does", () => {
    expect(
      activityPropsOf(
        { elapsedMs: 0, now: NOW, state: "recording", title: null },
        FIXED
      ).title
    ).toBe("Untitled note");
  });
});

describe("activityChanged", () => {
  it("updates only when the state or the title changes, never for time alone", () => {
    const shown = { state: "recording", title: "A" } as const;
    expect(activityChanged(null, shown)).toBe(true);
    expect(activityChanged(shown, { state: "recording", title: "A" })).toBe(
      false
    );
    expect(activityChanged(shown, { state: "paused", title: "A" })).toBe(true);
    expect(activityChanged(shown, { state: "recording", title: "B" })).toBe(
      true
    );
  });
});

describe("actionOfTarget", () => {
  it("knows the three buttons and nothing else", () => {
    expect(actionOfTarget("stop")).toBe("stop");
    expect(actionOfTarget("pause")).toBe("pause");
    expect(actionOfTarget("resume")).toBe("resume");
    expect(actionOfTarget("__expo_widgets_target_0")).toBeNull();
  });
});
