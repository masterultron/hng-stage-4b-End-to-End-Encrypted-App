// lib/api.ts
// API client with automatic token refresh

import axios from 'axios';
import { getAccessToken, getRefreshToken, saveTokens, clearSession } from './tokens';

const BASE = 'https://whisperbox.koyeb.app';

export const api = axios.create({ baseURL: BASE });

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = getRefreshToken();
        const res = await axios.post(`${BASE}/auth/refresh`, { refresh_token: refreshToken });
        const { access_token, refresh_token } = res.data;
        saveTokens(access_token, refresh_token);
        original.headers.Authorization = `Bearer ${access_token}`;
        return api(original);
      } catch {
        clearSession();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function register(payload: {
  username: string;
  password: string;
  public_key: string;
  wrapped_private_key: string;
  pbkdf2_salt: string;
  wrapped_key_iv: string;
}) {
  const res = await api.post('/auth/register', payload);
  return res.data;
}

export async function login(payload: { username: string; password: string }) {
  const res = await api.post('/auth/login', payload);
  return res.data;
}

export async function logout(refreshToken: string) {
  await api.post('/auth/logout', { refresh_token: refreshToken });
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function searchUsers(q: string) {
  const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
  return res.data;
}

export async function getUserPublicKey(userId: string): Promise<string> {
  const res = await api.get(`/users/${userId}/public-key`);
  return res.data.public_key;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getConversations() {
  const res = await api.get('/conversations');
  return res.data;
}

export async function getMessages(userId: string, page = 1) {
  const res = await api.get(`/conversations/${userId}/messages?page=${page}`);
  return res.data;
}

export async function sendMessageREST(payload: {
  recipient_id: string;
  ciphertext: string;
  iv: string;
  encrypted_aes_key_for_recipient: string;
  encrypted_aes_key_for_sender: string;
}) {
  const res = await api.post('/messages', payload);
  return res.data;
}