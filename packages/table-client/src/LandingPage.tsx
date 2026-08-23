import { PillButton, font } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

export interface LandingPageProps {
  readonly onCreateRoom: () => void;
}

const pageStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 26,
  width: "min(100%, 720px)",
  padding: 32,
  textAlign: "center",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#ffffff",
  fontFamily: font.display,
  fontSize: "clamp(1.6rem, 9vw, 4.5rem)",
  fontWeight: 800,
  letterSpacing: "0.04em",
  lineHeight: 0.95,
  whiteSpace: "nowrap",
};

export function LandingPage({ onCreateRoom }: LandingPageProps) {
  return (
    <section data-testid="landing-page" style={pageStyle}>
      <h1 data-testid="landing-title" style={titleStyle}>
        TABLE TOP POKER
      </h1>
      <PillButton
        size="lg"
        data-testid="create-room-button"
        onClick={onCreateRoom}
      >
        Create room
      </PillButton>
    </section>
  );
}
