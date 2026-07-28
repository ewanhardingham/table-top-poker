import type { PlayerView } from "@table-top-poker/protocol";
import { color, font, fontSize } from "@table-top-poker/ui-shared";

export interface ShowdownCardProps {
  readonly seatId: number;
  readonly view: Extract<PlayerView, { phase: "showdown" | "folded-out" }>;
}

function seatLabel(seatId: number, yourSeatId: number): string {
  return seatId === yourSeatId ? "You" : `Seat ${String(seatId + 1)}`;
}

interface ResultCopy {
  readonly resultText: string;
  readonly yourResultText: string;
}

function describeResult(
  view: ShowdownCardProps["view"],
  yourSeatId: number,
): ResultCopy {
  if (view.phase === "folded-out") {
    const won = view.winner === yourSeatId;
    return {
      resultText: won
        ? "You win — everyone folded"
        : `${seatLabel(view.winner, yourSeatId)} wins — everyone folded`,
      yourResultText: won
        ? "Everyone else folded."
        : "You folded earlier in the hand.",
    };
  }

  const names = view.winners.map((id) => seatLabel(id, yourSeatId)).join(" & ");
  const winningResult = view.results.find(
    (result) => result.seatId === view.winners[0],
  );
  const yourResult = view.results.find(
    (result) => result.seatId === yourSeatId,
  );
  return {
    resultText: winningResult
      ? `${names} — ${winningResult.description}`
      : names,
    yourResultText: yourResult
      ? `You had ${yourResult.description}`
      : "You folded earlier in the hand.",
  };
}

/**
 * The winner/result card shown in place of the action bar once a hand
 * resolves — see docs/design/table-top-poker-prototype.dc.html's
 * `showWinnerCard` section, whose two-line result/your-result framing this
 * mirrors. `yourResultText` reads a plain fold message once results/winner
 * lists no longer name this seat — true both when it folded before
 * showdown and (folded-out) when the rest of the table folded around it.
 */
export function ShowdownCard({ seatId, view }: ShowdownCardProps) {
  const { resultText, yourResultText } = describeResult(view, seatId);

  return (
    <div
      data-testid="showdown-card"
      style={{
        width: "100%",
        borderRadius: "20px",
        padding: "18px 20px",
        background: color.showdownBackground,
        border: `1px solid ${color.showdownBorder}`,
        display: "flex",
        flexDirection: "column",
        gap: 9,
      }}
    >
      <span
        style={{
          fontFamily: font.mono,
          fontSize: fontSize.xs,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: color.accent,
        }}
      >
        Showdown
      </span>
      <span
        data-testid="showdown-result"
        style={{
          fontFamily: font.display,
          fontWeight: 800,
          letterSpacing: "-0.025em",
          fontSize: fontSize.xl,
          lineHeight: 1.2,
          color: color.textHeadline,
        }}
      >
        {resultText}
      </span>
      <span
        data-testid="your-result"
        style={{ fontSize: fontSize.detail, color: color.textDetail }}
      >
        {yourResultText}
      </span>
    </div>
  );
}
