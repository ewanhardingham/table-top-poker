import type { SeatView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import type { TableControlsProps } from "./TableControls.js";
import type { TableStore } from "./store/store.js";

const addBotsMock = vi.hoisted(() => vi.fn());
const store = vi.hoisted((): { overrides: Partial<TableStore> } => ({
  overrides: {},
}));
const addBotClick = vi.hoisted((): { current: (() => void) | undefined } => ({
  current: undefined,
}));

vi.mock("./api/rooms.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/rooms.js")>();
  return { ...actual, addBots: addBotsMock };
});

vi.mock("./store/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./store/store.js")>();
  const initial = actual.useTableStore.getInitialState();
  const useTableStore = (selector: (state: TableStore) => unknown) =>
    selector({ ...initial, ...store.overrides });
  return {
    ...actual,
    useTableStore: Object.assign(useTableStore, actual.useTableStore),
  };
});

vi.mock("./TableControls.js", () => ({
  TableControls: (props: TableControlsProps) => {
    addBotClick.current =
      props.testMode === true && props.onAddBot !== undefined
        ? props.onAddBot
        : undefined;
    return props.testMode === true && props.onAddBot !== undefined
      ? React.createElement(
          "button",
          { "data-testid": "add-bot-button", onClick: props.onAddBot },
          "Add bot",
        )
      : null;
  },
}));

function seat(id: number): SeatView {
  return {
    id,
    claimed: true,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  };
}

function enterRoom(testMode: boolean): void {
  store.overrides = {
    roomCode: "ABCD",
    joinUrl: "http://localhost:3000/join/ABCD",
    qrCodeDataUrl: "data:image/png;base64,xyz",
    seats: [seat(0), seat(1)],
    connectionStatus: "connected",
    handView: null,
    testMode,
  };
}

describe("App Add bot interaction", () => {
  beforeEach(() => {
    addBotsMock.mockReset();
    addBotsMock.mockResolvedValue({ joined: 1 });
    addBotClick.current = undefined;
  });

  it("clicks Add bot to call the endpoint, with no callable control when off", async () => {
    enterRoom(true);
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="add-bot-button"');

    const clickAddBot = addBotClick.current;
    if (clickAddBot === undefined) throw new Error("expected Add bot control");
    clickAddBot();
    await Promise.resolve();
    expect(addBotsMock).toHaveBeenCalledWith("ABCD", 1);

    enterRoom(false);
    const offHtml = renderToStaticMarkup(<App />);
    expect(offHtml).not.toContain('data-testid="add-bot-button"');
    expect(addBotClick.current).toBeUndefined();
  });
});
