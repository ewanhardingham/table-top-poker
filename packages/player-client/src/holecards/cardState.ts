import type { Classification } from "./classify.js";

export type Presentation =
  "Absent" | "FaceDown" | "Peeking" | "Turning" | "Revealed" | "Leaving";

export type Recognizer =
  "Idle" | "Pressing" | "Bending" | "FoldDragging" | "Ignored" | "Committed";

export interface CardState {
  readonly presentation: Presentation;
  readonly recognizer: Recognizer;
  readonly armed: boolean;
  readonly locked: boolean;
}

export type CardEvent =
  | { readonly type: "DEALT" }
  | { readonly type: "CARDS_GONE" }
  | { readonly type: "ACTIVATED" }
  | { readonly type: "TURN_FINISHED" }
  | { readonly type: "PRESSED" }
  | { readonly type: "CLASSIFIED"; readonly as: Classification }
  | { readonly type: "BEND_CROSSED" }
  | { readonly type: "FOLD_ARMED" }
  | { readonly type: "FOLD_DISARMED" }
  | { readonly type: "RELEASED" }
  | { readonly type: "CANCELLED" }
  | { readonly type: "RESET" }
  | { readonly type: "TAPPED" }
  | { readonly type: "DOUBLE_TAPPED" }
  | { readonly type: "PENDING_RESOLVED"; readonly hasCards: boolean }
  | { readonly type: "SHOWDOWN_REVEAL" };

function idle(presentation: Presentation): CardState {
  return { presentation, recognizer: "Idle", armed: false, locked: false };
}

function survivesLock(event: CardEvent): boolean {
  switch (event.type) {
    case "DEALT":
    case "CARDS_GONE":
    case "SHOWDOWN_REVEAL":
    case "TURN_FINISHED":
      return true;
    default:
      return false;
  }
}

export function initialCardState({
  hasCards,
  locked,
}: {
  readonly hasCards: boolean;
  readonly locked: boolean;
}): CardState {
  if (!hasCards) return idle("Absent");
  if (locked) return { ...idle("Revealed"), locked: true };
  return idle("FaceDown");
}

function settled(state: CardState): CardState {
  return {
    ...state,
    presentation:
      state.presentation === "Peeking" ? "FaceDown" : state.presentation,
    recognizer: "Idle",
    armed: false,
  };
}

export function releaseCommitsFold(state: CardState): boolean {
  return state.recognizer === "FoldDragging" && state.armed;
}

function classified(state: CardState, as: Classification): CardState {
  switch (as) {
    case "Bending":
      return {
        ...state,
        presentation: "Peeking",
        recognizer: "Bending",
        armed: false,
      };
    case "FoldDragging":
      return { ...state, recognizer: "FoldDragging", armed: false };
    case "Ignored":
      return { ...state, recognizer: "Ignored", armed: false };
  }
}

export function reduce(state: CardState, event: CardEvent): CardState {
  if (state.locked && !survivesLock(event)) return state;

  switch (event.type) {
    case "DEALT":
      return idle("FaceDown");

    case "CARDS_GONE":
      return idle("Absent");

    case "ACTIVATED":
      if (state.presentation === "FaceDown") {
        return { ...state, presentation: "Turning" };
      }
      if (state.presentation === "Revealed") {
        return { ...state, presentation: "FaceDown" };
      }
      return state;

    case "TURN_FINISHED":
      return state.presentation === "Turning"
        ? { ...state, presentation: "Revealed" }
        : state;

    case "PRESSED":
      if (state.recognizer !== "Idle") return state;
      if (state.presentation === "Absent" || state.presentation === "Leaving") {
        return state;
      }
      return { ...state, recognizer: "Pressing" };

    case "CLASSIFIED":
      if (state.recognizer !== "Pressing") return state;
      return classified(state, event.as);

    case "RELEASED":
      if (releaseCommitsFold(state)) {
        return idle("Leaving");
      }
    // falls through: every other release settles exactly as a cancellation does
    case "CANCELLED":
      if (state.recognizer === "Idle") return state;
      if (state.recognizer === "Committed") {
        return { ...state, recognizer: "Idle", armed: false };
      }
      return settled(state);

    case "BEND_CROSSED":
      if (state.recognizer !== "Bending") return state;
      return { ...state, presentation: "Turning", recognizer: "Committed" };

    case "RESET":
      if (state.presentation === "Absent") return state;
      return idle("FaceDown");

    case "TAPPED":
      return state.presentation === "Revealed"
        ? { ...state, presentation: "FaceDown" }
        : state;

    case "DOUBLE_TAPPED":
      return state;

    case "FOLD_ARMED":
    case "FOLD_DISARMED":
      if (state.recognizer !== "FoldDragging") return state;
      return { ...state, armed: event.type === "FOLD_ARMED" };

    case "PENDING_RESOLVED":
      if (state.presentation !== "Leaving") return state;
      return idle(event.hasCards ? "FaceDown" : "Absent");

    case "SHOWDOWN_REVEAL":
      if (state.presentation === "Absent" || state.presentation === "Leaving") {
        return state;
      }
      return {
        presentation:
          state.presentation === "Revealed" ? "Revealed" : "Turning",
        recognizer: "Idle",
        armed: false,
        locked: true,
      };
  }
}
