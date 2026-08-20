import type { SeatView } from "@table-top-poker/protocol";
import { color, font, fontSize } from "@table-top-poker/ui-shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HandReviewState } from "../store/replaySlice.js";
import { actionLabelsAt } from "./actionLabels.js";
import { beatAt, chaptersOf, holdAt, toBeats } from "./beats.js";
import { captionFor } from "./caption.js";
import { CaptionStrip } from "./CaptionStrip.js";
import { ReplayStage } from "./ReplayStage.js";
import { ReplayTransport, TRANSPORT_HEIGHT } from "./ReplayTransport.js";

export interface HandReviewProps {
  readonly review: HandReviewState;
  readonly seats: readonly SeatView[];
  readonly onClose: () => void;
}

/**
 * One recorded hand, scrubbable. The whole hand is already in hand — the
 * server sends every position in one message — so the track can lay out its
 * ticks and street chapters before anything is touched (Phase 2 spec #129 §5).
 */
export function HandReview({ review, seats, onClose }: HandReviewProps) {
  const positions = review.status === "ready" ? review.positions : [];
  const beats = useMemo(() => toBeats(positions), [positions]);
  const chapters = useMemo(() => chaptersOf(beats), [beats]);

  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  useEffect(() => {
    setPosition(0);
    setPlaying(false);
  }, [review.handOrdinal]);

  const atEnd = position >= beats.length;

  useEffect(() => {
    if (!playing || atEnd || scrubbing) return;
    const timer = window.setTimeout(
      () => {
        setPosition((current) => current + 1);
      },
      holdAt(beats, position),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [playing, position, scrubbing, atEnd, beats]);

  // Pressing the track stops autoplay: the scrub is the primary mode, and a
  // clock fighting a finger is the worst of both.
  const changeScrubbing = useCallback((scrubbing: boolean) => {
    setScrubbing(scrubbing);
    if (scrubbing) setPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    setPosition((current) => (current >= beats.length ? 0 : current));
    setPlaying((current) => !current);
  }, [beats.length]);

  if (review.status !== "ready") {
    return (
      <>
        <BackToHands onClose={onClose} />
        <div
          data-testid="replay-notice"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: font.mono,
            fontSize: fontSize.md,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: color.textDim,
          }}
        >
          {review.status === "loading"
            ? "Loading the hand"
            : "That hand can't be replayed"}
        </div>
      </>
    );
  }

  const view = positions[position]?.view ?? positions[0]?.view;

  return (
    <>
      {view !== undefined && (
        <ReplayStage
          view={view}
          seats={seats}
          transportHeight={TRANSPORT_HEIGHT}
          actionLabels={actionLabelsAt(positions, position)}
        />
      )}
      <BackToHands onClose={onClose} />
      <CaptionStrip
        caption={captionFor(positions[position]?.event ?? null, seats)}
        transportHeight={TRANSPORT_HEIGHT}
      />
      <ReplayTransport
        beats={beats}
        chapters={chapters}
        position={position}
        playing={playing}
        scrubbing={scrubbing}
        onSeek={setPosition}
        onScrubbingChange={changeScrubbing}
        onTogglePlay={togglePlay}
        currentStreet={beatAt(beats, position)?.street ?? null}
      />
    </>
  );
}

function BackToHands({ onClose }: { readonly onClose: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "1.4em",
        left: "1.8em",
        right: "1.8em",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 3,
      }}
    >
      <button
        type="button"
        data-testid="back-to-hands-button"
        onClick={onClose}
        style={{
          fontFamily: font.mono,
          fontSize: "0.62em",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: color.textDim,
          background: "transparent",
          border: `1px solid ${color.border}`,
          borderRadius: "999px",
          padding: "0.7em 1.3em",
          cursor: "pointer",
        }}
      >
        Back to hands
      </button>
    </div>
  );
}
