// tsc emits JS but not the raster assets that `new URL(..., import.meta.url)`
// resolves against, so dist/ would serve 404s to any consumer that resolves
// @table-top-poker/ui-shared through its package `main` rather than the vite
// source alias. See docs/design/card-backs.md.
import { cp } from "node:fs/promises";
import { join } from "node:path";

const pkg = join(import.meta.dirname, "..", "packages", "ui-shared");

await cp(join(pkg, "src", "card-backs"), join(pkg, "dist", "card-backs"), {
  recursive: true,
});
