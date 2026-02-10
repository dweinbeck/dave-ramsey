/**
 * Formats integer cents as a dollar string.
 * Examples: 1050 -> "$10.50", 0 -> "$0.00", 500 -> "$5.00"
 *
 * This is the ONLY place dollars appear. All storage and computation uses cents.
 */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
