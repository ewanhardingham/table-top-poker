/**
 * PROTOTYPE — throwaway, wayfinder ticket #81.
 *
 * Variant C — "Tiles". A grid of square tiles, each a miniature of the felt:
 * the seat ring with survivors lit and the winner ringed, the board across
 * the middle. Bets that on a device lying flat with people sat around it,
 * *who was in the hand* is the strongest recall cue ("the one where it was
 * just you and me"), and that a grid with no strong reading direction and
 * big targets beats a list you have to be at the right end of the table to
 * read.
 *
 * Ordering: newest first, top-left. In-progress hand: omitted entirely —
 * you cannot re-watch a hand that hasn't finished.
 */
import { Card, color, font, radius } from "@table-top-poker/ui-shared";
import { type HandSummary, outcomeText, survivors, winnersOf } from "./summary.js";

function SeatRing({ hand }: { readonly hand: HandSummary }) {
  const live = new Set(survivors(hand));
  const winners = new Set(winnersOf(hand));
  const n = hand.dealtIn.length;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {hand.dealtIn.map((seatId, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        const x = 50 + 40 * Math.cos(angle);
        const y = 50 + 40 * Math.sin(angle);
        const isWinner = winners.has(seatId);
        const isLive = live.has(seatId);
        return (
          <span
            key={seatId}
            style={{
              position: "absolute",
              left: `${String(x)}%`,
              top: `${String(y)}%`,
              transform: "translate(-50%,-50%)",
              width: "1.8em",
              height: "1.8em",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: font.mono,
              fontSize: "0.62em",
              background: isWinner
                ? color.seatWinnerBackground
                : isLive
                  ? color.seatAvatarFolded
                  : color.seatAvatarOpen,
              border: isWinner
                ? `2px solid ${color.seatWinnerBorder}`
                : `1px solid ${color.border}`,
              color: isWinner
                ? color.textBright
                : isLive
                  ? color.textMuted
                  : color.seatAvatarOpenText,
              boxShadow:
                hand.button === seatId ? `0 0 0 2px ${color.buttonMarker}` : "none",
            }}
          >
            {seatId + 1}
          </span>
        );
      })}
    </div>
  );
}

function Tile({
  hand,
  onSelect,
}: {
  readonly hand: HandSummary;
  readonly onSelect: (n: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(hand.handNumber);
      }}
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        borderRadius: radius.panel,
        border: `1px solid ${color.border}`,
        background: color.surfaceGradient,
        color: color.text,
        font: "inherit",
        padding: "0.6em",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "0.5em",
          left: "0.7em",
          fontFamily: font.display,
          fontSize: "1.5em",
          color: color.textFaint,
          lineHeight: 1,
        }}
      >
        {hand.handNumber}
      </span>

      <div style={{ position: "relative", flex: 1 }}>
        <SeatRing hand={hand} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.18em",
            fontSize: "0.62em",
          }}
        >
          {hand.board.length === 0 ? (
            <span
              style={{
                fontFamily: font.mono,
                fontSize: "1.1em",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: color.textFaint,
              }}
            >
              no flop
            </span>
          ) : (
            hand.board.map((card, i) => (
              <Card key={i} rank={card.rank} suit={card.suit} />
            ))
          )}
        </div>
      </div>

      <span
        style={{
          fontSize: "0.72em",
          fontWeight: 600,
          textAlign: "center",
          color: color.winText,
          lineHeight: 1.25,
        }}
      >
        {outcomeText(hand)}
      </span>
    </button>
  );
}

export const variantCName = "Tiles — who was in, read from any side";

export function VariantC({
  hands,
  onSelect,
}: {
  readonly hands: readonly HandSummary[];
  readonly onSelect: (n: number) => void;
}) {
  const ordered = [...hands]
    .filter((hand) => hand.outcome.kind !== "in-progress")
    .sort((a, b) => b.handNumber - a.handNumber);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(11em, 1fr))",
        gap: "0.7em",
        overflowY: "auto",
        padding: "0.2em",
      }}
    >
      {ordered.map((hand) => (
        <Tile key={hand.handNumber} hand={hand} onSelect={onSelect} />
      ))}
    </div>
  );
}
