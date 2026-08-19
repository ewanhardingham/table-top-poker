import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotRecordingBanner } from "./NotRecordingBanner.js";

describe("NotRecordingBanner", () => {
  it("names itself as a status region and states hands are not being saved", () => {
    const html = renderToStaticMarkup(<NotRecordingBanner />);
    expect(html).toContain('data-testid="not-recording-banner"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Not recording");
  });
});
