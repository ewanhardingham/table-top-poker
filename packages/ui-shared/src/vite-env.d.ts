// ui-shared is compiled by tsc, not Vite, so it has no `vite/client` types.
// The one Vite-injected value it needs is `import.meta.env.BASE_URL` — the
// deploy base path ("/" in dev, "/table/" or "/player/" in a release build)
// that `webAudio.ts` prefixes onto its same-origin `sounds/` asset URLs. Vite
// statically replaces the reference when it bundles this package's dist into
// each client; this ambient declaration only satisfies the tsc typecheck.
interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
