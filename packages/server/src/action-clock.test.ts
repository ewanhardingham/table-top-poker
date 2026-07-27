import { describe, expect, it, vi } from "vitest";
import { ActionClock } from "./action-clock.js";

describe("ActionClock", () => {
  it("fires the timeout callback after the configured duration", () => {
    const setTimeoutFn = vi.fn(setTimeout);
    const clearTimeoutFn = vi.fn(clearTimeout);
    const clock = new ActionClock(90_000, setTimeoutFn, clearTimeoutFn);
    const onTimeout = vi.fn();

    clock.schedule("ROOM", onTimeout);

    expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 90_000);
  });

  it("clears a room's prior timer when scheduling a new one", () => {
    const handles: unknown[] = [];
    const setTimeoutFn = vi.fn((fn: () => void, ms: number) => {
      const handle = setTimeout(fn, ms);
      handles.push(handle);
      return handle;
    });
    const clearTimeoutFn = vi.fn(clearTimeout);
    const clock = new ActionClock(90_000, setTimeoutFn, clearTimeoutFn);

    clock.schedule("ROOM", vi.fn());
    clock.schedule("ROOM", vi.fn());

    expect(clearTimeoutFn).toHaveBeenCalledWith(handles[0]);
    expect(clearTimeoutFn).not.toHaveBeenCalledWith(handles[1]);
  });

  it("keeps separate rooms' timers independent", () => {
    const setTimeoutFn = vi.fn(setTimeout);
    const clearTimeoutFn = vi.fn(clearTimeout);
    const clock = new ActionClock(90_000, setTimeoutFn, clearTimeoutFn);

    clock.schedule("ROOM-A", vi.fn());
    clock.schedule("ROOM-B", vi.fn());

    expect(clearTimeoutFn).not.toHaveBeenCalled();
  });

  it("clear() cancels a scheduled timer", () => {
    const handles: unknown[] = [];
    const setTimeoutFn = vi.fn((fn: () => void, ms: number) => {
      const handle = setTimeout(fn, ms);
      handles.push(handle);
      return handle;
    });
    const clearTimeoutFn = vi.fn(clearTimeout);
    const clock = new ActionClock(90_000, setTimeoutFn, clearTimeoutFn);

    clock.schedule("ROOM", vi.fn());
    clock.clear("ROOM");

    expect(clearTimeoutFn).toHaveBeenCalledWith(handles[0]);
  });

  it("clear() on a room with no timer is a no-op", () => {
    const clearTimeoutFn = vi.fn(clearTimeout);
    const clock = new ActionClock(90_000, setTimeout, clearTimeoutFn);

    expect(() => {
      clock.clear("ROOM");
    }).not.toThrow();
    expect(clearTimeoutFn).not.toHaveBeenCalled();
  });

  it("actually invokes the callback once real time elapses", async () => {
    const clock = new ActionClock(10);
    const onTimeout = vi.fn();

    clock.schedule("ROOM", onTimeout);
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("a cleared timer never fires", async () => {
    const clock = new ActionClock(10);
    const onTimeout = vi.fn();

    clock.schedule("ROOM", onTimeout);
    clock.clear("ROOM");
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(onTimeout).not.toHaveBeenCalled();
  });
});
