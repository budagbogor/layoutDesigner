/**
 * Decimal Input Parser & Sanitizer
 * 
 * Supports both standard dot format ("4.5", "12.25") and Indonesian comma format ("4,5", "12,25").
 * Strictly rejects malformed numeric strings, NaN, Infinity, and non-numeric characters.
 */

/**
 * Parses a numeric or string input into a valid floating-point number.
 * 
 * @param value The raw input string or number
 * @returns Parsed number or null if invalid
 */
export function parseDecimalInput(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) {
      return null;
    }
    return value;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Normalize comma to dot
  const normalized = trimmed.replace(',', '.');

  // Verify that there is at most one dot and valid numeric characters
  // Allows optional leading negative sign (e.g. for coordinates), digits, and single dot
  const numericPattern = /^-?\d+(\.\d+)?$/;
  if (!numericPattern.test(normalized)) {
    return null;
  }

  const parsed = parseFloat(normalized);
  if (isNaN(parsed) || !isFinite(parsed)) {
    return null;
  }

  return parsed;
}

/**
 * Checks whether a string represents a valid decimal or integer input.
 */
export function isValidDecimalInput(value: string): boolean {
  return parseDecimalInput(value) !== null;
}
