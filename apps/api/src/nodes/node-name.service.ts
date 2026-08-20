export function normalizedNodeName(name: string): string {
  return name.toLocaleLowerCase('en-US');
}

export function suffixedNodeName(name: string, attempt: number): string {
  const suffix = ` (${attempt})`;
  return `${name.slice(0, Math.max(1, 120 - suffix.length))}${suffix}`;
}
