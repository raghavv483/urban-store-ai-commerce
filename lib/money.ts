/**
 * Money is stored and transported as integer paise. This module is the only
 * place it becomes a display string. Never do arithmetic on formatted output.
 */

export function paiseToRupees(paise: number): number {
  assertIntegerPaise(paise);
  return paise / 100;
}

export function formatPaise(paise: number): string {
  assertIntegerPaise(paise);
  const hasFraction = paise % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(paise / 100);
}

function assertIntegerPaise(paise: number): void {
  if (!Number.isInteger(paise)) {
    throw new Error(`Expected an integer paise amount, received ${paise}`);
  }
}
