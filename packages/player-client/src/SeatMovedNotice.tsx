import { color, fontSize, radius } from "@table-top-poker/ui-shared";

export interface SeatMovedNoticeProps {
  readonly message: string;
}

/** The inline notice shown when a table repack changes a player's position. */
export function SeatMovedNotice({ message }: SeatMovedNoticeProps) {
  return (
    <div
      data-testid="seat-moved-notice"
      style={{
        flex: "none",
        margin: "10px 18px 0",
        padding: "10px 14px",
        borderRadius: radius.control,
        background: color.winBackground,
        border: `1px solid ${color.winBorder}`,
        color: color.winText,
        fontSize: fontSize.md,
      }}
    >
      {message}
    </div>
  );
}
