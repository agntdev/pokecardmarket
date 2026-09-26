/** One clock seam for expiry, receipts, and record timestamps. */
export function now(): number { return Date.now(); }

export function recordId(prefix: string, actor: number | undefined): string {
  return `${prefix}-${actor ?? "user"}-${now()}`;
}
