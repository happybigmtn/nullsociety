import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getVaultStatusSync } from '../security/keyVault';
import { subscribeVault } from '../security/vaultRuntime';

type WalletPillProps = {
  rng?: number | bigint | string | null;
  vusdt?: number | bigint | string | null;
  credits?: number | bigint | string | null;
  creditsLocked?: number | bigint | string | null;
  pubkeyHex?: string | null;
  networkLabel?: string;
  networkStatus?: 'online' | 'offline';
  className?: string;
};

function formatInteger(value: number | bigint | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    return Math.floor(value).toLocaleString();
  }
  const raw = typeof value === 'bigint' ? value.toString() : value.trim();
  if (!raw) return '—';
  if (/^\d+$/.test(raw)) return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return raw;
}

function shortHex(hex: string, start = 10, end = 6): string {
  const s = hex.trim();
  if (s.length <= start + end + 1) return s;
  return `${s.slice(0, start)}…${s.slice(-end)}`;
}

export const WalletPill: React.FC<WalletPillProps> = ({
  rng,
  vusdt,
  credits,
  creditsLocked,
  pubkeyHex,
  networkLabel,
  networkStatus,
  className,
}) => {
  const [vaultStatus, setVaultStatus] = useState(() => getVaultStatusSync());

  useEffect(() => subscribeVault(() => setVaultStatus(getVaultStatusSync())), []);

  const vault = useMemo(() => {
    if (!vaultStatus.supported) {
      return { label: 'Unsupported', className: 'text-titanium-300' };
    }
    if (!vaultStatus.enabled) {
      return { label: 'Disabled', className: 'text-titanium-400' };
    }
    if (vaultStatus.unlocked) {
      return { label: 'Unlocked', className: 'text-action-success' };
    }
    return { label: 'Locked', className: 'text-action-destructive' };
  }, [vaultStatus.enabled, vaultStatus.supported, vaultStatus.unlocked]);

  const networkTone = networkStatus === 'offline' ? 'text-action-destructive' : 'text-action-success';
  const networkText =
    networkLabel && networkStatus === 'offline' ? `${networkLabel} · OFFLINE` : networkLabel;

  const effectivePubkey = pubkeyHex ?? vaultStatus.nullspacePublicKeyHex;

  return (
    <div
      className={[
        'flex flex-wrap items-center gap-3 rounded-full border border-titanium-200 bg-white shadow-soft px-4 py-1.5 dark:border-titanium-800 dark:bg-titanium-900/70 dark:text-titanium-100',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      {vaultStatus.supported && (
        <>
          <Link
            to="/security"
            className="flex items-center gap-2 group transition-opacity hover:opacity-70"
          >
            <span className="text-titanium-400 text-[10px] font-bold tracking-widest uppercase">Vault</span>
            <span className={`text-[10px] font-bold uppercase ${vault.className}`}>{vault.label}</span>
          </Link>

          <div className="h-3 w-px bg-titanium-200 dark:bg-titanium-800" />
        </>
      )}

      {networkText ? (
        <>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${networkTone}`}>
            {networkText}
          </span>
          <div className="h-3 w-px bg-titanium-200 dark:bg-titanium-800" />
        </>
      ) : null}

      <div className="flex items-center gap-4 text-[10px] tracking-widest uppercase font-bold text-titanium-400 whitespace-nowrap">
        <span>
          RNG <span className="text-titanium-900 dark:text-titanium-100">{formatInteger(rng)}</span>
        </span>
        <span>
          vUSDT <span className="text-titanium-900 dark:text-titanium-100">{formatInteger(vusdt)}</span>
        </span>
        {credits !== undefined || creditsLocked !== undefined ? (
          <span>
            Credits <span className="text-titanium-900 dark:text-titanium-100">{formatInteger(credits)}</span>
          </span>
        ) : null}
      </div>

      {effectivePubkey ? (
        <>
          <div className="h-3 w-px bg-titanium-200 dark:bg-titanium-800" />
          <Link
            to={`/explorer/account/${effectivePubkey}`}
            className="text-[10px] font-bold tracking-widest uppercase text-action-primary hover:opacity-70 transition-opacity"
            title={effectivePubkey}
          >
            PK {shortHex(effectivePubkey, 6, 4)}
          </Link>
        </>
      ) : null}
    </div>
  );
};
