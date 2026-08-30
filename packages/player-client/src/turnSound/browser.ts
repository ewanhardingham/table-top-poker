import {
  playAudioBuffer,
  type PlaybackHandle,
} from "@table-top-poker/ui-shared";
import {
  type CaptureEffects,
  type CaptureRecordingSession,
} from "./capture.js";
import type { RecordedTurnSoundTake } from "./model.js";

type GetUserMedia = (
  constraints: MediaStreamConstraints,
) => Promise<MediaStream>;

function microphoneGetUserMedia(): GetUserMedia | null {
  const navigatorWithOptionalMedia = navigator as unknown as {
    readonly mediaDevices?: MediaDevices;
  };
  const mediaDevices = navigatorWithOptionalMedia.mediaDevices;
  if (mediaDevices === undefined) return null;
  const getUserMedia = Reflect.get(mediaDevices, "getUserMedia") as unknown;
  if (typeof getUserMedia !== "function") return null;
  return getUserMedia.bind(mediaDevices) as GetUserMedia;
}

export function microphoneRecordingAvailable(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  if (window.location.protocol !== "https:") return false;
  if (microphoneGetUserMedia() === null) return false;
  return (
    typeof MediaRecorder !== "undefined" && typeof AudioContext !== "undefined"
  );
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

export async function requestMicrophonePermission(): Promise<void> {
  if (!microphoneRecordingAvailable()) {
    throw new Error("microphone recording is unavailable");
  }
  const getUserMedia = microphoneGetUserMedia();
  if (getUserMedia === null)
    throw new Error("microphone recording is unavailable");
  const stream = await getUserMedia({ audio: true });
  stopTracks(stream);
}

function supportedMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function levelFrom(samples: Uint8Array): number {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample - 128) / 128);
  }
  return peak;
}

export async function startBrowserRecording(
  onLevel: (level: number) => void,
): Promise<CaptureRecordingSession<RecordedTurnSoundTake>> {
  if (!microphoneRecordingAvailable()) {
    throw new Error("microphone recording is unavailable");
  }

  const getUserMedia = microphoneGetUserMedia();
  if (getUserMedia === null)
    throw new Error("microphone recording is unavailable");
  const stream = await getUserMedia({ audio: true });
  let audioContext: AudioContext;
  try {
    audioContext = new AudioContext();
  } catch (error) {
    stopTracks(stream);
    throw error;
  }
  let recorder: MediaRecorder | null = null;
  let inputStopped = false;
  let contextClosed = false;
  let frame: number | null = null;

  try {
    const input = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    input.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    const chunks: Blob[] = [];
    let resolveData!: (blob: Blob) => void;
    let rejectData!: (error: unknown) => void;
    const data = new Promise<Blob>((resolve, reject) => {
      resolveData = resolve;
      rejectData = reject;
    });

    const options = supportedMimeType();
    recorder =
      options === undefined
        ? new MediaRecorder(stream)
        : new MediaRecorder(stream, { mimeType: options });
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("error", (event) => {
      rejectData(new Error(`recording failed: ${event.type}`));
    });
    recorder.addEventListener("stop", () => {
      resolveData(
        new Blob(chunks, {
          type: recorder?.mimeType ?? options ?? "audio/webm",
        }),
      );
    });
    recorder.start();

    const sample = (): void => {
      if (inputStopped) return;
      analyser.getByteTimeDomainData(samples);
      onLevel(levelFrom(samples));
      frame = window.requestAnimationFrame(sample);
    };

    void audioContext.resume().catch(() => undefined);
    sample();

    const stopInput = (): void => {
      if (inputStopped) return;
      inputStopped = true;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
      input.disconnect();
      stopTracks(stream);
    };

    const closeContext = async (): Promise<void> => {
      if (contextClosed) return;
      contextClosed = true;
      await audioContext.close();
    };

    let stopPromise: Promise<RecordedTurnSoundTake> | null = null;
    let discarded = false;

    return {
      stop(): Promise<RecordedTurnSoundTake> {
        if (stopPromise !== null) return stopPromise;
        if (discarded) {
          return Promise.reject(new Error("recording was discarded"));
        }
        stopInput();
        stopPromise = (async () => {
          try {
            if (recorder?.state !== "inactive") recorder?.stop();
            const blob = await data;
            return {
              audio: blob,
              buffer: await audioContext.decodeAudioData(
                await blob.arrayBuffer(),
              ),
            };
          } finally {
            await closeContext().catch(() => undefined);
          }
        })();
        return stopPromise;
      },
      discard(): void {
        if (discarded || stopPromise !== null) return;
        discarded = true;
        stopInput();
        if (recorder?.state !== "inactive") recorder?.stop();
        void data.catch(() => undefined);
        void closeContext().catch(() => undefined);
      },
    };
  } catch (error) {
    stopTracks(stream);
    if (recorder?.state !== "inactive") recorder?.stop();
    await audioContext.close().catch(() => undefined);
    throw error;
  }
}

export function createBrowserCaptureEffects(
  onConfirm: (take: RecordedTurnSoundTake) => void,
): CaptureEffects<RecordedTurnSoundTake> {
  return {
    now: () => performance.now(),
    schedule: (fn, delayMs) => {
      const timer = window.setTimeout(fn, delayMs);
      return () => {
        window.clearTimeout(timer);
      };
    },
    start: startBrowserRecording,
    play: (take, onEnded): PlaybackHandle => {
      const playback = playAudioBuffer(take.buffer);
      let stopped = false;
      const timer = window.setTimeout(
        onEnded,
        Math.max(0, take.buffer.duration * 1000),
      );
      return {
        stop(): void {
          if (stopped) return;
          stopped = true;
          window.clearTimeout(timer);
          playback.stop();
        },
      };
    },
    onConfirm,
  };
}
