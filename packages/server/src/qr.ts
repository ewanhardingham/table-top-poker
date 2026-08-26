import QRCode from "qrcode";

export type UrlProtocol = "http" | "https";

export function joinUrl(
  host: string,
  code: string,
  protocol: UrlProtocol = "http",
): string {
  return `${protocol}://${host}/join/${code}`;
}

export function roomQrCodeDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url);
}
