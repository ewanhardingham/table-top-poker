export interface WsLocation {
  readonly protocol: string;
  readonly host: string;
}

/** Derives the WebSocket scheme from `location.protocol` — never hard-coded. */
export function getWebSocketUrl(
  location: WsLocation,
  params: Record<string, string> = {},
): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  const query = new URLSearchParams(params).toString();
  return `${scheme}//${location.host}/ws${query ? `?${query}` : ""}`;
}
