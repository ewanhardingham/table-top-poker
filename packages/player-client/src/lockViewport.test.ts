import { describe, expect, it, vi } from "vitest";
import type { Listener } from "./lockViewport.js";
import { lockViewport } from "./lockViewport.js";

function fakeTarget() {
  const listeners = new Map<string, { handler: Listener; options?: unknown }>();
  return {
    addEventListener(
      name: string,
      handler: Listener,
      options?: { passive?: boolean },
    ) {
      listeners.set(name, { handler, options });
    },
    removeEventListener(name: string) {
      listeners.delete(name);
    },
    bound: () => [...listeners.keys()].sort(),
    optionsFor: (name: string) => listeners.get(name)?.options,
    fire(name: string, touches?: { length: number }) {
      const preventDefault = vi.fn();
      listeners
        .get(name)
        ?.handler(
          touches === undefined
            ? { preventDefault }
            : { touches, preventDefault },
        );
      return preventDefault;
    },
  };
}

describe("lockViewport", () => {
  it("cancels the WebKit pinch gestures that ignore the viewport meta", () => {
    const target = fakeTarget();
    lockViewport(target);

    for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
      expect(target.fire(name)).toHaveBeenCalled();
    }
  });

  it("cancels a two-finger drag but leaves the one-finger card peel alone", () => {
    const target = fakeTarget();
    lockViewport(target);

    expect(target.fire("touchmove", { length: 2 })).toHaveBeenCalled();
    expect(target.fire("touchmove", { length: 1 })).not.toHaveBeenCalled();
  });

  it("binds non-passively, or the browser drops every preventDefault", () => {
    const target = fakeTarget();
    lockViewport(target);

    for (const name of target.bound()) {
      expect(target.optionsFor(name)).toEqual({ passive: false });
    }
  });

  it("unbinds everything it bound", () => {
    const target = fakeTarget();
    const release = lockViewport(target);
    expect(target.bound()).toHaveLength(4);

    release();
    expect(target.bound()).toHaveLength(0);
  });
});
