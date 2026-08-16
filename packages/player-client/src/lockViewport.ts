/*
 * iOS Safari lets the user pinch-zoom and pan the visual viewport even when the
 * page says not to. `user-scalable=no` in the viewport meta has been ignored
 * since iOS 10, and `touch-action: manipulation` only kills double-tap zoom —
 * pinch is handled above the touch-action layer. That is why Android's player
 * interface stays locked while an iPhone drifts: everything we already do is
 * enough for Chrome and not for WebKit.
 *
 * What does still work on WebKit is cancelling the gesture events it fires for
 * a pinch (`gesturestart`/`gesturechange`/`gestureend`, non-standard and
 * WebKit-only) and cancelling any multi-touch `touchmove` before it becomes a
 * zoom or a viewport pan. Both need non-passive listeners or the
 * `preventDefault` is dropped.
 *
 * Single-touch moves are left alone: the hole-card peel is a one-finger drag
 * and does its own `preventDefault` where it wants one.
 */

/*
 * Narrowed to what we actually use rather than derived from `EventTarget`:
 * `gesturestart` and friends are not in lib.dom's event map, and the real
 * signature's nullable `EventListenerOrEventListenerObject` would force a fake
 * target in tests to accept shapes we never pass.
 */
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

/**
 * Suppresses pinch-zoom on the given target. Returns a teardown that removes
 * every listener it added.
 */
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
