import { afterEach, describe, expect, it, vi } from "vitest";
import {
  microphoneRecordingAvailable,
  requestMicrophonePermission,
} from "./browser.js";

const FakeMediaRecorder = vi.fn();
const FakeAudioContext = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubBrowser(protocol: string, mediaDevices: object | undefined): void {
  vi.stubGlobal("window", { location: { protocol } });
  vi.stubGlobal("navigator", { mediaDevices });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
}

describe("microphoneRecordingAvailable", () => {
  it("requires HTTPS even when the browser exposes a microphone", () => {
    const getUserMedia = vi.fn();
    stubBrowser("http:", { getUserMedia });

    expect(microphoneRecordingAvailable()).toBe(false);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("does not offer the prompt when the microphone API is absent", () => {
    stubBrowser("https:", undefined);

    expect(microphoneRecordingAvailable()).toBe(false);
  });

  it("offers recording when all browser pieces are present", () => {
    stubBrowser("https:", { getUserMedia: vi.fn() });

    expect(microphoneRecordingAvailable()).toBe(true);
  });
});

it("stops the permission stream before the prompt can begin recording", async () => {
  const stop = vi.fn();
  const getUserMedia = vi.fn(() =>
    Promise.resolve({ getTracks: () => [{ stop }] }),
  );
  stubBrowser("https:", { getUserMedia });

  await requestMicrophonePermission();

  expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  expect(stop).toHaveBeenCalledOnce();
});
