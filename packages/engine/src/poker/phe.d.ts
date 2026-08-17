declare module "phe" {
  const phe: {
    cardCode(rank: string, suit: string): number;
    evaluateCardCodes(codes: readonly number[]): number;
  };
  export default phe;
}
