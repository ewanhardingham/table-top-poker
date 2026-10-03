import { describe, expect, it, vi } from "vitest";
import { openSeatSocket } from "./openSeatSocket.js";

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
  };
  openSeatSocket(socket as unknown as WebSocket, handlers);
  return { socket, handlers };
}

describe("openSeatSocket", () => {
  it("retries when the socket closes before it ever opened", () => {
    const { socket, handlers } = setup();

    socket.fire("close");

    expect(handlers.onStatus).toHaveBeenLastCalledWith("disconnected");
    expect(handlers.scheduleRetry).toHaveBeenCalledTimes(1);
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
    };
    openSeatSocket(socket as unknown as WebSocket, handlers);

    socket.fire("close");

    expect(handlers.scheduleRetry).not.toHaveBeenCalled();
  });
});
