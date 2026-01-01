const opsBase =
  (import.meta.env.VITE_OPS_URL as string | undefined)?.replace(/\/$/, '') ??
  (import.meta.env.VITE_ANALYTICS_URL as string | undefined)?.replace(/\/$/, '') ??
  '';

const REFERRAL_CODE_KEY = 'nullspace_referral_code';
const REFERRAL_CLAIMED_KEY = 'nullspace_referral_claimed';

const readStoredCode = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(REFERRAL_CODE_KEY);
  } catch {
    return null;
  }
};

const storeCode = (code: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REFERRAL_CODE_KEY, code);
  } catch {
    // ignore
  }
};

const markClaimed = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REFERRAL_CLAIMED_KEY, 'true');
  } catch {
    // ignore
  }
};

const isClaimed = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(REFERRAL_CLAIMED_KEY) === 'true';
  } catch {
    return false;
  }
};

const readPublicKey = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const key = window.localStorage.getItem('casino_public_key_hex');
    return key ? key.toLowerCase() : null;
  } catch {
    return null;
  }
};

const normalizeCode = (value: string): string => value.trim().toUpperCase();

export async function captureReferralFromSearch(search: string): Promise<void> {
  const params = new URLSearchParams(search);
  const raw = params.get('ref') || params.get('referral') || params.get('invite');
  if (raw) {
    storeCode(normalizeCode(raw));
  }
  await claimReferralIfReady();
}

export async function claimReferralIfReady(): Promise<void> {
  if (!opsBase) return;
  if (isClaimed()) return;
  const code = readStoredCode();
  if (!code) return;
  const publicKey = readPublicKey();
  if (!publicKey) return;

  try {
    const res = await fetch(`${opsBase}/referrals/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, publicKey }),
    });
    if (res.ok) {
      markClaimed();
    }
  } catch {
    // ignore network errors
  }
}
