import {
  CardBackPicker,
  PillButton,
  color,
  font,
  fontSize,
  radius,
} from "@table-top-poker/ui-shared";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type CSSProperties } from "react";

export interface PlayerMenuProps {
  readonly sittingOut: boolean;
  readonly sitOutDisabled: boolean;
  readonly inLiveHand: boolean;
  readonly onToggleSittingOut: () => void;
  readonly onLeave: () => void;
  readonly turnSoundRecorded: boolean;
  readonly turnSoundDisabled: boolean;
  readonly onEditTurnSound: () => void;
  readonly onRemoveTurnSound: () => void;
}

export function leaveConfirmMessage(inLiveHand: boolean): string {
  return inLiveHand
    ? "Leave now? You'll forfeit the current hand."
    : "Leave the game?";
}

export function PlayerMenu({
  sittingOut,
  sitOutDisabled,
  inLiveHand,
  onToggleSittingOut,
  onLeave,
  turnSoundRecorded,
  turnSoundDisabled,
  onEditTurnSound,
  onRemoveTurnSound,
}: PlayerMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  function close() {
    setOpen(false);
    setConfirmingLeave(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        data-testid="player-menu-button"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
        style={menuButtonStyle}
      >
        <span style={burgerBarStyle} />
        <span style={burgerBarStyle} />
        <span style={burgerBarStyle} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="player-menu-backdrop"
            data-testid="player-menu-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 30,
              display: "flex",
              justifyContent: "flex-end",
              background: color.overlay,
              backdropFilter: "blur(3px)",
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Player menu"
              data-testid="player-menu-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.22 }}
              onClick={(event) => {
                event.stopPropagation();
              }}
              style={{
                width: "80%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                padding: "18px 18px 24px",
                overflowX: "hidden",
                overflowY: "auto",
                background: color.sideMenuGradient,
                borderLeft: `1px solid ${color.borderStrong}`,
                boxShadow: "-30px 0 80px -20px rgba(0,0,0,.8)",
              }}
            >
              <MenuBody
                sittingOut={sittingOut}
                sitOutDisabled={sitOutDisabled}
                inLiveHand={inLiveHand}
                confirmingLeave={confirmingLeave}
                onClose={close}
                onSitOut={() => {
                  onToggleSittingOut();
                  close();
                }}
                onStartConfirm={() => {
                  setConfirmingLeave(true);
                }}
                onCancelConfirm={() => {
                  setConfirmingLeave(false);
                }}
                onConfirmLeave={onLeave}
                turnSoundRecorded={turnSoundRecorded}
                turnSoundDisabled={turnSoundDisabled}
                onEditTurnSound={() => {
                  onEditTurnSound();
                  close();
                }}
                onRemoveTurnSound={onRemoveTurnSound}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export interface MenuBodyProps {
  readonly sittingOut: boolean;
  readonly sitOutDisabled: boolean;
  readonly inLiveHand: boolean;
  readonly confirmingLeave: boolean;
  readonly onClose: () => void;
  readonly onSitOut: () => void;
  readonly onStartConfirm: () => void;
  readonly onCancelConfirm: () => void;
  readonly onConfirmLeave: () => void;
  readonly turnSoundRecorded: boolean;
  readonly turnSoundDisabled: boolean;
  readonly onEditTurnSound: () => void;
  readonly onRemoveTurnSound: () => void;
}

export function MenuBody({
  sittingOut,
  sitOutDisabled,
  inLiveHand,
  confirmingLeave,
  onClose,
  onSitOut,
  onStartConfirm,
  onCancelConfirm,
  onConfirmLeave,
  turnSoundRecorded,
  turnSoundDisabled,
  onEditTurnSound,
  onRemoveTurnSound,
}: MenuBodyProps) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={kickerStyle}>Menu</span>
        <button
          type="button"
          aria-label="Close menu"
          data-testid="player-menu-close"
          onClick={onClose}
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            border: `1px solid ${color.border}`,
            background: "transparent",
            color: color.textMuted,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      <button
        type="button"
        data-testid="menu-sit-out"
        disabled={sitOutDisabled}
        onClick={onSitOut}
        style={{
          ...itemStyle,
          ...(sitOutDisabled
            ? { color: color.disabledText, cursor: "default" }
            : {}),
        }}
      >
        {sittingOut ? "Sit in" : "Sit out"}
      </button>

      <div style={{ height: 1, background: color.border, margin: "2px 0" }} />

      <section
        data-testid="player-card-back-settings"
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: fontSize.md, fontWeight: 600 }}>
            Card backs
          </span>
          <span
            style={{
              color: color.textDim,
              fontSize: fontSize.sm,
              lineHeight: 1.4,
            }}
          >
            Changes cards on this device only.
          </span>
        </div>
        <CardBackPicker />
      </section>

      <div style={{ height: 1, background: color.border, margin: "2px 0" }} />

      <section
        data-testid="player-turn-sound-settings"
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: fontSize.md, fontWeight: 600 }}>
            Turn sound
          </span>
          <span style={{ color: color.textDim, fontSize: fontSize.sm }}>
            Stored on this device only.
          </span>
        </div>
        <button
          type="button"
          data-testid="menu-turn-sound"
          disabled={turnSoundDisabled}
          onClick={onEditTurnSound}
          style={{
            ...itemStyle,
            ...(turnSoundDisabled
              ? { color: color.disabledText, cursor: "default" }
              : {}),
          }}
        >
          {turnSoundRecorded ? "Record again" : "Record a turn sound"}
        </button>
        {turnSoundRecorded && (
          <button
            type="button"
            data-testid="menu-remove-turn-sound"
            onClick={onRemoveTurnSound}
            style={itemStyle}
          >
            Remove turn sound
          </button>
        )}
      </section>

      <div style={{ height: 1, background: color.border, margin: "2px 0" }} />

      {confirmingLeave ? (
        <div
          data-testid="leave-confirm"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "16px 18px",
            borderRadius: radius.control,
            border: `1px solid ${color.accentBorder}`,
            background: color.accentWash,
          }}
        >
          <span
            style={{
              fontSize: fontSize.md,
              lineHeight: 1.4,
              color: color.textBright,
            }}
          >
            {leaveConfirmMessage(inLiveHand)}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <PillButton
              size="md"
              data-testid="leave-confirm-yes"
              onClick={onConfirmLeave}
              style={{
                flex: 1,
                padding: "13px 0",
                background: color.accent,
                color: color.text,
                boxShadow: "none",
              }}
            >
              Confirm leave
            </PillButton>
            <PillButton
              size="md"
              tone="outline"
              data-testid="leave-confirm-cancel"
              onClick={onCancelConfirm}
              style={{ flex: 1, padding: "13px 0" }}
            >
              Cancel
            </PillButton>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="menu-leave"
          onClick={onStartConfirm}
          style={{
            ...itemStyle,
            border: `1px solid ${color.accentBorder}`,
            background: color.accentWash,
            color: color.textBright,
          }}
        >
          Leave game
        </button>
      )}
    </>
  );
}

const kickerStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: fontSize.xs,
  letterSpacing: "0.24em",
  textTransform: "uppercase",
  color: color.textMuted,
};

const itemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "16px 18px",
  borderRadius: radius.control,
  border: `1px solid ${color.border}`,
  background: color.controlFill,
  color: color.text,
  fontFamily: font.body,
  fontSize: fontSize.md,
  fontWeight: 600,
  cursor: "pointer",
};

const menuButtonStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 4,
  width: 34,
  height: 30,
  padding: "0 8px",
  borderRadius: radius.pill,
  border: `1px solid ${color.border}`,
  background: color.control,
  cursor: "pointer",
};

const burgerBarStyle: CSSProperties = {
  display: "block",
  height: 2,
  width: "100%",
  borderRadius: 2,
  background: color.textMuted,
};
