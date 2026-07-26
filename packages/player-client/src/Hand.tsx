import type { PlayerView } from "@table-top-poker/protocol";
import { Card } from "@table-top-poker/ui-shared";

export interface HandProps {
  readonly view: PlayerView;
}

/**
 * Own hole cards plus the shared board, mirrored straight from the seat's
 * `view` — nothing rebuilt from the raw event locally
 * (docs/phase-1-spec.md §9). Hidden again once folded, a burn-pile per §4:
 * `yourHoleCards` is already `null` in that view, this never redacts.
 * No action buttons yet — that's ticket 12.
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
    return (
      <div data-testid="hand" data-phase="showdown">
        Showdown.
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
      <div data-testid="community-cards">
        {view.board.map((card, i) => (
          <Card key={i} rank={card.rank} suit={card.suit} />
        ))}
      </div>
    </div>
  );
}
