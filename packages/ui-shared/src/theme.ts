/**
 * Design tokens for the felt/night palette used by the design prototype
 * (`docs/design/table-top-poker-prototype.dc.html`). `table-client` and
 * `player-client` both style against these rather than hard-coding values.
 */

const feltGradient =
  "linear-gradient(180deg,#6a1a1f 0%,#4b1317 42%,#2c0c0f 100%)";

export const color = {
  background: "#0b0a09",
  felt: feltGradient,

  surface: "rgba(6,9,8,.62)",
  surfaceGradient: "linear-gradient(180deg,#1d1214,#100a0b)",
  sideMenuGradient: "linear-gradient(180deg,#241417,#0d0809)",
  control: "rgba(12,7,8,.62)",
  border: "rgba(255,255,255,.1)",
  borderStrong: "rgba(255,255,255,.16)",

  accent: "#e5443c",
  accentBright: "#ef6259",
  accentDeep: "#a81d1c",

  pillGradient: "linear-gradient(180deg,#fbf6f3,#e0cdc7)",
  pillInk: "#1b0708",

  text: "#f3ece1",
  textMuted: "#cdbfa6",
  textDim: "#a2957f",
  textFaint: "#7d6a68",

  cardFace: "linear-gradient(170deg,#fffdf7,#efe7d6)",
  cardBack: feltGradient,
  cardBorder: "rgba(0,0,0,.2)",
  suitRed: "#c0392b",
  suitBlack: "#151311",
} as const;

export const font = {
  display: "'Archivo', system-ui, sans-serif",
  body: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
} as const;

/** Named rungs of the type scale, from mono kicker labels up to the room-code display. */
export const fontSize = {
  xs: "10px",
  sm: "12px",
  md: "15px",
  lg: "19px",
  xl: "26px",
  display: "34px",
  jumbo: "104px",
} as const;

export const radius = {
  pill: "999px",
  panel: "22px",
  card: "15px",
  control: "16px",
} as const;

export const shadow = {
  panel: "0 44px 90px -30px rgba(0,0,0,.95)",
  pill: "0 16px 40px -14px rgba(229,68,60,.6), inset 0 1px 0 rgba(255,255,255,.5)",
  card: "0 22px 44px -16px rgba(0,0,0,.85)",
} as const;
