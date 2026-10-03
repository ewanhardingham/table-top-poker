import type { RoomView } from "@table-top-poker/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomRequestError } from "../api/rooms.js";
import {
  openSeatSocket,
  PROBE_TIMEOUT_MS,
  probeSeatGone,
} from "./openSeatSocket.js";

class FakeSocket {
  readonly listeners = new Map<string, () => void>();
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }
  fire(type: string): void {
    this.listeners.get(type)?.();
  }
}

function setup() {
  const socket = new FakeSocket();
  const handlers = {
    isActive: () => true,
    onStatus: vi.fn(),
    scheduleRetry: vi.fn(),
    onSeatGone: vi.fn(),
    probeSeatGone: vi.fn().mockResolvedValue(false),
  };
  openSeatSocket(socket as unknown as WebSocket, handlers);
  return { socket, handlers };
}

describe("openSeatSocket", () => {
  it("retries when the socket closes before it ever opened", async () => {
    const { socket, handlers } = setup();

    socket.fire("close");
    await vi.waitFor(() => {
      expect(handlers.scheduleRetry).toHaveBeenCalledTimes(1);
    });

    expect(handlers.onStatus).toHaveBeenLastCalledWith("disconnected");
    expect(handlers.onSeatGone).not.toHaveBeenCalled();
  });

  it("drops the seat when a close before open finds it gone", async () => {
    const { socket, handlers } = setup();
    handlers.probeSeatGone.mockResolvedValue(true);

    socket.fire("close");
    await vi.waitFor(() => {
      expect(handlers.onSeatGone).toHaveBeenCalledTimes(1);
    });

    expect(handlers.scheduleRetry).not.toHaveBeenCalled();
  });

  it("does not probe when an opened socket closes", () => {
    const { socket, handlers } = setup();

    socket.fire("open");
    socket.fire("close");

    expect(handlers.probeSeatGone).not.toHaveBeenCalled();
  });

  it("retries when an opened socket closes", () => {
    const { socket, handlers } = setup();

    socket.fire("open");
    socket.fire("close");

    expect(handlers.onStatus).toHaveBeenCalledWith("connected");
    expect(handlers.scheduleRetry).toHaveBeenCalledTimes(1);
  });

  it("does nothing once inactive", () => {
    const socket = new FakeSocket();
    const handlers = {
      isActive: () => false,
      onStatus: vi.fn(),
      scheduleRetry: vi.fn(),
      onSeatGone: vi.fn(),
      probeSeatGone: vi.fn().mockResolvedValue(true),
    };
    openSeatSocket(socket as unknown as WebSocket, handlers);

    socket.fire("close");

    expect(handlers.probeSeatGone).not.toHaveBeenCalled();
    expect(handlers.scheduleRetry).not.toHaveBeenCalled();
  });
});

function viewWithSeat(claimed: boolean) {
  return { seats: [{ id: 0, claimed }] } as unknown as RoomView;
}

describe("probeSeatGone", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is gone when the room is 404", async () => {
    const join = vi.fn().mockRejectedValue(new RoomRequestError(404));
    await expect(probeSeatGone(join, "ABCD")).resolves.toBe(true);
  });

  it("is present when the seat reads unclaimed after a repack", async () => {
    const join = vi.fn().mockResolvedValue(viewWithSeat(false));
    await expect(probeSeatGone(join, "ABCD")).resolves.toBe(false);
  });

  it("is present when the room answers", async () => {
    const join = vi.fn().mockResolvedValue(viewWithSeat(true));
    await expect(probeSeatGone(join, "ABCD")).resolves.toBe(false);
  });

  it("is present when the network is down", async () => {
    const join = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(probeSeatGone(join, "ABCD")).resolves.toBe(false);
  });

  it("is present on a server error", async () => {
    const join = vi.fn().mockRejectedValue(new RoomRequestError(502));
    await expect(probeSeatGone(join, "ABCD")).resolves.toBe(false);
  });

  it("is present when the probe hangs past the timeout", async () => {
    vi.useFakeTimers();
    const join = vi.fn().mockReturnValue(new Promise(() => undefined));

    const result = probeSeatGone(join, "ABCD");
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);

    await expect(result).resolves.toBe(false);
  });
});
