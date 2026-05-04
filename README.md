# WhisperBox — End-to-End Encrypted Messaging

A secure messaging app where the server never sees plaintext. All encryption happens on your device.

## Architecture
Client (Browser)
├── Key Generation (Web Crypto API)
├── Message Encryption (AES-GCM)
├── Key Exchange (RSA-OAEP)
└── Private Key Storage (IndexedDB)
Server (whisperbox.koyeb.app)
├── Stores only ciphertext blobs
├── Never sees plaintext messages
├── Never sees private keys
└── Manages user identities + auth

## Encryption Flow

1. **Registration**: RSA-2048 key pair generated in browser. Public key sent to server. Private key wrapped with AES-GCM using PBKDF2-derived key from password. Wrapped private key + salt stored on server.

2. **Login**: Server returns wrapped private key + salt. Client derives key from password, unwraps private key. Private key stored in IndexedDB only.

3. **Sending a message**:
   - Generate random AES-256-GCM key
   - Encrypt plaintext with AES key
   - Encrypt AES key with recipient's RSA public key
   - Encrypt AES key with sender's RSA public key (to read own messages)
   - Send ciphertext + both encrypted AES keys to server

4. **Receiving a message**:
   - Retrieve encrypted AES key (recipient version)
   - Decrypt AES key with own RSA private key
   - Decrypt message with AES key

## Key Management
- Private keys: Stored in IndexedDB (never localStorage, never server)
- Public keys: Stored on server for key exchange
- Password: Used only for PBKDF2 key derivation, never sent to server

## Setup
```bash
npm install
npm run dev
```

## Security Trade-offs
- Password lost = private key lost (no recovery)
- Keys are per-device (no cross-device sync)
- No forward secrecy (static RSA keys)

## Known Limitations
- No message deletion
- No read receipts
- Single device per account