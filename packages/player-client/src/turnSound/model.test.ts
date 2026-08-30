import { describe, expect, it } from "vitest";
import { playbackValues } from "./model.js";

function buffer(samples: readonly number[], sampleRate = 100): AudioBuffer {
  return {
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => Float32Array.from(samples),
  } as unknown as AudioBuffer;
}

describe("playbackValues", () => {
  it("levels a take and trims silence with a short boundary pad", () => {
    const values = playbackValues(buffer([0, 0, 0, 0.4, 0.2, 0, 0, 0, 0, 0]));

    expect(values.gain).toBeCloseTo(2);
    expect(values.offset).toBe(0);
    expect(values.duration).toBeCloseTo(0.08);
  });

  it("caps amplification and leaves a silent take untrimmed", () => {
    expect(playbackValues(buffer([0.001, 0.001])).gain).toBe(4);
    expect(playbackValues(buffer([0, 0]))).toEqual({
      gain: 1,
      offset: 0,
      duration: 0.02,
    });
  });
});
