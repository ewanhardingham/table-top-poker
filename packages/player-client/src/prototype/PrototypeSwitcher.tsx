import { useEffect } from "react";

export interface PrototypeVariant {
  readonly key: string;
  readonly name: string;
}

interface PrototypeSwitcherProps {
  readonly variants: readonly PrototypeVariant[];
  readonly current: string;
  readonly onChange: (key: string) => void;
}

/** PROTOTYPE ONLY: mounted only on the dev-only Hole-card route. */
export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: PrototypeSwitcherProps) {
  const currentIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const cycle = (delta: number) => {
    const next =
      (currentIndex + delta + variants.length) % Math.max(variants.length, 1);
    const variant = variants[next];
    if (variant) onChange(variant.key);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  const active = variants[currentIndex];
  return (
    <nav className="prototype-switcher" aria-label="Prototype variants">
      <button
        type="button"
        onClick={() => {
          cycle(-1);
        }}
        aria-label="Previous variant"
      >
        ←
      </button>
      <span>
        {active?.key} — {active?.name}
      </span>
      <button
        type="button"
        onClick={() => {
          cycle(1);
        }}
        aria-label="Next variant"
      >
        →
      </button>
    </nav>
  );
}
