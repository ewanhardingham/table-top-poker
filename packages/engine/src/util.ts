/** Asserts a possibly-absent lookup is present — used in place of `!` under `noUncheckedIndexedAccess`. */
export function must<T>(
  value: T | null | undefined,
  message = "expected a value",
): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}
