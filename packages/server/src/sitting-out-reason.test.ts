import { DEFAULT_SEAT_COUNT } from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { type Room, RoomStore, toRoomView } from "./rooms.js";

function claimSeats(store: RoomStore, room: Room, count: number): void {
  for (let seatId = 0; seatId < count; seatId++) {
    expect(
      store.claimSeat(room.code, seatId, `P${String(seatId)}`),
    ).toHaveProperty("seat");
  }
}

function completeHand(store: RoomStore, room: Room): void {
  for (let attempt = 0; attempt < DEFAULT_SEAT_COUNT; attempt++) {
    if (room.engine?.hand?.status === "complete") return;
    const actor = store.currentActor(room.code);
    if (actor === undefined) throw new Error("expected a current actor");
    const result = store.dispatch(room.code, actor, "fold");
    if (!("steps" in result)) throw new Error("expected dispatch steps");
  }
  throw new Error("hand did not complete");
}

describe("sitting-out reason in the room view", () => {
  it("distinguishes voluntary sit-out from waiting for the next hand", () => {
    const store = new RoomStore();
    const room = store.create();
    claimSeats(store, room, 2);

    expect(toRoomView(room).seats[0]).toMatchObject({
      sittingOut: false,
      sittingOutReason: null,
    });

    store.setSittingOut(room.code, 0, true);
    expect(toRoomView(room).seats[0]).toMatchObject({
      sittingOut: true,
      sittingOutReason: "voluntary",
    });

    store.setSittingOut(room.code, 0, false);
    store.dispatch(room.code, "table", "startHand");
    const lateClaim = store.claimSeat(room.code, 2, "P2");
    expect(lateClaim).toHaveProperty("seat");
    expect(toRoomView(room).seats[2]).toMatchObject({
      sittingOut: true,
      sittingOutReason: "waiting-for-next-hand",
    });

    completeHand(store, room);
    const nextHand = store.dispatch(room.code, "table", "nextHand");
    expect(nextHand).toHaveProperty("steps");
    expect(toRoomView(room).seats[2]).toMatchObject({
      sittingOut: false,
      sittingOutReason: null,
    });
  });
});
