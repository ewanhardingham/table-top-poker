import { color } from "@table-top-poker/ui-shared";

export interface SettingsToggleProps {
  readonly open: boolean;
  readonly onToggle: () => void;
}

export function SettingsToggle({ open, onToggle }: SettingsToggleProps) {
  return (
    <button
      type="button"
      data-testid="settings-toggle"
      aria-label={open ? "Close table settings" : "Open table settings"}
      aria-expanded={open}
      onClick={onToggle}
      style={{
        position: "absolute",
        right: 24,
        top: 20,
        zIndex: 15,
        width: 52,
        height: 52,
        borderRadius: 16,
        border: `1px solid ${color.borderStrong}`,
        background: color.control,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        cursor: "pointer",
      }}
    >
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          style={{
            width: 20,
            height: 2,
            borderRadius: 2,
            background: color.textBright,
            display: "block",
          }}
        />
      ))}
    </button>
  );
}
