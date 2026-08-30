import { describe, expect, it } from "vitest";
import {
  clearTurnSoundChoice,
  loadTurnSoundChoice,
  saveRecordedTurnSound,
  saveTurnSoundChoice,
} from "./storage.js";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("turn sound storage", () => {
  it("keeps skip and permission choices separate by room", async () => {
    const storage = new MemoryStorage();
    saveTurnSoundChoice(storage, "ABCD", { type: "skipped" });
    saveTurnSoundChoice(storage, "WXYZ", { type: "permission-denied" });
    const decode = () => Promise.resolve({} as AudioBuffer);

    await expect(loadTurnSoundChoice(storage, "ABCD", decode)).resolves.toEqual(
      { type: "skipped" },
    );
    await expect(loadTurnSoundChoice(storage, "WXYZ", decode)).resolves.toEqual(
      { type: "permission-denied" },
    );
    await expect(
      loadTurnSoundChoice(storage, "NONE", decode),
    ).resolves.toBeNull();
  });

  it("restores encoded audio with its gain and trim values", async () => {
    const storage = new MemoryStorage();
    const decoded = { duration: 1 } as AudioBuffer;
    await saveRecordedTurnSound(
      storage,
      "ABCD",
      { audio: new Blob([new Uint8Array([1, 2, 3])]), buffer: decoded },
      { gain: 2, offset: 0.1, duration: 0.7 },
    );

    const choice = await loadTurnSoundChoice(storage, "ABCD", (bytes) => {
      expect([...new Uint8Array(bytes)]).toEqual([1, 2, 3]);
      return Promise.resolve(decoded);
    });
    expect(choice).toEqual({
      type: "recorded",
      playback: { buffer: decoded, gain: 2, offset: 0.1, duration: 0.7 },
    });
  });

  it("discards a stored recording that can no longer be decoded", async () => {
    const storage = new MemoryStorage();
    await saveRecordedTurnSound(
      storage,
      "ABCD",
      {
        audio: new Blob([new Uint8Array([1, 2, 3])]),
        buffer: {} as AudioBuffer,
      },
      { gain: 2, offset: 0.1, duration: 0.7 },
    );

    await expect(
      loadTurnSoundChoice(storage, "ABCD", () =>
        Promise.reject(new DOMException("unsupported codec")),
      ),
    ).resolves.toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it("clears only the room whose claim ended", async () => {
    const storage = new MemoryStorage();
    saveTurnSoundChoice(storage, "ABCD", { type: "skipped" });
    saveTurnSoundChoice(storage, "WXYZ", { type: "skipped" });
    clearTurnSoundChoice(storage, "ABCD");

    await expect(
      loadTurnSoundChoice(storage, "ABCD", () =>
        Promise.resolve({} as AudioBuffer),
      ),
    ).resolves.toBeNull();
    await expect(
      loadTurnSoundChoice(storage, "WXYZ", () =>
        Promise.resolve({} as AudioBuffer),
      ),
    ).resolves.toEqual({ type: "skipped" });
  });
});
