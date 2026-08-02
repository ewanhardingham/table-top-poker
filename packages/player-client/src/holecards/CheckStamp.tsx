/**
 * The sighted confirmation for a gesture Check. The surrounding card surface
 * decides when this exists; the stamp itself is deliberately non-interactive
 * so it cannot steal or replay a card gesture.
 */
export function CheckStamp() {
  return (
    <span
      data-testid="check-stamp"
      className="hole-cards-check-stamp"
      aria-hidden="true"
    >
      <span>✓</span>
      <strong>CHECKED</strong>
    </span>
  );
}
