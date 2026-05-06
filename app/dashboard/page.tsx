'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, getAccessToken, clearSession, getRefreshToken } from '@/lib/tokens';
import { getPrivateKey } from '@/lib/storage';
import { toast } from 'sonner';
import {
  getConversations,
  getMessages,
  sendMessageREST,
  searchUsers,
  getUserPublicKey,
  logout,
} from '@/lib/api';
import { encryptMessage, decryptMessage } from '@/lib/crypto';

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  ciphertext: string;
  iv: string;
  encrypted_aes_key_for_recipient: string;
  encrypted_aes_key_for_sender: string;
  created_at: string;
  decrypted?: string;
}

interface Conversation {
  user_id: string;
  username: string;
  public_key: string;
  last_message_at: string;
}

interface User {
  id: string;
  username: string;
  public_key: string;
}

// Reusable Lock Icon Component for clean code
const LockIcon = ({ className }: { className?: string }) => (
  <svg className={className || "w-4 h-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [mounted, setMounted] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hydration guard + auth check
  useEffect(() => {
    setMounted(true);
    const token = getAccessToken();
    const currentUser = getUser();
    if (!token || !currentUser) {
      router.replace('/login');
      return;
    }
    setUser(currentUser);
  }, [router]);

  // Load private key from IndexedDB
  useEffect(() => {
    if (!user) return;
    getPrivateKey(user.id).then(key => {
      if (key) setPrivateKey(key);
    });
  }, [user]);

  // Load conversations
  useEffect(() => {
    if (!user) return;
    getConversations()
      .then(data => setConversations(data.conversations || []))
      .catch(console.error);
  }, [user]);

  // WebSocket setup
  useEffect(() => {
    if (!user || !privateKey) return;
    const token = getAccessToken();
    if (!token) return;

    const ws = new WebSocket(`wss://whisperbox.koyeb.app/ws?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = async (event) => {
      try {
        const frame = JSON.parse(event.data);
        if (frame.type === 'message.receive' && privateKey) {
          const msg: Message = frame.data;
          const isForMe = msg.recipient_id === user.id;
          const encKey = isForMe
            ? msg.encrypted_aes_key_for_recipient
            : msg.encrypted_aes_key_for_sender;

          try {
            const decrypted = await decryptMessage(msg.ciphertext, msg.iv, encKey, privateKey);
            const decorated = { ...msg, decrypted };
            setMessages(prev => {
              const inActive =
                msg.sender_id === activeConv?.user_id ||
                msg.recipient_id === activeConv?.user_id;
              return inActive ? [...prev, decorated] : prev;
            });
            getConversations()
              .then(data => setConversations(data.conversations || []))
              .catch(console.error);
          } catch {
            setMessages(prev => [...prev, { ...msg, decrypted: '[Failed to decrypt]' }]);
            toast.error('Could not decrypt a message');
          }
        }
      } catch {
        console.error('Failed to parse WebSocket message');
      }
    };

    ws.onerror = () => console.error('WebSocket error');

    return () => {
      ws.close();
    };
  }, [user, privateKey, activeConv]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load messages when conversation selected
  const openConversation = async (conv: Conversation) => {
    setActiveConv(conv);
    setLoading(true);
    setMessages([]);

    try {
      const data = await getMessages(conv.user_id);
      const raw: Message[] = data.messages || [];

      if (!privateKey) {
        setMessages(raw.map(m => ({ ...m, decrypted: '[Private key not available]' })));
        return;
      }

      const decrypted = await Promise.all(
        raw.map(async (msg) => {
          const isForMe = msg.recipient_id === user?.id;
          const encKey = isForMe
            ? msg.encrypted_aes_key_for_recipient
            : msg.encrypted_aes_key_for_sender;
          try {
            const text = await decryptMessage(msg.ciphertext, msg.iv, encKey, privateKey);
            return { ...msg, decrypted: text };
          } catch {
            return { ...msg, decrypted: '[Failed to decrypt]' };
          }
        })
      );

      setMessages(decrypted);
    } catch (err) {
      console.error('Failed to load messages', err);
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || !activeConv || !user || !privateKey) return;
    setSending(true);

    try {
      const recipientPubKey = activeConv.public_key || await getUserPublicKey(activeConv.user_id);
      const encrypted = await encryptMessage(input.trim(), recipientPubKey, user.public_key);

      const payload = {
        recipient_id: activeConv.user_id,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        encrypted_aes_key_for_recipient: encrypted.encryptedAESKeyForRecipient,
        encrypted_aes_key_for_sender: encrypted.encryptedAESKeyForSender,
      };

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'message.send', data: payload }));
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          sender_id: user.id,
          recipient_id: activeConv.user_id,
          decrypted: input.trim(),
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          encrypted_aes_key_for_recipient: encrypted.encryptedAESKeyForRecipient,
          encrypted_aes_key_for_sender: encrypted.encryptedAESKeyForSender,
          created_at: new Date().toISOString(),
        }]);
      } else {
        await sendMessageREST(payload);
      }

      setInput('');
    } catch (err) {
      console.error('Send failed', err);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  // Search users
  useEffect(() => {
    if (!searchQ.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const data = await searchUsers(searchQ);
        const arr = Array.isArray(data) ? data : (data?.users || data?.results || []);
        setSearchResults(arr.filter((u: any) => u.id !== user?.id));
      } catch (err: any) {
        console.error('[SEARCH] failed:', err.response?.status, err.response?.data);
        toast.error('Search failed');
        setSearchResults([]);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQ, user?.id]);

  // Start new conversation
  const startChat = async (found: any) => {
    const pubKey = await getUserPublicKey(found.id);
    const conv: Conversation = {
      user_id: found.id,
      username: found.username,
      public_key: pubKey,
      last_message_at: '',
    };
    setSearchQ('');
    setSearchResults([]);
    setActiveConv(conv);
    setMessages([]);
  };

  // Logout
  const handleLogout = async () => {
    try {
      const rt = getRefreshToken();
      if (rt) await logout(rt);
    } finally {
      clearSession();
      router.replace('/login');
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Prevent SSR flash
  if (!mounted) return null;

  return (
    <div className="h-screen bg-gray-950 flex overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600/20 text-indigo-500 rounded-lg flex items-center justify-center">
                <LockIcon className="w-4 h-4" />
              </div>
              <span className="font-semibold text-white text-sm">WhisperBox</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              Sign out
            </button>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
              {user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <span className="text-sm text-gray-300">{user?.username}</span>
            <span className="ml-auto text-xs text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
              E2EE
            </span>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Find people..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden z-10 shadow-xl">
                {searchResults.map(u => (
                  <button
                    key={u.id}
                    onClick={() => startChat(u)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-700 text-sm text-white transition-colors flex items-center gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold">
                      {u.username[0].toUpperCase()}
                    </div>
                    {u.username}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-600 text-sm mt-8">
              Search for someone to start a conversation
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.user_id}
                onClick={() => openConversation(conv)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-800 transition-colors flex items-center gap-3 border-b border-gray-800/50 ${
                  activeConv?.user_id === conv.user_id ? 'bg-gray-800' : ''
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {conv.username[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{conv.username}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <LockIcon className="w-3 h-3 text-gray-500" />
                    Encrypted
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Chat Area ────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center text-center px-4 bg-gray-950">
            <div className="max-w-md">
              <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-gray-800 text-indigo-500 shadow-sm">
                <LockIcon className="w-8 h-8" />
              </div>
              <h2 className="text-white font-medium text-lg mb-2">
                End-to-End Encrypted Messaging
              </h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                Select a conversation or search for someone to start chatting.
                All messages are encrypted before leaving your device.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-3 shadow-sm z-10">
              <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold">
                {activeConv.username[0].toUpperCase()}
              </div>
              <div>
                <p className="text-white font-medium text-sm">{activeConv.username}</p>
                <p className="text-xs text-green-400 flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block animate-pulse" />
                  End-to-end encrypted
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-950">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-600 text-sm">No messages yet. Say hello!</p>
                </div>
              ) : (
                messages.map(msg => {
                  const isMine = msg.sender_id === user?.id;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                        isMine
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-gray-800 border border-gray-700 text-gray-100 rounded-bl-sm'
                      }`}>
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.decrypted}</p>
                        <div className={`text-[10px] mt-1.5 flex items-center justify-end gap-1 ${
                          isMine ? 'text-indigo-200' : 'text-gray-500'
                        }`}>
                          {msg.created_at ? formatTime(msg.created_at) : 'now'}
                          <LockIcon className="w-2.5 h-2.5 opacity-70" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="bg-gray-900 border-t border-gray-800 p-4">
              {!privateKey && (
                <div className="flex items-center justify-center gap-2 text-amber-400 text-xs mb-3 bg-amber-400/10 py-2 rounded-lg border border-amber-400/20">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Private key not loaded. Please log out and log back in.</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Message (encrypted end-to-end)"
                  disabled={!privateKey || sending}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending || !privateKey}
                  className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 shadow-sm"
                >
                  {sending ? (
                    <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}