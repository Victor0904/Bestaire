import { describe, it, expect } from 'vitest';
import { createECDH, createPublicKey, verify, randomBytes } from 'node:crypto';
// @ts-expect-error bibliothèque de référence sans types
import ece from 'http_ece';
import { encrypt, vapidAuth, sendPush, b64u } from '../../supabase/functions/_shared/webpush';

// Téléphone simulé : paire de clés du navigateur + secret d'authentification
function phone() {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, auth, sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', p256dh: b64u.enc(new Uint8Array(ecdh.getPublicKey())), auth: b64u.enc(new Uint8Array(auth)) } };
}
function vapidKeys() {
  const e = createECDH('prime256v1'); e.generateKeys();
  return { publicKey: b64u.enc(new Uint8Array(e.getPublicKey())), privateKey: b64u.enc(new Uint8Array(e.getPrivateKey())), subject: 'https://victor0904.github.io/Bestiaire/' };
}

describe('Web Push (RFC 8291 / 8292)', () => {
  it('le message chiffré est déchiffré par la bibliothèque de référence', async () => {
    const p = phone();
    const msg = JSON.stringify({ title: 'Enchère dépassée', body: 'Quelqu’un a proposé 120 plumes pour Lynx boréal.', tab: 'market' });
    const body = await encrypt(p.sub, new TextEncoder().encode(msg));
    const clear = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: p.ecdh, authSecret: p.auth });
    expect(clear.toString('utf8')).toBe(msg);
  });
  it('chaque envoi utilise une clé et un sel différents', async () => {
    const p = phone(); const m = new TextEncoder().encode('x');
    const a = await encrypt(p.sub, m), b = await encrypt(p.sub, m);
    expect(b64u.enc(a.slice(0, 16))).not.toBe(b64u.enc(b.slice(0, 16)));
    expect(b64u.enc(a.slice(21, 86))).not.toBe(b64u.enc(b.slice(21, 86)));
  });
  it('jeton VAPID valide (ES256), audience = service push, expiration 12 h', async () => {
    const v = vapidKeys(); const now = 1_790_000_000;
    const h = await vapidAuth('https://fcm.googleapis.com/fcm/send/abc', v, now);
    const [, t, k] = h.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(v.publicKey);
    const [head, body, sig] = t.split('.');
    const claims = JSON.parse(Buffer.from(b64u.dec(body)).toString());
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: now + 43200, sub: v.subject });
    const pub = b64u.dec(v.publicKey);
    const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33)) }, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(b64u.dec(sig)))).toBe(true);
  });
  it('requête envoyée au service push avec les bons en-têtes', async () => {
    const p = phone(); const v = vapidKeys(); let seen: RequestInit | null = null; let url = '';
    const code = await sendPush(p.sub, { title: 'Pellicules rechargées' }, v, (async (u: string, init: RequestInit) => { url = u; seen = init; return new Response(null, { status: 201 }) }) as unknown as typeof fetch);
    expect(code).toBe(201); expect(url).toBe(p.sub.endpoint);
    const h = (seen as unknown as RequestInit).headers as Record<string, string>;
    expect(h['Content-Encoding']).toBe('aes128gcm'); expect(h.TTL).toBe('86400'); expect(h.Authorization).toMatch(/^vapid t=/);
    const clear = ece.decrypt(Buffer.from((seen as unknown as RequestInit).body as Uint8Array), { version: 'aes128gcm', privateKey: p.ecdh, authSecret: p.auth });
    expect(JSON.parse(clear.toString()).title).toBe('Pellicules rechargées');
  });
});
