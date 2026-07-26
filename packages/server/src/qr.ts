import QRCode from "qrcode";

/** Builds the join address from the request's own Host header, never a hard-coded origin. */
export function joinUrl(host: string, code: string): string {
  return `http://${host}/join/${code}`;
}

export function roomQrCodeDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url);
}
