'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  generateKeyPair,
  exportPublicKey,
  wrapPrivateKey,
  generateSalt,
} from '@/lib/crypto';
import { register } from '@/lib/api';
import { saveTokens, saveUser } from '@/lib/tokens';
import { storePrivateKey, storeWrappedKeyIV } from '@/lib/storage';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
const [displayName, setDisplayName] = useState('');
const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Generate RSA key pair
      const keyPair = await generateKeyPair();

      // 2. Export public key
      const publicKeyB64 = await exportPublicKey(keyPair.publicKey);

      // 3. Generate PBKDF2 salt and wrap private key
      const salt = generateSalt();
      const { wrappedKey, iv } = await wrapPrivateKey(keyPair.privateKey, password, salt);

      console.log('Sending to API:', {
  username,
  password,
  public_key: publicKeyB64,
  wrapped_private_key: wrappedKey,
  pbkdf2_salt: btoa(String.fromCharCode(...salt)),
  wrapped_key_iv: iv,
});
const res = await register({
  username,
  display_name: displayName,
  password,
  public_key: publicKeyB64,
  wrapped_private_key: wrappedKey,
  pbkdf2_salt: btoa(String.fromCharCode(...salt)),
  wrapped_key_iv: iv,
});

      // 5. Save tokens and user
      saveTokens(res.access_token, res.refresh_token);
      saveUser({ id: res.user.id, username: res.user.username, public_key: publicKeyB64 });

      // 6. Store private key in IndexedDB
      await storePrivateKey(res.user.id, keyPair.privateKey);
      await storeWrappedKeyIV(res.user.id, iv);

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-white">WhisperBox</h1>
          <p className="text-gray-400 text-sm mt-1">End-to-end encrypted messaging</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <h2 className="text-lg font-semibold text-white mb-6">Create account</h2>

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
                placeholder="abdul"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <div>
  <label className="block text-sm font-medium text-gray-300 mb-1.5">
    Display Name
  </label>
  <input
    type="text"
    value={displayName}
    onChange={e => setDisplayName(e.target.value)}
    required
    placeholder="Your Name"
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
              <p className="text-xs text-gray-500 mt-1.5">
                Used to encrypt your private key — never sent to the server
              </p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              {loading ? 'Generating keys & registering...' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
              Log in
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          🔒 Keys generated locally — server never sees your private key
        </p>
      </div>
    </div>
    
  );
}