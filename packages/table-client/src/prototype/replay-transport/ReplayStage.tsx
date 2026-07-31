/**
 * PROTOTYPE — throwaway, wayfinder ticket #82.
 *
 * The stage is deliberately **shared by every variant**: the same felt, the
 * same live `Seats` and `Board` components, projected at a past position via
 * the real `view(state, "table")`. Only the transport chrome differs between
 * variants, so the comparison isolates the one thing under test.
 *
 * Reusing the live board rendering is itself one of the ticket's questions —
 * this answers it by construction rather than by argument, and whatever
 * breaks is a finding.
 */
import type { ActionType, SeatId, SeatView } from "@table-top-poker/protocol";
import { view } from "@table-top-poker/protocol";
import { color, font, fontSize } from "@table-top-poker/ui-shared";
import { Board } from "../../Board.js";
import { Seats } from "../../Seats.js";
import { posFor } from "../../table/posFor.js";
import { fixtureHand, fixtureSeatIds, stateAt } from "./hand.js";

const seats: readonly SeatView[] = fixtureSeatIds.map((id) => ({
  id,
  claimed: true,
  sittingOut: false,
  disconnected: false,
}));

export interface ReplayStageProps {
  readonly position: number;
  /** Caption for the beat just landed on, or null at position 0. */
  readonly caption: string | null;
  /**
   * Height in `em` of the transport chrome the variant draws along the
   * bottom. The stage reserves this band — plus a strip for the caption —
   * and lays the whole table out in what is left, so the bottom seat row
   * rides up above the controls instead of sitting behind them.
   */
  readonly transportHeight?: number;
}

/** Vertical strip the beat caption gets, directly above the transport. */
const CAPTION_BAND = 2.4;

/**
 * Matching reserve at the top, in `em`. A seat pod is anchored by its avatar
 * and grows *around* that anchor, so a top-row pod carrying two hole cards and
 * a showdown description is tall enough to clip through the felt's top edge —
 * `posFor` puts the anchor at 10% and the column reaches further up than that.
 * This also keeps the pods clear of the header.
 */
const TOP_BAND = 4.5;

/**
 * Each seat's action **on the current street**, folded from the events up to
 * `position`. Cleared at every `StreetStarted`, because "Seat 4 called" means
 * nothing once the turn is out — the street is the unit an action belongs to.
 *
 * The live `TableView` cannot answer this: `TableViewBetting.seats` carries
 * only `folded`, so the actions are read back off the event log. That is a
 * finding for the wire contract, not a rendering detail.
 */
function actionsAt(position: number): ReadonlyMap<SeatId, ActionType> {
  const actions = new Map<SeatId, ActionType>();
  for (const event of fixtureHand.events.slice(0, position)) {
    if (event.type === "StreetStarted") actions.clear();
    if (event.type === "ActionTaken") actions.set(event.seatId, event.action);
  }
  return actions;
}

const ACTION_LABEL: Record<ActionType, string> = {
  fold: "Folded",
  check: "Checked",
  call: "Called",
  raise: "Raised",
};

interface ActionTone {
  readonly bg: string;
  readonly fg: string;
  readonly bd: string;
  readonly glow?: string;
}

/**
 * Every fill is translucent, so the labels sit *on* the felt the way the rest
 * of the chrome does rather than punching opaque holes in it. The hierarchy is
 * carried by which fill an action gets, not by fading the quiet ones out.
 *
 * The split is money: the seats that put chips in (call, raise) get a coloured
 * fill, check stays dark with a bright edge, and fold recedes furthest.
 *
 * Call is the one **cool** fill on an entirely warm felt, which is what makes
 * it separable from raise at a glance — a warm call sat too close to the
 * orange, and a cream one competed with the card faces.
 *
 * **Raise is orange, not red.** The accent red belongs to "To act" — the live
 * pill and the seat-pod glow both use it — so a red raise label would read as
 * a seat being on the clock. Orange keeps raise as the loudest thing on the
 * felt without borrowing that meaning.
 */
function actionTone(action: ActionType): ActionTone {
  switch (action) {
    case "raise":
      return {
        bg: "rgba(240,124,32,.82)",
        fg: "#fff",
        bd: "rgba(255,170,90,.9)",
        glow: "0 0 18px -2px rgba(240,124,32,.55)",
      };
    case "call":
      return {
        bg: "rgba(74,132,160,.8)",
        fg: "#fff",
        bd: "rgba(146,198,222,.75)",
      };
    case "check":
      return {
        bg: "rgba(6,9,8,.62)",
        fg: color.text,
        bd: "rgba(255,255,255,.4)",
      };
    case "fold":
      return { bg: "rgba(6,9,8,.6)", fg: color.textFaint, bd: color.border };
  }
}

/**
 * Action labels pinned to the seat pods, in the same slot the live "To act"
 * pill uses — the seat that is *about to* act already says so, and this makes
 * the seats that have *already* acted say what they did. Rendered as an
 * overlay positioned by the same `posFor` the pods use rather than by
 * changing `Seats`, so the live component stays untouched while the idea is
 * being judged.
 */
function ActionLabels({ position }: { readonly position: number }) {
  const actions = actionsAt(position);
  const tableView = view(stateAt(fixtureHand, position), "table");
  const actor = tableView.phase === "betting" ? tableView.toAct[0] : undefined;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {[...actions].map(([seatId, action]) => {
        // The current actor gets "To act" from `Seats`; two pills in one slot
        // would collide, and what they are about to do beats what they did.
        if (seatId === actor) return null;
        const pos = posFor(seatId, fixtureSeatIds.length);
        const tone = actionTone(action);
        return (
          <span
            key={seatId}
            style={{
              position: "absolute",
              left: `${String(pos.left)}%`,
              top: `${String(pos.top)}%`,
              transform: "translate(-50%, calc(-50% + 3.2em))",
              padding: "0.4em 1em",
              borderRadius: "999px",
              background: tone.bg,
              border: `1px solid ${tone.bd}`,
              color: tone.fg,
              boxShadow: tone.glow,
              fontFamily: font.mono,
              fontSize: "0.72em",
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {ACTION_LABEL[action]}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The felt at one ordinal.
 *
 * `Board` is deliberately **not** keyed on the position. Remounting it per
 * beat made every card re-play its deal animation on every scrub tick; the
 * board now animates only the cards that actually arrive, which `Board`
 * itself decides by keying cards on rank+suit.
 */
export function ReplayStage({
  position,
  caption,
  transportHeight = 4.5,
}: ReplayStageProps) {
  const tableView = view(stateAt(fixtureHand, position), "table");
  const reserved = transportHeight + CAPTION_BAND;

  return (
    <>
      {/* Everything laid out by percentage — the seat ring via `posFor`, the
          board in the centre — lives inside this box rather than the whole
          felt, so shrinking it lifts the bottom seat row clear of the
          transport instead of overlapping it. */}
      <div
        style={{
          position: "absolute",
          top: `${String(TOP_BAND)}em`,
          left: 0,
          right: 0,
          bottom: `${String(reserved)}em`,
        }}
      >
        <Seats seats={seats} view={tableView} />
        <ActionLabels position={position} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1.2em",
            pointerEvents: "none",
          }}
        >
          <Board view={tableView} />
        </div>
      </div>

      {caption !== null && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: `${String(transportHeight)}em`,
            height: `${String(CAPTION_BAND)}em`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: font.mono,
            fontSize: "0.7em",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: color.textMuted,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {caption}
        </div>
      )}
    </>
  );
}

/**
 * Chrome shared by all three: the way out, and nothing else.
 *
 * Deliberately no `n / total` ordinal — the event ordinal is the *model's*
 * unit, not something a viewer at a poker table has any use for. Which hand
 * is being reviewed lives in the app's own status bar (see `ReplayHandLabel`)
 * rather than floating over the felt, where it competed with the seat pods.
 */
export function ReplayHeader({ onClose }: { readonly onClose: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "1.4em",
        left: "1.8em",
        right: "1.8em",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "1em",
        zIndex: 3,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          fontFamily: font.mono,
          fontSize: "0.62em",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: color.textDim,
          background: "transparent",
          border: `1px solid ${color.border}`,
          borderRadius: "999px",
          padding: "0.7em 1.3em",
          cursor: "pointer",
        }}
      >
        Back to hands
      </button>
    </div>
  );
}

/**
 * "Reviewing hand **12**" for the app's status bar — the same bar the
 * connection badge sits in. Puts *what the device is currently showing* in
 * the one place that already answers that question, instead of a second
 * title competing with the felt.
 */
export function ReplayHandLabel() {
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: fontSize.xs,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: color.textDim,
      }}
    >
      Reviewing hand{" "}
      <strong style={{ fontWeight: 700, color: color.text }}>
        {String(fixtureHand.handNumber)}
      </strong>
    </span>
  );
}
