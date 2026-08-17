export function must<T>(
  value: T | null | undefined,
  message = "expected a value",
): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}
