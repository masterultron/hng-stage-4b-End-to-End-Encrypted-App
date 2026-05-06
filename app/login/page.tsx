'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/api';
import { saveTokens, saveUser } from '@/lib/tokens';
import { unwrapPrivateKey } from '@/lib/crypto';
import { storePrivateKey, storeWrappedKeyIV } from '@/lib/storage';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [debugLog, setDebugLog] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // On mount, restore any error/debug from a previous (refreshed) attempt
  useEffect(() => {
    const stashedError = sessionStorage.getItem('login_error');
    const stashedDebug = sessionStorage.getItem('login_debug');
    if (stashedError) {
      setError(stashedError);
      sessionStorage.removeItem('login_error');
    }
    if (stashedDebug) {
      setDebugLog(stashedDebug);
      sessionStorage.removeItem('login_debug');
    }
  }, []);

  // Persist a debug message that survives page refresh
  const stashDebug = (msg: string) => {
    const existing = sessionStorage.getItem('login_debug') || '';
    const next = existing + '\n' + msg;
    sessionStorage.setItem('login_debug', next);
    console.log('[LOGIN]', msg);
  };

  const stashError = (msg: string) => {
    sessionStorage.setItem('login_error', msg);
    setError(msg);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDebugLog('');
    sessionStorage.removeItem('login_error');
    sessionStorage.removeItem('login_debug');
    setLoading(true);

    try {
      stashDebug(`Step 1: calling login API with username="${username}"`);
      const res = await login({ username, password });
      stashDebug(`Step 1 OK. Response keys: ${Object.keys(res || {}).join(', ')}`);
      stashDebug(`Full response: ${JSON.stringify(res)}`);

      if (!res?.access_token || !res?.refresh_token) {
        throw new Error('Login response missing access_token or refresh_token');
      }
      if (!res?.user?.id) {
        throw new Error('Login response missing user.id');
      }

      stashDebug('Step 2: saving tokens + user');
      saveTokens(res.access_token, res.refresh_token);
      saveUser({
        id: res.user.id,
        username: res.user.username,
        public_key: res.user.public_key,
      });

      // Pull crypto fields from either nesting
      const wrappedPrivateKey =
        res.user?.wrapped_private_key ?? res.wrapped_private_key;
      const pbkdf2SaltB64 = res.user?.pbkdf2_salt ?? res.pbkdf2_salt;
      const iv = res.user?.wrapped_key_iv ?? res.wrapped_key_iv;

      stashDebug(
        `Step 3: crypto fields — wrappedPrivateKey=${!!wrappedPrivateKey}, salt=${!!pbkdf2SaltB64}, iv=${!!iv}`
      );

      if (!wrappedPrivateKey || !pbkdf2SaltB64 || !iv) {
        throw new Error(
          'Server did not return wrapped key material on login. The backend /auth/login response needs to include wrapped_private_key, pbkdf2_salt, and wrapped_key_iv.'
        );
      }

      stashDebug('Step 4: decoding salt and unwrapping private key');
      const salt = Uint8Array.from(atob(pbkdf2SaltB64), (c) => c.charCodeAt(0));
      const privateKey = await unwrapPrivateKey(
        wrappedPrivateKey,
        iv,
        password,
        salt
      );
      stashDebug('Step 4 OK: private key unwrapped');

      stashDebug('Step 5: storing private key in IndexedDB');
      await storePrivateKey(res.user.id, privateKey);
      await storeWrappedKeyIV(res.user.id, iv);
      stashDebug('Step 5 OK');

      // Clear debug since we're successful
      sessionStorage.removeItem('login_debug');
      router.push('/dashboard');
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      const msg =
        data?.message ||
        data?.detail ||
        err?.message ||
        'Login failed.';

      stashDebug(
        `ERROR: ${msg} | status=${status} | data=${JSON.stringify(data)}`
      );
      stashError(msg);
      console.error('[LOGIN ERROR]', err);
      console.error('[LOGIN ERROR response]', data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-white">WhisperBox</h1>
          <p className="text-gray-400 text-sm mt-1">End-to-end encrypted messaging</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <h2 className="text-lg font-semibold text-white mb-6">Welcome back</h2>

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3 mb-4 whitespace-pre-line">
              {error}
            </div>
          )}

          {debugLog && (
            <details className="mb-4 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-xs text-gray-300">
              <summary className="cursor-pointer text-gray-400">
                Debug log (click to expand)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all">{debugLog}</pre>
            </details>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="yourname"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              {loading ? 'Decrypting keys...' : 'Log in'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            New to WhisperBox?{' '}
            <Link href="/register" className="text-indigo-400 hover:text-indigo-300">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}