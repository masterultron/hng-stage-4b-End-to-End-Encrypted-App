// lib/crypto.ts
// Web Crypto API — AES-GCM + RSA-OAEP E2EE implementation

// ─── Key Generation ───────────────────────────────────────────────────────────

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// ─── Key Export/Import ────────────────────────────────────────────────────────

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const buf = await crypto.subtle.exportKey('spki', key);
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export async function exportPrivateKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('pkcs8', key);
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey(
    'spki',
    buf,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
}

export async function importPrivateKey(buf: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    buf,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
}

// ─── Password-Derived Key (PBKDF2) ────────────────────────────────────────────

export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
{
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource, 
      iterations: 310000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

// ─── Private Key Wrapping (encrypt with password-derived key) ─────────────────

export async function wrapPrivateKey(
  privateKey: CryptoKey,
  password: string,
  salt: Uint8Array
): Promise<{ wrappedKey: string; iv: string }> {
  const derivedKey = await deriveKeyFromPassword(password, salt);
  const privateKeyBuf = await exportPrivateKey(privateKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    privateKeyBuf
  );

  return {
    wrappedKey: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

export async function unwrapPrivateKey(
  wrappedKeyB64: string,
  ivB64: string,
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const derivedKey = await deriveKeyFromPassword(password, salt);

  const wrappedKeyBuf = Uint8Array.from(atob(wrappedKeyB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    wrappedKeyBuf
  );

  return importPrivateKey(decrypted);
}

// ─── Message Encryption ───────────────────────────────────────────────────────

export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyB64: string,
  senderPublicKeyB64: string
): Promise<{
  ciphertext: string;
  iv: string;
  encryptedAESKeyForRecipient: string;
  encryptedAESKeyForSender: string;
}> {
  const enc = new TextEncoder();
  const aesKey = await generateAESKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt message with AES-GCM
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    enc.encode(plaintext)
  );

  // Export raw AES key
  const rawAES = await crypto.subtle.exportKey('raw', aesKey);

  // Encrypt AES key for recipient
  const recipientPubKey = await importPublicKey(recipientPublicKeyB64);
  const encForRecipient = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    recipientPubKey,
    rawAES
  );

  // Encrypt AES key for sender (so sender can read own messages)
  const senderPubKey = await importPublicKey(senderPublicKeyB64);
  const encForSender = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    senderPubKey,
    rawAES
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuf))),
    iv: btoa(String.fromCharCode(...iv)),
    encryptedAESKeyForRecipient: btoa(String.fromCharCode(...new Uint8Array(encForRecipient))),
    encryptedAESKeyForSender: btoa(String.fromCharCode(...new Uint8Array(encForSender))),
  };
}

export async function decryptMessage(
  ciphertextB64: string,
  ivB64: string,
  encryptedAESKeyB64: string,
  privateKey: CryptoKey
): Promise<string> {
  // Decrypt AES key with private key
  const encAESBuf = Uint8Array.from(atob(encryptedAESKeyB64), c => c.charCodeAt(0));
  const rawAES = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encAESBuf
  );

  // Import AES key
  const aesKey = await crypto.subtle.importKey(
    'raw',
    rawAES,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // Decrypt message
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const ciphertextBuf = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertextBuf
  );

  return new TextDecoder().decode(plainBuf);
}