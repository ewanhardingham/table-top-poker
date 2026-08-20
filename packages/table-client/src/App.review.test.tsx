import type { SeatView, TableView } from "@table-top-poker/protocol";
import React from "react";
/* eslint-disable @typescript-eslint/no-deprecated -- React 19's DOM-free component test renderer is deprecated but remains the available interaction harness here. */
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import type { HandPickerProps } from "./HandPicker.js";
import type { TableControlsProps } from "./TableControls.js";
import { useTableStore } from "./store/store.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const picker = vi.hoisted((): { props: HandPickerProps | null } => ({
  props: null,
}));
const socket = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("./ws/useWebSocket.js", () => ({ useWebSocket: () => socket }));

vi.mock("./HandPicker.js", () => ({
  HandPicker: (props: HandPickerProps) => {
    picker.props = props;
    return React.createElement("div", { "data-testid": "hand-picker" });
  },
}));

vi.mock("./TableControls.js", () => ({
  TableControls: (props: TableControlsProps) =>
    props.onReviewHands === undefined
      ? null
      : React.createElement("button", {
          "data-testid": "review-hands-button",
          onClick: props.onReviewHands,
        }),
}));

// A live hand puts a seat on the clock, which animates on a frame callback.
vi.stubGlobal("requestAnimationFrame", () => 0);
vi.stubGlobal("cancelAnimationFrame", () => undefined);

vi.stubGlobal("window", {
  localStorage: { getItem: () => null, setItem: () => undefined },
  setTimeout: (handler: () => void, ms: number) => setTimeout(handler, ms),
  clearTimeout: (id: number) => {
    clearTimeout(id);
  },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
});

function seat(id: number): SeatView {
  return {
    id,
    claimed: true,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  };
}

const completeHand: TableView = {
  phase: "folded-out",
  button: 0,
  smallBlind: 1,
  bigBlind: 2,
  dealtSeatCount: 2,
  winner: 0,
};

const liveHand: TableView = {
  phase: "betting",
  turnEndsAt: null,
  button: 0,
  smallBlind: 1,
  bigBlind: 2,
  dealtSeatCount: 2,
  street: "preflop",
  board: [],
  toAct: [1],
  seats: [
    { seatId: 0, folded: false },
    { seatId: 1, folded: false },
  ],
};

interface Node {
  readonly props: { readonly onClick?: () => void };
}

interface Renderer {
  readonly root: {
    findByProps(props: Record<string, unknown>): Node;
    findAllByProps(props: Record<string, unknown>): readonly Node[];
  };
  readonly unmount: () => void;
}

function inRoom(handView: TableView): void {
  useTableStore.setState({
    roomCode: "ABCD",
    joinUrl: "http://localhost:3000/join/ABCD",
    qrCodeDataUrl: "data:image/png;base64,xyz",
    seats: [seat(0), seat(1)],
    connectionStatus: "connected",
    handView,
  });
}

let mounted: Renderer | null = null;

function render(): Renderer {
  let renderer!: Renderer;
  act(() => {
    renderer = create(<App />);
  });
  mounted = renderer;
  return renderer;
}

function click(renderer: Renderer, testId: string): void {
  act(() => {
    renderer.root.findByProps({ "data-testid": testId }).props.onClick?.();
  });
}

describe("App hand review", () => {
  beforeEach(() => {
    useTableStore.setState(useTableStore.getInitialState());
    socket.send.mockReset();
    picker.props = null;
  });

  afterEach(() => {
    act(() => {
      mounted?.unmount();
    });
    mounted = null;
  });

  it("asks for the tapped hand over the room socket, then hands the felt to the scrub", () => {
    inRoom(completeHand);
    const renderer = render();

    click(renderer, "review-hands-button");
    act(() => {
      picker.props?.onSelectHand(3);
    });

    expect(socket.send).toHaveBeenCalledWith({
      type: "get-hand",
      handOrdinal: 3,
    });
    expect(useTableStore.getState().review).toEqual({
      status: "loading",
      handOrdinal: 3,
    });
    expect(() =>
      renderer.root.findByProps({ "data-testid": "hand-picker" }),
    ).toThrow();
  });

  it("returns to the picker from Back to hands", () => {
    inRoom(completeHand);
    const renderer = render();
    click(renderer, "review-hands-button");
    act(() => {
      picker.props?.onSelectHand(3);
    });

    click(renderer, "back-to-hands-button");

    expect(useTableStore.getState().review).toBeNull();
    expect(
      renderer.root.findByProps({ "data-testid": "hand-picker" }),
    ).toBeDefined();
  });

  it("force-dismisses an open review the moment a hand starts", () => {
    inRoom(completeHand);
    const renderer = render();
    click(renderer, "review-hands-button");
    act(() => {
      picker.props?.onSelectHand(3);
    });

    act(() => {
      useTableStore.setState({ handView: liveHand });
    });

    expect(useTableStore.getState().review).toBeNull();
    expect(() =>
      renderer.root.findByProps({ "data-testid": "hand-picker" }),
    ).toThrow();
  });

  it("gives the felt to the scrub, so the live board is not also on screen", () => {
    inRoom(completeHand);
    useTableStore.setState({
      review: {
        status: "ready",
        handOrdinal: 3,
        positions: [{ event: null, view: { phase: "no-hand", button: 0 } }],
      },
    });

    const renderer = render();

    const found = (testId: string) =>
      renderer.root.findAllByProps({ "data-testid": testId });
    expect(found("replay-stage")).toHaveLength(1);
    expect(found("replay-transport")).toHaveLength(1);
    expect(found("seats")).toHaveLength(1);
    expect(found("join-panel")).toHaveLength(0);
  });
});
