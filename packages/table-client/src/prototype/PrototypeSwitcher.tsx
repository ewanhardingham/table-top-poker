/**
 * PROTOTYPE ONLY — the floating variant switcher shared by dev-only routes.
 * It is deliberately styled unlike the table so it cannot be mistaken for a
 * treatment under review.
 */
import { useEffect } from "react";

export interface PrototypeSwitcherProps {
  readonly variants: readonly string[];
  readonly current: string;
  readonly names: Readonly<Record<string, string>>;
  readonly onChange: (variant: string) => void;
}

export function PrototypeSwitcher({
  variants,
  current,
  names,
  onChange,
}: PrototypeSwitcherProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      const element = target instanceof HTMLElement ? target : null;
      if (
        element?.matches("input, textarea, select, [contenteditable]") ||
        element?.isContentEditable
      ) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      const index = variants.indexOf(current);
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = variants[(index + step + variants.length) % variants.length];
      if (next) {
        event.preventDefault();
        onChange(next);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [current, onChange, variants]);

  const index = Math.max(0, variants.indexOf(current));
  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length];
    if (next) onChange(next);
  };

  return (
    <nav className="prototype-switcher" aria-label="Prototype variants">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => {
          go(-1);
        }}
      >
        ←
      </button>
      <span>
        {current} — {names[current] ?? "Unknown variant"}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => {
          go(1);
        }}
      >
        →
      </button>
    </nav>
  );
}
