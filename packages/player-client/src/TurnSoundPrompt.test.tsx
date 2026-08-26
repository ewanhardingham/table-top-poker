import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TurnSoundPrompt } from "./TurnSoundPrompt.js";

describe("TurnSoundPrompt", () => {
  it("opens with the recording explanation and a skip path", () => {
    const html = renderToStaticMarkup(
      <TurnSoundPrompt onDone={() => undefined} />,
    );

    expect(html).toContain('data-testid="turn-sound-prompt"');
    expect(html).toContain("Make your turn sound");
    expect(html).toContain('data-testid="turn-sound-permission"');
    expect(html).toContain('data-testid="turn-sound-skip"');
    expect(html).toContain("standard sound");
  });
});
