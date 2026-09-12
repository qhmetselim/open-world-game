/** Development/test assertion; deliberately opt-in rather than a production per-body traversal. */
export function assertFinitePhysics(label: string, values: readonly number[]): void {
  if (!values.every(Number.isFinite)) throw new Error(`Non-finite physics state: ${label}`);
}
