/*
|--------------------------------------------------------------------------
| Phone Display
|--------------------------------------------------------------------------
|
| Keeps every customer and store phone input in the same US display format:
| (123) 456 - 7890
|
*/

export function formatPhoneNumber(
  value: string
): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} - ${digits.slice(6)}`;
}
