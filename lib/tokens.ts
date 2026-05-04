// lib/tokens.ts
const ACCESS_TOKEN_KEY = 'wb_access_token';
const REFRESH_TOKEN_KEY = 'wb_refresh_token';
const USER_KEY = 'wb_user';

const isBrowser = typeof window !== 'undefined';

export function saveTokens(accessToken: string, refreshToken: string) {
  if (!isBrowser) return;
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function getAccessToken(): string | null {
  if (!isBrowser) return null;
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (!isBrowser) return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveUser(user: { id: string; username: string; public_key: string }) {
  if (!isBrowser) return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): { id: string; username: string; public_key: string } | null {
  if (!isBrowser) return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  if (!isBrowser) return;
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}