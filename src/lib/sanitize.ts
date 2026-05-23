export function cleanText(value: unknown, maxLength = 1000) {
  if (typeof value !== 'string') return undefined;
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength) || undefined;
}
