import type {
  RoomView,
  RoomCreationSettings,
  SeatCountChange,
  ShotClockSettings,
  ShowdownClockSettings,
  SoundSettings,
} from "@table-top-poker/protocol";

export interface CreatedRoom {
  readonly code: string;
  readonly joinUrl: string;
  readonly qrCodeDataUrl: string;
}

export interface ServerConfig {
  readonly testMode: boolean;
}

export interface BotsAdded {
  readonly joined: number;
}

export async function fetchConfig(): Promise<ServerConfig> {
  const response = await fetch("/config", { method: "GET" });
  if (!response.ok) {
    throw new Error(`failed to fetch config: ${String(response.status)}`);
  }
  return (await response.json()) as ServerConfig;
}

export async function fetchRoom(code: string): Promise<RoomView> {
  const response = await fetch(`/rooms/${code}/join`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`failed to fetch room: ${String(response.status)}`);
  }
  return (await response.json()) as RoomView;
}

export async function createRoom(
  settings: RoomCreationSettings,
): Promise<CreatedRoom> {
  const response = await fetch("/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(`failed to create room: ${String(response.status)}`);
  }
  return (await response.json()) as CreatedRoom;
}

export async function endSession(code: string): Promise<void> {
  const response = await fetch(`/rooms/${code}/end`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`failed to end session: ${String(response.status)}`);
  }
}

export async function addBots(code: string, count: number): Promise<BotsAdded> {
  const response = await fetch(`/rooms/${code}/bots`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ count }),
  });
  if (!response.ok) {
    throw new Error(`failed to add bots: ${String(response.status)}`);
  }
  return (await response.json()) as BotsAdded;
}

export async function evictSeat(code: string, seatId: number): Promise<void> {
  const response = await fetch(`/rooms/${code}/seats/${String(seatId)}/evict`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`failed to evict seat: ${String(response.status)}`);
  }
}

export async function changeSeatCount(
  code: string,
  seatCount: number,
): Promise<SeatCountChange> {
  const response = await fetch(`/rooms/${code}/seats/count`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seatCount }),
  });
  if (!response.ok) {
    throw new Error(`failed to change seat count: ${String(response.status)}`);
  }
  return (await response.json()) as SeatCountChange;
}

export async function changeSoundSettings(
  code: string,
  settings: SoundSettings,
): Promise<SoundSettings> {
  const response = await fetch(`/rooms/${code}/sound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(
      `failed to change sound settings: ${String(response.status)}`,
    );
  }
  return (await response.json()) as SoundSettings;
}

export async function changeShotClockSettings(
  code: string,
  settings: ShotClockSettings,
): Promise<ShotClockSettings> {
  const response = await fetch(`/rooms/${code}/shot-clock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(
      `failed to change shot-clock settings: ${String(response.status)}`,
    );
  }
  return (await response.json()) as ShotClockSettings;
}

export async function changeShowdownClockSettings(
  code: string,
  settings: ShowdownClockSettings,
): Promise<ShowdownClockSettings> {
  const response = await fetch(`/rooms/${code}/showdown-clock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(
      `failed to change showdown-clock settings: ${String(response.status)}`,
    );
  }
  return (await response.json()) as ShowdownClockSettings;
}
