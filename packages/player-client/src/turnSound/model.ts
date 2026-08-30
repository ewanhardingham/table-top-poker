export interface RecordedTurnSoundTake {
  readonly audio: Blob;
  readonly buffer: AudioBuffer;
}

export interface TurnSoundPlayback {
  readonly buffer: AudioBuffer;
  readonly gain: number;
  readonly offset: number;
  readonly duration: number;
}

export function playbackValues(
  buffer: AudioBuffer,
): Omit<TurnSoundPlayback, "buffer"> {
  let peak = 0;
  let first = buffer.length;
  let last = -1;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let index = 0; index < samples.length; index++) {
      const level = Math.abs(samples[index] ?? 0);
      peak = Math.max(peak, level);
      if (level >= 0.01) {
        first = Math.min(first, index);
        last = Math.max(last, index);
      }
    }
  }
  const paddingSamples = Math.round(buffer.sampleRate * 0.03);
  const startSample = last < 0 ? 0 : Math.max(0, first - paddingSamples);
  const endSample =
    last < 0
      ? buffer.length
      : Math.min(buffer.length, last + paddingSamples + 1);
  return {
    gain: peak === 0 ? 1 : Math.min(4, 0.8 / peak),
    offset: startSample / buffer.sampleRate,
    duration: Math.max(0, endSample - startSample) / buffer.sampleRate,
  };
}
