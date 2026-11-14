/**
 * Removes ASCII control characters while preserving all printable Unicode.
 * @param value - Input value.
 * @returns The input without ASCII control characters.
 */
export function stripControlChars(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x20) out += char;
  }
  return out;
}
