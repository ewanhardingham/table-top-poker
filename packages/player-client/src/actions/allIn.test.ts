import { describe, expect, it } from "vitest";
import { allInChoices, isAllInAction, pressAllIn } from "./allIn.js";

describe("allInChoices", () => {
  it("forks into a call and a raise when facing a bet", () => {
    expect(
      allInChoices(["fold", "call", "raise", "allInCall", "allInRaise"]),
    ).toEqual([
      { action: "allInCall", label: "All-in call" },
      { action: "allInRaise", label: "All-in raise" },
    ]);
  });

  it("offers one all-in when there is no bet to call", () => {
    expect(
      allInChoices(["fold", "check", "raise", "allInCall", "allInRaise"]),
    ).toEqual([{ action: "allInRaise", label: "All in" }]);
  });

  it("offers nothing when it is not the player's turn", () => {
    expect(allInChoices([])).toEqual([]);
  });

  it("drops a choice the engine has not made legal", () => {
    expect(allInChoices(["fold", "call", "raise", "allInRaise"])).toEqual([
      { action: "allInRaise", label: "All-in raise" },
    ]);
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
