import { signMessage } from './crypto';
import { bytesToHex, hexToBytes } from '../utils/hex';
import { stripTrailingSlash } from '../utils/url';

export type Entitlement = {
  tier: string;
  status: string;
  source: string;
  startsAtMs: number;
  endsAtMs?: number;
};

const authBase =
  process.env.EXPO_PUBLIC_AUTH_URL ??
  '';

const authPath = (path: string) => {
  if (!authBase) return path;
  return `${stripTrailingSlash(authBase)}${path}`;
};

const encodeAscii = (value: string): Uint8Array => {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i);
  }
  return bytes;
};

const buildAuthMessage = (challengeHex: string): Uint8Array => {
  const prefix = encodeAscii('nullspace-auth:');
  const challenge = hexToBytes(challengeHex);
  const out = new Uint8Array(prefix.length + challenge.length);
  out.set(prefix, 0);
  out.set(challenge, prefix.length);
  return out;
};

export async function fetchMobileEntitlements(publicKey: string): Promise<Entitlement[]> {
  if (!authBase) return [];
  const challengeRes = await fetch(authPath('/mobile/challenge'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey }),
  });
  if (!challengeRes.ok) {
    throw new Error('Challenge failed');
  }
  const challengePayload = await challengeRes.json() as { challengeId: string; challenge: string };
  const message = buildAuthMessage(challengePayload.challenge);
  const signature = await signMessage(message);
  const signatureHex = bytesToHex(signature);

  const entRes = await fetch(authPath('/mobile/entitlements'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey,
      signature: signatureHex,
      challengeId: challengePayload.challengeId,
    }),
  });
  if (!entRes.ok) {
    throw new Error('Entitlements fetch failed');
  }
  const data = await entRes.json() as { entitlements?: Entitlement[] };
  return Array.isArray(data.entitlements) ? data.entitlements : [];
}
