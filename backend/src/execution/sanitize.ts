export function sanitizeExecutionText(value: string): string {
  let output = ''
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) output += character
  }
  return output
}
