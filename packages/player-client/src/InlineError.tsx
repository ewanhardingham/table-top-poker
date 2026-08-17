import { color, fontSize } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

export interface InlineErrorProps {
  readonly testId: string;
  readonly message: string;
}

const style: CSSProperties = {
  fontSize: fontSize.caption,
  color: color.accentBright,
  textAlign: "center",
};

export function InlineError({ testId, message }: InlineErrorProps) {
  return (
    <div data-testid={testId} style={style}>
      {message}
    </div>
  );
}
