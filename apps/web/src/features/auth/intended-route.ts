export function isSafeIntendedRoute(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return false;
  }
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || decoded.includes('\\')) {
      return false;
    }
    const parsed = new URL(value, window.location.origin);
    return (
      parsed.origin === window.location.origin && !parsed.pathname.startsWith('/auth/callback')
    );
  } catch {
    return false;
  }
}

export function getSafeIntendedRoute(value: string | null): string {
  return value && isSafeIntendedRoute(value) ? value : '/workspace';
}
