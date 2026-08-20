import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CAPTION_BAND,
  CAPTION_LAYER,
  CaptionStrip,
  FELT_LAYER,
} from "./CaptionStrip.js";

const TRANSPORT = 10.2;

describe("CaptionStrip", () => {
  it("names the beat in a band of its own, above the transport", () => {
    const html = renderToStaticMarkup(
      <CaptionStrip caption="The turn" transportHeight={TRANSPORT} />,
    );
    const style =
      /data-testid="replay-caption"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? "";

    expect(html).toContain("The turn");
    expect(style).toContain(`bottom:${String(TRANSPORT)}em`);
    expect(style).toContain(`height:${String(CAPTION_BAND)}em`);
  });

  it("renders an empty band when there is no beat to name", () => {
    const html = renderToStaticMarkup(
      <CaptionStrip caption={null} transportHeight={TRANSPORT} />,
    );

    expect(html).toContain('data-testid="replay-caption"');
  });

  it("gives way to a pod that reaches into its band, never over it", () => {
    const html = renderToStaticMarkup(
      <CaptionStrip caption="The turn" transportHeight={TRANSPORT} />,
    );

    expect(html).toContain(`z-index:${String(CAPTION_LAYER)}`);
    expect(CAPTION_LAYER).toBeLessThan(FELT_LAYER);
  });
});
