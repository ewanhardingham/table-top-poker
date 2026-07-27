import type { PlayerView } from "@table-top-poker/protocol";
import { Card } from "@table-top-poker/ui-shared";

export interface HandProps {
  readonly view: PlayerView;
}

/**
 * Own hole cards, mirrored straight from the seat's `view` — nothing
 * rebuilt from the raw event locally (docs/phase-1-spec.md §9). Hidden
 * again once folded, a burn-pile per §4: `yourHoleCards` is already `null`
 * in that view, this never redacts. The shared board is deliberately not
 * shown here mid-hand — the player device stays hole-cards-only, the board
 * lives on the table device — but does reappear on the showdown screen,
 * alongside the winning hand(s), since there's nothing left to keep secret.
 * Action buttons live in `ActionBar`, rendered alongside this by `App`.
 */
export function Hand({ view }: HandProps) {
  if (view.phase === "no-hand") {
    return (
      <div data-testid="hand" data-phase="no-hand">
        Waiting for the next hand.
      </div>
    );
  }

  if (view.phase === "folded-out") {
    return (
      <div data-testid="hand" data-phase="folded-out">
        Hand complete.
      </div>
    );
  }

  if (view.phase === "showdown") {
    const winningResults = view.results.filter((result) =>
      view.winners.includes(result.seatId),
    );
    return (
      <div data-testid="hand" data-phase="showdown">
        <div data-testid="community-cards">
          {view.board.map((card, i) => (
            <Card key={i} rank={card.rank} suit={card.suit} />
          ))}
        </div>
        <ul data-testid="winning-hands">
          {winningResults.map((result) => (
            <li
              key={result.seatId}
              data-testid={`winning-hand-${String(result.seatId)}`}
            >
              Seat {result.seatId + 1}: {result.description}
              <div data-testid={`winning-cards-${String(result.seatId)}`}>
                {result.holeCards.map((card, i) => (
                  <Card key={i} rank={card.rank} suit={card.suit} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div data-testid="hand" data-phase="betting" data-street={view.street}>
      <div data-testid="hole-cards">
        {view.yourHoleCards ? (
          view.yourHoleCards.map((card, i) => (
            <Card key={i} rank={card.rank} suit={card.suit} />
          ))
        ) : (
          <span data-testid="no-hole-cards">Folded</span>
        )}
      </div>
    </div>
  );
}
