// What an admin access code must look like (D-032). Safe in the browser, so forms can say what's wrong as you type.

export const CODE_MIN = 8;
export const CODE_MAX = 32;

/** Why a new code isn't acceptable, or null. Digits only, 8 to 32, not all one digit or a simple run. */
export function codeProblem(code: string): string | null {
  if (!/^\d+$/.test(code)) return "Use digits only.";
  if (code.length < CODE_MIN) return `Use at least ${CODE_MIN} digits.`;
  if (code.length > CODE_MAX) return `Use at most ${CODE_MAX} digits.`;
  if (/^(\d)\1+$/.test(code)) return "Don't repeat one digit.";
  if ("01234567890123456789".includes(code) || "98765432109876543210".includes(code)) return "Don't use a simple run like 12345678.";
  return null;
}
