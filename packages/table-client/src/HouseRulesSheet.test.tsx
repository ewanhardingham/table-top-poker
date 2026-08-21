import {
  DEFAULT_SHOT_CLOCK,
  DEFAULT_SHOWDOWN_OVERLAY,
  DEFAULT_SOUND_SETTINGS,
  type SeatView,
} from "@table-top-poker/protocol";
/* eslint-disable @typescript-eslint/no-deprecated -- React 19's DOM-free component test renderer is deprecated but remains the available interaction harness here. */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import {
  HouseRulesSheet,
  type ShotClockSecondsDraft,
  updateShotClockSecondsDraft,
} from "./HouseRulesSheet.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const seats: SeatView[] = [
  {
    id: 0,
    claimed: true,
    displayName: "Avery",
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
  {
    id: 1,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
  {
    id: 2,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
  {
    id: 3,
    claimed: true,
    displayName: "Blair",
    sittingOut: true,
    sittingOutReason: "voluntary",
    disconnected: false,
  },
  {
    id: 4,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
  {
    id: 5,
    claimed: true,
    displayName: "Casey",
    sittingOut: false,
    sittingOutReason: null,
    disconnected: true,
  },
  {
    id: 6,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
  {
    id: 7,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
];

const noop = () => undefined;

const shotClockProps = {
  pendingShotClock: null,
  shotClockSettings: DEFAULT_SHOT_CLOCK,
  onApplyShotClock: noop,
};

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof HouseRulesSheet>> = {},
): React.ReactElement {
  return (
    <HouseRulesSheet
      seatCount={4}
      pendingSeatCount={null}
      {...shotClockProps}
      seats={seats.slice(0, 4)}
      handInProgress
      soundSettings={DEFAULT_SOUND_SETTINGS}
      showdownOverlay={DEFAULT_SHOWDOWN_OVERLAY}
      onApply={noop}
      onChangeSoundSettings={noop}
      onChangeShowdownOverlay={noop}
      onClose={noop}
      {...overrides}
    />
  );
}

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

interface InteractiveTestNode {
  readonly props: {
    readonly disabled?: boolean;
    readonly value?: string;
    readonly onClick?: () => void;
    readonly onChange?: (event: {
      readonly currentTarget: { readonly value: string };
    }) => void;
  };
}

interface TestRenderer {
  readonly root: {
    findByProps(props: Record<string, unknown>): InteractiveTestNode;
  };
  readonly unmount: () => void;
}

function findNode(renderer: TestRenderer, testId: string): InteractiveTestNode {
  return renderer.root.findByProps({ "data-testid": testId });
}

async function settleReactUpdates(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("HouseRulesSheet", () => {
  it("offers the showdown overlay as a house rule, off by default", () => {
    const html = renderToStaticMarkup(renderSheet());

    expect(html).toContain('data-testid="showdown-settings"');
    expect(html).toMatch(
      /aria-checked="false"[^>]*data-testid="showdown-overlay-toggle"/,
    );
  });

  it("reports a showdown overlay change straight away", () => {
    const onChangeShowdownOverlay = vi.fn();
    let renderer!: TestRenderer;
    act(() => {
      renderer = create(renderSheet({ onChangeShowdownOverlay }));
    });

    act(() => {
      findNode(renderer, "showdown-overlay-toggle").props.onClick?.();
    });

    expect(onChangeShowdownOverlay).toHaveBeenCalledWith({ enabled: true });
  });

  it("shows the chosen house-rules surface and a repack preview", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={8}
        pendingSeatCount={4}
        {...shotClockProps}
        seats={seats}
        handInProgress
        soundSettings={DEFAULT_SOUND_SETTINGS}
        showdownOverlay={DEFAULT_SHOWDOWN_OVERLAY}
        onApply={noop}
        onChangeSoundSettings={noop}
        onChangeShowdownOverlay={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('data-testid="house-rules-sheet"');
    expect(html).toContain("House rules");
    expect(html).toContain("Blair → Seat 2");
    expect(html).toContain("Casey → Seat 3");
    expect(html).toContain("Applies from the next hand");
  });

  it("disables decrement at the no-eviction floor", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={8}
        pendingSeatCount={3}
        {...shotClockProps}
        seats={seats}
        handInProgress
        soundSettings={DEFAULT_SOUND_SETTINGS}
        showdownOverlay={DEFAULT_SHOWDOWN_OVERLAY}
        onApply={noop}
        onChangeSoundSettings={noop}
        onChangeShowdownOverlay={noop}
        onClose={noop}
      />,
    );

    expect(html).toMatch(/data-testid="seat-count-decrement"[^>]*disabled=""/);
    expect(html).toContain("Between 3 and 8 seats.");
    expect(html).toContain("3 seated");
    expect(html).not.toContain("no one is evicted here");
    expect(html).not.toContain("Everyone keeps the seat they are in.");
  });

  it("labels a growth as immediate", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={4}
        pendingSeatCount={null}
        {...shotClockProps}
        seats={seats.slice(0, 4)}
        handInProgress
        soundSettings={DEFAULT_SOUND_SETTINGS}
        showdownOverlay={DEFAULT_SHOWDOWN_OVERLAY}
        onApply={noop}
        onChangeSoundSettings={noop}
        onChangeShowdownOverlay={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain("Applies immediately");
  });

  it("renders the sound toggles reflecting the room settings", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={4}
        pendingSeatCount={null}
        {...shotClockProps}
        seats={seats.slice(0, 4)}
        handInProgress
        soundSettings={{
          sounds: true,
          cards: false,
          actions: true,
          notifications: true,
        }}
        showdownOverlay={DEFAULT_SHOWDOWN_OVERLAY}
        onApply={noop}
        onChangeSoundSettings={noop}
        onChangeShowdownOverlay={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('data-testid="sound-master-toggle"');
    expect(html).toContain(
      'aria-checked="false" aria-label="Cards" data-testid="sound-cards-toggle" style=',
    );
    expect(html).toContain(
      'aria-checked="true" aria-label="Actions" data-testid="sound-actions-toggle" style=',
    );
    expect(html).toContain(
      'aria-checked="true" aria-label="Notifications" data-testid="sound-notifications-toggle" style=',
    );
  });

  it("disables the category toggles when the master is off", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={4}
        pendingSeatCount={null}
        {...shotClockProps}
        seats={seats.slice(0, 4)}
        handInProgress
        soundSettings={{
          sounds: false,
          cards: true,
          actions: true,
          notifications: true,
        }}
        showdownOverlay={DEFAULT_SHOWDOWN_OVERLAY}
        onApply={noop}
        onChangeSoundSettings={noop}
        onChangeShowdownOverlay={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('data-testid="sound-cards-toggle" disabled=""');
    expect(html).toContain('data-testid="sound-actions-toggle" disabled=""');
    expect(html).toContain(
      'data-testid="sound-notifications-toggle" disabled=""',
    );
  });

  it("renders the deferred shot-clock controls", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={4}
        pendingSeatCount={null}
        pendingShotClock={{ enabled: true, seconds: 30 }}
        shotClockSettings={DEFAULT_SHOT_CLOCK}
        seats={seats.slice(0, 4)}
        handInProgress
        soundSettings={DEFAULT_SOUND_SETTINGS}
        showdownOverlay={DEFAULT_SHOWDOWN_OVERLAY}
        onApply={noop}
        onApplyShotClock={noop}
        onChangeSoundSettings={noop}
        onChangeShowdownOverlay={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('data-testid="shot-clock-settings"');
    expect(html).toContain('data-testid="shot-clock-toggle"');
    expect(html).toContain('data-testid="shot-clock-seconds"');
    expect(html).toContain("Applies from the next hand");
  });

  it("accepts a valid seconds value typed one digit at a time", () => {
    let draft: ShotClockSecondsDraft = {
      input: "90",
      seconds: 90,
      valid: true,
    };

    draft = updateShotClockSecondsDraft(draft, "4");
    expect(draft).toEqual({ input: "4", seconds: 90, valid: false });
    draft = updateShotClockSecondsDraft(draft, "45");

    expect(draft).toEqual({ input: "45", seconds: 45, valid: true });
  });

  it("waits for both settings writes before closing", async () => {
    const seatWrite = deferred();
    const shotClockWrite = deferred();
    const onApply = vi.fn(() => seatWrite.promise);
    const onApplyShotClock = vi.fn(() => shotClockWrite.promise);
    const onClose = vi.fn();
    let renderer!: TestRenderer;

    act(() => {
      renderer = create(renderSheet({ onApply, onApplyShotClock, onClose }));
    });

    act(() => {
      findNode(renderer, "shot-clock-toggle").props.onClick?.();
    });

    const done = () => findNode(renderer, "settings-done");
    await act(async () => {
      done().props.onClick?.();
      await settleReactUpdates();
    });

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApplyShotClock).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(done().props.disabled).toBe(true);

    await act(async () => {
      seatWrite.resolve();
      await settleReactUpdates();
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      shotClockWrite.resolve();
      await settleReactUpdates();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      renderer.unmount();
    });
  });

  it("blocks submission while seconds is visibly invalid", async () => {
    const onApply = vi.fn(() => Promise.resolve());
    const onApplyShotClock = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    let renderer!: TestRenderer;

    act(() => {
      renderer = create(renderSheet({ onApply, onApplyShotClock, onClose }));
    });

    const input = () => findNode(renderer, "shot-clock-seconds");
    act(() => {
      input().props.onChange?.({ currentTarget: { value: "4" } });
    });

    expect(input().props.value).toBe("4");
    expect(findNode(renderer, "shot-clock-validation")).toBeDefined();
    expect(findNode(renderer, "settings-done").props.disabled).toBe(true);

    await act(async () => {
      findNode(renderer, "settings-done").props.onClick?.();
      await settleReactUpdates();
    });
    expect(onApply).not.toHaveBeenCalled();
    expect(onApplyShotClock).not.toHaveBeenCalled();

    act(() => {
      input().props.onChange?.({ currentTarget: { value: "45" } });
    });
    expect(input().props.value).toBe("45");
    expect(findNode(renderer, "settings-done").props.disabled).toBe(false);

    await act(async () => {
      findNode(renderer, "settings-done").props.onClick?.();
      await settleReactUpdates();
    });
    expect(onApplyShotClock).toHaveBeenCalledWith({
      enabled: false,
      seconds: 45,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      renderer.unmount();
    });
  });
});
