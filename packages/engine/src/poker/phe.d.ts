/**
 * Minimal ambient typing for the `phe` dev-only test oracle (issue #22).
 * `phe` ships no TypeScript types; only the members these tests use are
 * declared. Never imported from runtime code.
 */
declare module "phe" {
  const phe: {
    cardCode(rank: string, suit: string): number;
    evaluateCardCodes(codes: readonly number[]): number;
  };
  export default phe;
}
