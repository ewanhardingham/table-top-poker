export interface CancellableEvent {
  readonly touches?: { readonly length: number };
  preventDefault(): void;
}

export type Listener = (event: CancellableEvent) => void;

interface ListenerTarget {
  addEventListener(
    type: string,
    listener: Listener,
    options?: { passive?: boolean },
  ): void;
  removeEventListener(type: string, listener: Listener): void;
}

const GESTURE_EVENTS = ["gesturestart", "gesturechange", "gestureend"] as const;

export function lockViewport(target: ListenerTarget): () => void {
  const cancel: Listener = (event) => {
    event.preventDefault();
  };

  const cancelMultiTouch: Listener = (event) => {
    if (event.touches !== undefined && event.touches.length > 1) {
      event.preventDefault();
    }
  };

  for (const name of GESTURE_EVENTS) {
    target.addEventListener(name, cancel, { passive: false });
  }
  target.addEventListener("touchmove", cancelMultiTouch, { passive: false });

  return () => {
    for (const name of GESTURE_EVENTS) {
      target.removeEventListener(name, cancel);
    }
    target.removeEventListener("touchmove", cancelMultiTouch);
  };
}
