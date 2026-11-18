/** Diensten die in elke keuzelijst bovenaan staan, in deze volgorde. De rest volgt op code. */
export const PREFERRED_SHIFT_CODES = ["O", "A", "X", "XI", "IX", "V", "Z"];

const rank = (code: string) => {
  const i = PREFERRED_SHIFT_CODES.indexOf(code);
  return i === -1 ? PREFERRED_SHIFT_CODES.length : i;
};

/** Sorteert diensten voor keuzelijsten: eerst O, A, X, XI, IX, V, Z, daarna de rest op code. */
export function sortShiftTypes<T extends { code: string }>(types: T[]): T[] {
  return [...types].sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code, "nl"));
}
