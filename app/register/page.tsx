'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const keyPair = await generateKeyPair();
      const publicKeyB64 = await exportPublicKey(keyPair.publicKey);
      const salt = generateSalt();
      const { wrappedKey, iv } = await wrapPrivateKey(keyPair.privateKey, password, salt);

      const res = await register({
        username,
        display_name: displayName,
        password,
        public_key: publicKeyB64,
        wrapped_private_key: wrappedKey,
        pbkdf2_salt: btoa(String.fromCharCode(...salt)),
        wrapped_key_iv: iv,
      });

      saveTokens(res.access_token, res.refresh_token);
      saveUser({ id: res.user.id, username: res.user.username, public_key: publicKeyB64 });

      await storePrivateKey(res.user.id, keyPair.privateKey);
      await storeWrappedKeyIV(res.user.id, iv);

      toast.success('Account created!');
      router.push('/dashboard');
    } catch (err: any) {
      const data = err.response?.data;
      let msg = data?.message || data?.detail || 'Registration failed. Please try again.';
      // Format FastAPI 422 validation errors nicely
      if (Array.isArray(data?.detail)) {
        msg = data.detail.map((d: any) => `${d.loc?.slice(1).join('.')}: ${d.msg}`).join('\n');
      }
      toast.error(msg);
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
          <h2 className="text-lg font-semibold text-white mb-6">Create account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="abdul"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                placeholder="Your Name"
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
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                Used to encrypt your private key — never sent to the server.
              </p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm shadow-sm"
            >
              {loading ? 'Generating keys & registering...' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
              Log in
            </Link>
          </p>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-xs text-gray-600 mt-5">
          <Lock size={12} className="shrink-0" />
          <p>Keys generated locally — server never sees your private key</p>
        </div>
      </div>
    </div>
  );
}