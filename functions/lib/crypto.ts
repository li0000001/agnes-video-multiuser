function b64encode(buf: Uint8Array) {
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s);
}

function b64decode(str: string) {
  const bin = atob(str);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

function hexToBuf(hex: string) {
  const h = hex.replace(/[^0-9a-fA-F]/g, '');
  const buf = new Uint8Array(h.length / 2);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return buf;
}

function maskKey(k: string) {
  if (!k) return '';
  if (k.length <= 10) return k.slice(0, 4) + '***';
  return k.slice(0, 6) + '...' + k.slice(-4);
}

export async function encryptApiKey(plain: string, encKeyHex: string) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', hexToBuf(encKeyHex), 'AES-GCM', false, ['encrypt']);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return {
    key_enc: b64encode(combined),
    key_mask: maskKey(plain)
  };
}

export async function decryptApiKey(keyEnc: string, encKeyHex: string) {
  const combined = b64decode(keyEnc);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const key = await crypto.subtle.importKey('raw', hexToBuf(encKeyHex), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plain);
}
