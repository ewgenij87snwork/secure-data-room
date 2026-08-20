const STORAGE_KEY = 'data-room:public-share-token';
const GENERATION_KEY = 'data-room:public-share-generation';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function isValidPublicShareToken(value: string | null): value is string {
  return value !== null && TOKEN_PATTERN.test(value) && /[AEIMQUYcgkosw048]$/.test(value);
}

export function capturePublicShareToken(location: Location = window.location): string | null {
  const token = new URLSearchParams(location.hash.slice(1)).get('token');

  if (token !== null) {
    window.history.replaceState(null, '', `${location.pathname}${location.search}`);

    if (!isValidPublicShareToken(token)) {
      clearPublicShareToken();
      return null;
    }

    const previous = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.setItem(STORAGE_KEY, token);
    if (previous !== token) sessionStorage.setItem(GENERATION_KEY, crypto.randomUUID());
    return token;
  }

  const storedToken = sessionStorage.getItem(STORAGE_KEY);
  if (!isValidPublicShareToken(storedToken)) {
    clearPublicShareToken();
    return null;
  }

  if (!sessionStorage.getItem(GENERATION_KEY))
    sessionStorage.setItem(GENERATION_KEY, crypto.randomUUID());

  return storedToken;
}

export function clearPublicShareToken(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(GENERATION_KEY);
}

export function publicShareSessionGeneration(): string | null {
  return sessionStorage.getItem(GENERATION_KEY);
}
