// PROTOTYPE — floating tuning panel for the tactile-sound experiment (#181).
// Throwaway; delete with the branch. Lets the human A/B each cue's sound,
// toggle cues on/off, set the dealer-sweep stagger and volume, and unlock
// audio — all live, while playing real hands, so the feel can be judged by ear.
import { useState } from "react";
import {
  CUES,
  previewCue,
  unlockAudio,
  useSoundStore,
  type CueName,
  type Surface,
} from "./prototypeAudio.js";

const CUE_ORDER = Object.keys(CUES) as CueName[];

const box: React.CSSProperties = {
  position: "fixed",
  right: "0.75rem",
  bottom: "0.75rem",
  zIndex: 9999,
  width: "20rem",
  maxWidth: "calc(100vw - 1.5rem)",
  maxHeight: "80vh",
  overflowY: "auto",
  background: "rgba(18,20,24,0.95)",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: "0.6rem",
  padding: "0.75rem",
  font: "12px/1.4 system-ui, sans-serif",
  boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  margin: "0.35rem 0",
};

export function PrototypeSoundPanel({ surface }: { surface: Surface }) {
  const [open, setOpen] = useState(true);
  const s = useSoundStore();

  if (!open) {
    return (
      <button
        style={{ ...box, width: "auto", padding: "0.4rem 0.7rem" }}
        onClick={() => {
          setOpen(true);
        }}
      >
        🔊 sound proto
      </button>
    );
  }

  return (
    <div style={box}>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <strong>🔊 Sound prototype · {surface}</strong>
        <button
          onClick={() => {
            setOpen(false);
          }}
        >
          –
        </button>
      </div>

      {!s.unlocked && (
        <button
          style={{
            width: "100%",
            padding: "0.5rem",
            margin: "0.25rem 0 0.5rem",
            background: "#2b7",
            color: "#000",
            fontWeight: 700,
            border: 0,
            borderRadius: "0.4rem",
            cursor: "pointer",
          }}
          onClick={() => {
            void unlockAudio();
          }}
        >
          Enable sound (unlock audio)
        </button>
      )}

      <div style={row}>
        <label>
          <input
            type="checkbox"
            checked={s.muted}
            onChange={(e) => {
              s.setMuted(e.target.checked);
            }}
          />{" "}
          mute
        </label>
        <span style={{ marginLeft: "auto" }}>vol</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.volume}
          onChange={(e) => {
            s.setVolume(Number(e.target.value));
          }}
        />
      </div>

      <div style={row}>
        <span>deal stagger</span>
        <input
          type="range"
          min={0}
          max={250}
          step={10}
          value={s.staggerMs}
          onChange={(e) => {
            s.setStagger(Number(e.target.value));
          }}
          style={{ flex: 1 }}
        />
        <span style={{ width: "3.2em", textAlign: "right" }}>
          {s.staggerMs}ms
        </span>
      </div>

      <hr
        style={{ border: 0, borderTop: "1px solid #333", margin: "0.5rem 0" }}
      />

      {CUE_ORDER.map((cue) => {
        const def = CUES[cue];
        return (
          <div key={cue} style={row}>
            <input
              type="checkbox"
              checked={s.enabled[cue]}
              onChange={(e) => {
                s.setEnabled(cue, e.target.checked);
              }}
              title="enable this cue"
            />
            <span style={{ flex: 1, minWidth: 0 }}>{def.label}</span>
            {def.options.length > 1 && (
              <select
                value={s.selected[cue]}
                onChange={(e) => {
                  s.selectOption(cue, e.target.value);
                }}
              >
                {def.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => {
                previewCue(cue);
              }}
              title="preview"
            >
              ▶
            </button>
          </div>
        );
      })}

      <hr
        style={{ border: 0, borderTop: "1px solid #333", margin: "0.5rem 0" }}
      />
      <div style={{ opacity: 0.8 }}>last played: {s.lastPlayed}</div>
    </div>
  );
}
