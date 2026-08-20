const STORAGE_KEY = 'data-room:public-share-token';
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

    sessionStorage.setItem(STORAGE_KEY, token);
    return token;
  }

  const storedToken = sessionStorage.getItem(STORAGE_KEY);
  if (!isValidPublicShareToken(storedToken)) {
    clearPublicShareToken();
    return null;
  }

  return storedToken;
}

export function clearPublicShareToken(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
