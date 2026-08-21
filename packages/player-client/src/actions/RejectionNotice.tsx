import { fontSize, radius } from "@table-top-poker/ui-shared";
import type { ActionType } from "@table-top-poker/protocol";
import { rejectionCopy } from "./rejectionCopy.js";
import type { ActionRejection } from "../store/actionSlice.js";

export interface RejectionNoticeProps {
  readonly rejection: ActionRejection;
  readonly attributedTo?: ActionType | "show" | null;
}

export function RejectionNotice({
  rejection,
  attributedTo = null,
}: RejectionNoticeProps) {
  return (
    <div
      data-testid="action-rejection"
      data-rejected-action={attributedTo ?? ""}
      style={{
        padding: "0.7em 0.9em",
        borderRadius: radius.control,
        background: "rgba(232,139,125,.13)",
        border: "1px solid rgba(232,139,125,.34)",
        fontSize: fontSize.caption,
        color: "#f0aa9d",
      }}
    >
      {rejectionCopy(rejection.reason)}
    </div>
  );
}
