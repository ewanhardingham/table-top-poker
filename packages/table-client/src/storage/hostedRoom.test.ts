import { describe, expect, it, vi } from "vitest";
import {
  clearHostedRoom,
  loadHostedRoom,
  saveHostedRoom,
} from "./hostedRoom.js";

function fakeStorage(setItem: (key: string, value: string) => void): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
      setItem(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: () => null,
    length: 0,
  };
}

const room = {
  code: "ABCD",
  joinUrl: "http://localhost:3000/join/ABCD",
  qrCodeDataUrl: "data:image/png;base64,xyz",
};

describe("saveHostedRoom", () => {
  it("stores the hosted room as JSON under a namespaced key", () => {
    const setItem = vi.fn();
    const storage = fakeStorage(setItem);

    saveHostedRoom(storage, room);

    expect(setItem).toHaveBeenCalledWith(
      "ttp:hosted-room",
      JSON.stringify(room),
    );
  });
});

describe("loadHostedRoom", () => {
  it("reads back a previously saved room", () => {
    const storage = fakeStorage(() => undefined);
    saveHostedRoom(storage, room);

    expect(loadHostedRoom(storage)).toEqual(room);
  });

  it("returns null when nothing is stored", () => {
    const storage = fakeStorage(() => undefined);
    expect(loadHostedRoom(storage)).toBeNull();
  });

  it("returns null for malformed JSON rather than throwing", () => {
    const storage = fakeStorage(() => undefined);
    storage.setItem("ttp:hosted-room", "not json");
    expect(loadHostedRoom(storage)).toBeNull();
  });

  it("returns null for well-formed JSON missing required fields", () => {
    const storage = fakeStorage(() => undefined);
    storage.setItem("ttp:hosted-room", JSON.stringify({ code: "ABCD" }));
    expect(loadHostedRoom(storage)).toBeNull();
  });
});

describe("clearHostedRoom", () => {
  it("removes the stored room", () => {
    const storage = fakeStorage(() => undefined);
    saveHostedRoom(storage, room);

    clearHostedRoom(storage);

    expect(loadHostedRoom(storage)).toBeNull();
  });
});
