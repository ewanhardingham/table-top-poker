import type { SeatView } from "@table-top-poker/protocol";
import { color, font, fontSize } from "@table-top-poker/ui-shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { HandReviewState } from "../store/replaySlice.js";
import { actionLabelsAt } from "./actionLabels.js";
import { chromeVariables } from "./chrome.js";
import { beatAt, chaptersOf, holdAt, toBeats } from "./beats.js";
import { captionFor } from "./caption.js";
import { CaptionStrip } from "./CaptionStrip.js";
import { ReplayStage } from "./ReplayStage.js";
import { ReplayTransport } from "./ReplayTransport.js";

export interface HandReviewProps {
  readonly review: HandReviewState;
  readonly seats: readonly SeatView[];
}

/**
 * One recorded hand, scrubbable. The whole hand is already in hand — the
 * server sends every position in one message — so the track can lay out its
 * ticks and chapters before anything is touched (Phase 2 spec #129 §5).
 */
export function HandReview({ review, seats }: HandReviewProps) {
  const positions = review.status === "ready" ? review.positions : [];
  const beats = useMemo(() => toBeats(positions), [positions]);
  const chapters = useMemo(() => chaptersOf(beats), [beats]);

  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  const labels = useMemo(
    () => actionLabelsAt(positions, position),
    [positions, position],
  );

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
      <Chrome>
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
      </Chrome>
    );
  }

  const view = positions[position]?.view ?? positions[0]?.view;
  const event = positions[position]?.event ?? null;

  return (
    <Chrome>
      {view !== undefined && (
        <ReplayStage view={view} seats={seats} actionLabels={labels} />
      )}
      <CaptionStrip caption={captionFor(event, seats)} />
      <ReplayTransport
        beats={beats}
        chapters={chapters}
        position={position}
        playing={playing}
        scrubbing={scrubbing}
        onSeek={setPosition}
        onScrubbingChange={changeScrubbing}
        onTogglePlay={togglePlay}
        currentSegment={beatAt(beats, position)?.segment ?? null}
      />
    </Chrome>
  );
}

/** Holds the scale the replay's own chrome sizes against — see `chrome.ts`. */
function Chrome({ children }: { readonly children: ReactNode }) {
  return (
    <div
      data-testid="replay-chrome"
      style={{
        position: "absolute",
        inset: 0,
        ...chromeVariables,
      }}
    >
      {children}
    </div>
  );
}
