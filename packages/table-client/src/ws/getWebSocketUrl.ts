export interface WsLocation {
  readonly protocol: string;
  readonly host: string;
}

/** Derives the WebSocket scheme from `location.protocol` — never hard-coded. */
export function getWebSocketUrl(location: WsLocation): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/ws`;
}
