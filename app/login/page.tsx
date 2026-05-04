'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/api';
import { saveTokens, saveUser } from '@/lib/tokens';
import { unwrapPrivateKey, generateSalt } from '@/lib/crypto';
import { storePrivateKey, getWrappedKeyIV } from '@/lib/storage';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Login — server returns wrapped private key + salt
      const res = await login({ username, password });

      // 2. Save tokens and user
      saveTokens(res.access_token, res.refresh_token);
      saveUser({
        id: res.user.id,
        username: res.user.username,
        public_key: res.user.public_key,
      });

      // 3. Unwrap private key using password
      const salt = Uint8Array.from(atob(res.user.pbkdf2_salt), c => c.charCodeAt(0));
      const iv = res.user.wrapped_key_iv;
      const privateKey = await unwrapPrivateKey(
        res.user.wrapped_private_key,
        iv,
        password,
        salt
      );

      // 4. Store in IndexedDB
      await storePrivateKey(res.user.id, privateKey);

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid username or password.');
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
            <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
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
                onChange={e => setPassword(e.target.value)}
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