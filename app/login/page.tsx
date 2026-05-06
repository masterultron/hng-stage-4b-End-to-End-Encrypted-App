'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { login } from '@/lib/api';
import { saveTokens, saveUser } from '@/lib/tokens';
import { unwrapPrivateKey } from '@/lib/crypto';
import { storePrivateKey, storeWrappedKeyIV, getWrappedKeyIV } from '@/lib/storage';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [debugLog, setDebugLog] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stashedDebug = sessionStorage.getItem('login_debug');
    if (stashedDebug) {
      setDebugLog(stashedDebug);
      sessionStorage.removeItem('login_debug');
    }
  }, []);

  const stashDebug = (msg: string) => {
    const existing = sessionStorage.getItem('login_debug') || '';
    sessionStorage.setItem('login_debug', existing + '\n' + msg);
    console.log('[LOGIN]', msg);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDebugLog('');
    sessionStorage.removeItem('login_debug');
    setLoading(true);

    try {
      stashDebug(`Step 1: calling login API with username="${username}"`);
      const res = await login({ username, password });
      stashDebug(`Step 1 OK. Response keys: ${Object.keys(res || {}).join(', ')}`);

      if (!res?.access_token || !res?.refresh_token) {
        throw new Error('Login response missing access_token or refresh_token');
      }
      if (!res?.user?.id) {
        throw new Error('Login response missing user.id');
      }

      saveTokens(res.access_token, res.refresh_token);
      saveUser({
        id: res.user.id,
        username: res.user.username,
        public_key: res.user.public_key,
      });

      const wrappedPrivateKey = res.user?.wrapped_private_key ?? res.wrapped_private_key;
      const pbkdf2SaltB64 = res.user?.pbkdf2_salt ?? res.pbkdf2_salt;
      let iv = res.user?.wrapped_key_iv ?? res.wrapped_key_iv;

      if (!iv) {
        try {
          iv = await getWrappedKeyIV(res.user.id);
        } catch {}
      }

      if (!wrappedPrivateKey || !pbkdf2SaltB64 || !iv) {
        throw new Error(
          !iv
            ? 'Cannot decrypt your keys on this device. Please log in from the browser where you registered.'
            : 'Server did not return wrapped key material.'
        );
      }

      const salt = Uint8Array.from(atob(pbkdf2SaltB64), (c) => c.charCodeAt(0));
      const privateKey = await unwrapPrivateKey(wrappedPrivateKey, iv, password, salt);

      await storePrivateKey(res.user.id, privateKey);
      await storeWrappedKeyIV(res.user.id, iv);

      sessionStorage.removeItem('login_debug');
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err: any) {
      const data = err?.response?.data;
      const msg = data?.message || data?.detail || err?.message || 'Login failed.';
      stashDebug(`ERROR: ${msg}`);
      toast.error(msg);
      console.error('[LOGIN ERROR]', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Lock className="w-7 h-7 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold text-white">WhisperBox</h1>
          <p className="text-gray-400 text-sm mt-1">End-to-end encrypted messaging</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <h2 className="text-lg font-semibold text-white mb-6">Welcome back</h2>

          {debugLog && (
            <details className="mb-4 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-xs text-gray-300">
              <summary className="cursor-pointer text-gray-400">Debug log</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all">{debugLog}</pre>
            </details>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="yourname"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 pr-10 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm shadow-sm"
            >
              {loading ? 'Decrypting keys...' : 'Log in'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            New to WhisperBox?{' '}
            <Link href="/register" className="text-indigo-400 hover:text-indigo-300 transition-colors">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}