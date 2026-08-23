import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Card } from "./Card.js";
import {
  CardBackDesignProvider,
  CardBackPicker,
  DEFAULT_CARD_BACK_DESIGN,
  cardBackDesigns,
  loadCardBackDesign,
  saveCardBackDesign,
} from "./cardBackDesign.js";

function storageWith(value: string | null) {
  const getItem = vi.fn(() => value);
  const setItem = vi.fn();
  return {
    storage: { getItem, setItem } as unknown as Storage,
    getItem,
    setItem,
  };
}

describe("card-back designs", () => {
  it("offers nine named ornamental options with Deco as the default", () => {
    expect(cardBackDesigns).toHaveLength(9);
    expect(DEFAULT_CARD_BACK_DESIGN).toBe("deco");
    expect(cardBackDesigns.map(({ id }) => id)).toContain("deco");
  });

  it("renders the selected design on every face-down Card in its provider", () => {
    const html = renderToStaticMarkup(
      <CardBackDesignProvider design="deco" onChange={() => undefined}>
        <Card faceDown />
      </CardBackDesignProvider>,
    );

    expect(html).toContain('data-card-back-design="deco"');
    expect(html).toContain("deco.webp");
  });

  it("marks one of all nine picker options as selected", () => {
    const html = renderToStaticMarkup(
      <CardBackDesignProvider design="atomic" onChange={() => undefined}>
        <CardBackPicker />
      </CardBackDesignProvider>,
    );

    expect(html.match(/data-testid="card-back-option-/g)).toHaveLength(9);
    expect(html).toMatch(
      /data-testid="card-back-option-atomic"[^>]*aria-pressed="true"/,
    );
  });

  it("previews the picker with thumbnails, never the full-size artwork", () => {
    const html = renderToStaticMarkup(
      <CardBackDesignProvider design="deco" onChange={() => undefined}>
        <CardBackPicker />
      </CardBackDesignProvider>,
    );

    expect(html.match(/-thumb\.webp/g)).toHaveLength(9);
    for (const { artwork } of cardBackDesigns) {
      expect(html).not.toContain(artwork);
    }
  });

  it("persists valid choices and rejects unknown stored values", () => {
    const valid = storageWith("mosaic");
    const invalid = storageWith("marked-deck");

    expect(loadCardBackDesign(valid.storage, "preference")).toBe("mosaic");
    expect(loadCardBackDesign(invalid.storage, "preference")).toBe("deco");

    saveCardBackDesign(valid.storage, "preference", "waves");
    expect(valid.setItem).toHaveBeenCalledWith("preference", "waves");
  });

  it("falls back safely when browser storage is unavailable", () => {
    const unavailable = storageWith(null);
    unavailable.getItem.mockImplementation(() => {
      throw new Error("storage disabled");
    });
    unavailable.setItem.mockImplementation(() => {
      throw new Error("storage disabled");
    });

    expect(loadCardBackDesign(unavailable.storage, "preference")).toBe("deco");
    expect(() => {
      saveCardBackDesign(unavailable.storage, "preference", "deco");
    }).not.toThrow();
  });
});
