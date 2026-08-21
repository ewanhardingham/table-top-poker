import { describe, expect, it } from "vitest";
import {
  allInChoices,
  isAllInAction,
  otherSeatIsAllIn,
  pressAllIn,
} from "./allIn.js";

const facingBet = ["fold", "call", "raise", "allInCall", "allInRaise"] as const;
const noBet = ["fold", "check", "raise", "allInCall", "allInRaise"] as const;

describe("allInChoices", () => {
  it("offers one wide all-in while nobody has shoved", () => {
    expect(allInChoices([...facingBet], false)).toEqual([
      { action: "allInRaise", label: "All in" },
    ]);
    expect(allInChoices([...noBet], false)).toEqual([
      { action: "allInRaise", label: "All in" },
    ]);
  });

  it("splits into a call and a raise once another seat is all in", () => {
    expect(allInChoices([...facingBet], true)).toEqual([
      { action: "allInCall", label: "All-in call" },
      { action: "allInRaise", label: "All-in raise" },
    ]);
  });

  it("drops the call arm when the shove has already been retired, leaving nothing to match", () => {
    expect(allInChoices([...noBet], true)).toEqual([
      { action: "allInRaise", label: "All-in raise" },
    ]);
  });

  it("offers nothing when it is not the player's turn", () => {
    expect(allInChoices([], true)).toEqual([]);
  });

  it("drops a choice the engine has not made legal", () => {
    expect(allInChoices(["fold", "call", "raise", "allInRaise"], true)).toEqual(
      [{ action: "allInRaise", label: "All-in raise" }],
    );
  });
});

describe("otherSeatIsAllIn", () => {
  const live = { seatId: 0, folded: false, allIn: false };
  const shover = { seatId: 1, folded: false, allIn: true };
  const mucked = { seatId: 2, folded: true, allIn: false };
  const seats = [live, shover, mucked];

  it("sees another seat's shove", () => {
    expect(otherSeatIsAllIn(seats, 0)).toBe(true);
  });

  it("does not count the asking seat's own shove", () => {
    expect(otherSeatIsAllIn(seats, 1)).toBe(false);
  });

  it("is false when nobody is all in", () => {
    expect(otherSeatIsAllIn([live, mucked], 0)).toBe(false);
  });
});

describe("pressAllIn", () => {
  it("arms on the first press and sends nothing", () => {
    expect(pressAllIn(null, "allInCall")).toEqual({
      armed: "allInCall",
      send: null,
    });
  });

  it("sends on the second press of the armed choice", () => {
    expect(pressAllIn("allInCall", "allInCall")).toEqual({
      armed: null,
      send: "allInCall",
    });
  });

  it("moves the arming across when the other choice is pressed", () => {
    expect(pressAllIn("allInCall", "allInRaise")).toEqual({
      armed: "allInRaise",
      send: null,
    });
  });
});

describe("isAllInAction", () => {
  it("recognises the two declared all-ins", () => {
    expect(isAllInAction("allInCall")).toBe(true);
    expect(isAllInAction("allInRaise")).toBe(true);
  });

  it("rejects the ordinary actions and an unattributed rejection", () => {
    expect(isAllInAction("raise")).toBe(false);
    expect(isAllInAction(null)).toBe(false);
  });
});
