/**
 * PROTOTYPE — throwaway. Floating variant switcher shared by prototype routes.
 * Deliberately styled unlike the app so it never reads as part of the design
 * under evaluation. Never rendered in a production build.
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
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const i = variants.indexOf(current);
      const step = event.key === "ArrowRight" ? 1 : -1;
      onChange(variants[(i + step + variants.length) % variants.length] ?? current);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [variants, current, onChange]);

  const i = variants.indexOf(current);
  const go = (step: number) => {
    onChange(variants[(i + step + variants.length) % variants.length] ?? current);
  };

  const arrow: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "#111",
    fontSize: "18px",
    lineHeight: 1,
    padding: "0 10px",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "8px 10px",
        borderRadius: "999px",
        background: "#fff",
        color: "#111",
        fontFamily: "ui-monospace, monospace",
        fontSize: "13px",
        boxShadow: "0 8px 30px rgba(0,0,0,.6)",
      }}
    >
      <button type="button" style={arrow} onClick={() => { go(-1); }}>
        ←
      </button>
      <span style={{ minWidth: "22em", textAlign: "center" }}>
        {current} — {names[current] ?? ""}
      </span>
      <button type="button" style={arrow} onClick={() => { go(1); }}>
        →
      </button>
    </div>
  );
}
