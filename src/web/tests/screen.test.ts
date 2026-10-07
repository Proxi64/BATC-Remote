import { beforeEach, describe, expect, it, vi } from "vitest";
import { DIM_AFTER_MS, ScreenKeeper, wakesScreen, type ScreenNative } from "../src/core/screen";

function setup(dimEnabled = true, motion = false, sensitivity = 5) {
  const calls: string[] = [];
  const native: ScreenNative = {
    keepOn: on => calls.push(`keepOn:${on}`),
    setDim: dim => calls.push(`dim:${dim}`),
    watchMotion: (on, s) => calls.push(on ? `motion:on:${s}` : "motion:off")
  };
  const opts = { dimEnabled: () => dimEnabled, motionEnabled: () => motion, motionSensitivity: () => sensitivity };
  const keeper = new ScreenKeeper(native, opts);
  return {
    keeper, calls,
    setDimEnabled: (v: boolean) => { dimEnabled = v; },
    setMotion: (v: boolean) => { motion = v; },
    setSensitivity: (v: number) => { sensitivity = v; }
  };
}

describe("screen kept on during a flight (Android app)", () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it("keeps the screen on, then dims it after 30 s without touch", () => {
    const { keeper, calls } = setup();
    keeper.setActive(true);
    expect(calls).toEqual(["keepOn:true"]);
    vi.advanceTimersByTime(DIM_AFTER_MS - 1);
    expect(keeper.isDimmed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(keeper.isDimmed).toBe(true);
    expect(calls).toEqual(["keepOn:true", "dim:true"]);
  });

  it("a touch restarts the delay; on a dimmed screen it only wakes it up", () => {
    const { keeper, calls } = setup();
    keeper.setActive(true);
    vi.advanceTimersByTime(20_000);
    expect(keeper.touch()).toBe(false);          // normal brightness: the touch acts normally
    vi.advanceTimersByTime(20_000);
    expect(keeper.isDimmed).toBe(false);         // 30 s counted again from the touch
    vi.advanceTimersByTime(10_000);
    expect(keeper.isDimmed).toBe(true);
    expect(keeper.touch()).toBe(true);           // dimmed: this touch is swallowed
    expect(keeper.isDimmed).toBe(false);
    expect(calls.slice(-1)).toEqual(["dim:false"]);
  });

  it("an ATC call brings the brightness back and restarts the delay", () => {
    const { keeper } = setup();
    keeper.setActive(true);
    vi.advanceTimersByTime(DIM_AFTER_MS);
    keeper.wake();
    expect(keeper.isDimmed).toBe(false);
    vi.advanceTimersByTime(DIM_AFTER_MS);
    expect(keeper.isDimmed).toBe(true);
  });

  it("only the messages addressed to our aircraft wake the screen", () => {
    expect(wakesScreen("atc")).toBe(true);
    expect(wakesScreen("cpdlcAtc")).toBe(true);
    expect(wakesScreen("atcTraffic")).toBe(false);
    expect(wakesScreen("traffic")).toBe(false);
    expect(wakesScreen("player")).toBe(false);
    expect(wakesScreen("cpdlcPilot")).toBe(false);
  });

  it("leaving the flight restores the phone's normal behaviour", () => {
    const { keeper, calls } = setup();
    keeper.setActive(true);
    vi.advanceTimersByTime(DIM_AFTER_MS);
    keeper.setActive(false);
    expect(calls).toEqual(["keepOn:true", "dim:true", "keepOn:false", "dim:false"]);
    vi.advanceTimersByTime(DIM_AFTER_MS * 3);
    expect(keeper.touch()).toBe(false);
    keeper.wake();
    expect(calls).toHaveLength(4);               // nothing happens outside a flight
  });

  it("dimming can be switched off", () => {
    const { keeper, setDimEnabled } = setup(false);
    keeper.setActive(true);
    vi.advanceTimersByTime(DIM_AFTER_MS * 2);
    expect(keeper.isDimmed).toBe(false);
    setDimEnabled(true);
    keeper.refresh();
    vi.advanceTimersByTime(DIM_AFTER_MS);
    expect(keeper.isDimmed).toBe(true);
    setDimEnabled(false);
    keeper.refresh();                            // switched off while dimmed: normal brightness at once
    expect(keeper.isDimmed).toBe(false);
  });

  it("watches the motion sensors only while the screen is dimmed", () => {
    const { keeper, calls } = setup(true, true, 7);
    keeper.setActive(true);
    vi.advanceTimersByTime(DIM_AFTER_MS);
    expect(calls).toEqual(["keepOn:true", "dim:true", "motion:on:7"]);
    keeper.touch();                              // woken by a touch: sensors off
    expect(calls.slice(-2)).toEqual(["motion:off", "dim:false"]);
    expect(keeper.isWatchingMotion).toBe(false);
  });

  it("picking up or moving the phone brings the brightness back", () => {
    const { keeper, calls } = setup(true, true);
    keeper.setActive(true);
    vi.advanceTimersByTime(DIM_AFTER_MS);
    keeper.motion();                             // reported once by the native side, which then stops
    expect(keeper.isDimmed).toBe(false);
    expect(calls.slice(-1)).toEqual(["dim:false"]);
    vi.advanceTimersByTime(DIM_AFTER_MS);        // dimmed again: watching again
    expect(calls.slice(-2)).toEqual(["dim:true", "motion:on:5"]);
  });

  it("motion option off, or sensitivity changed while dimmed", () => {
    const { keeper, calls, setMotion, setSensitivity } = setup(true, false);
    keeper.setActive(true);
    vi.advanceTimersByTime(DIM_AFTER_MS);
    expect(calls).toEqual(["keepOn:true", "dim:true"]);   // option off: sensors never used
    setMotion(true);
    keeper.refresh();
    expect(calls.slice(-1)).toEqual(["motion:on:5"]);
    setSensitivity(12);                                  // out of range: clamped
    keeper.refresh();
    expect(calls.slice(-2)).toEqual(["motion:off", "motion:on:10"]);
    expect(keeper.isDimmed).toBe(true);                  // changing a setting does not wake the screen
  });
});
