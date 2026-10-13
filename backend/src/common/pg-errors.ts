/** True if `e` (or its cause, as wrapped by drizzle) is a Postgres unique violation. */
export function isUniqueViolation(e: unknown): boolean {
  const code = (x: unknown): string | undefined =>
    (x as { code?: string } | null)?.code;
  return (
    code(e) === '23505' ||
    code((e as { cause?: unknown } | null)?.cause) === '23505'
  );
}
