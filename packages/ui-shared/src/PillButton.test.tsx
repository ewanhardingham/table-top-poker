import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PillButton } from "./PillButton.js";

describe("PillButton", () => {
  it("renders its label", () => {
    const html = renderToStaticMarkup(<PillButton>Deal hand</PillButton>);
    expect(html).toContain("Deal hand");
  });

  it("defaults to a button type, so it never submits an enclosing form", () => {
    const html = renderToStaticMarkup(<PillButton>Create room</PillButton>);
    expect(html).toContain('type="button"');
  });

  it("applies the larger size's padding when size is lg", () => {
    const md = renderToStaticMarkup(<PillButton>Deal hand</PillButton>);
    const lg = renderToStaticMarkup(
      <PillButton size="lg">Create room</PillButton>,
    );
    expect(md).toContain("padding:17px 34px");
    expect(lg).toContain("padding:20px 44px");
  });

  it("lets a caller pass through standard button attributes", () => {
    const html = renderToStaticMarkup(
      <PillButton disabled>End session</PillButton>,
    );
    expect(html).toContain("disabled");
  });
});
