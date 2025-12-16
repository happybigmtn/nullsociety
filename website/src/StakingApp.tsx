import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlaySwapStakeTabs } from './components/PlaySwapStakeTabs';
import { WalletPill } from './components/WalletPill';
import { PageHeader } from './components/PageHeader';
import { ConfirmModal } from './components/ui/ConfirmModal';
import { useSharedCasinoConnection } from './chain/CasinoConnectionContext';
import { useActivityFeed } from './hooks/useActivityFeed';
import { parseAmount } from './utils/amounts.js';
import { track } from './services/telemetry';
import { logActivity, trackTxConfirmed, trackTxFailed, trackTxSubmitted, type ActivityLevel, type TxKind } from './services/txTracker';
import { pushToast } from './services/toasts';

function formatApproxTimeFromBlocks(blocks: number, secondsPerBlock = 3): string {
  if (!Number.isFinite(blocks) || blocks <= 0) return '0s';
  const totalSeconds = Math.floor(blocks * secondsPerBlock);
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `~${days}d`;
  if (hours > 0) return `~${hours}h`;
  if (minutes > 0) return `~${minutes}m`;
  return `~${totalSeconds}s`;
}

export default function StakingApp() {
  const [lastTxSig, setLastTxSig] = useState<string | null>(null);
  const [lastTxDigest, setLastTxDigest] = useState<string | null>(null);
  const activity = useActivityFeed('staking', 12);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stakeConfirmOpen, setStakeConfirmOpen] = useState(false);
  const [stakeSubmitting, setStakeSubmitting] = useState(false);

  const connection = useSharedCasinoConnection();
  const pollRef = useRef<(() => void) | null>(null);

  const [isRegistered, setIsRegistered] = useState(false);
  const [player, setPlayer] = useState<any | null>(null);
  const [staker, setStaker] = useState<any | null>(null);
  const [house, setHouse] = useState<any | null>(null);

  const [registerName, setRegisterName] = useState('Staker');
  const [stakeAmount, setStakeAmount] = useState('0');
  const [stakeDuration, setStakeDuration] = useState('100');

  const pushActivity = (message: string, level: ActivityLevel = 'info') => {
    logActivity('staking', message, level);
  };

  const trackSubmitted = (kind: TxKind, message: string, result: any) => {
    trackTxSubmitted({
      surface: 'staking',
      kind,
      message,
      pubkeyHex: connection.keypair?.publicKeyHex,
      nonce: typeof result?.nonce === 'number' ? result.nonce : undefined,
      txHash: result?.txHash,
      txDigest: result?.txDigest,
    });
  };

  const statusText = useMemo(() => {
    switch (connection.status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting…';
      case 'vault_locked':
      case 'missing_identity':
        return connection.statusDetail ?? 'Not ready';
      case 'error':
        return connection.statusDetail ?? connection.error ?? 'Failed to connect';
      default:
        return 'Connecting…';
    }
  }, [connection.error, connection.status, connection.statusDetail]);

  const getReadyClient = () => {
    const client: any = connection.client;
    if (!client?.nonceManager) {
      if (connection.status === 'vault_locked') {
        pushActivity('Vault locked — unlock to continue');
      } else {
        pushActivity('Client not ready');
      }
      return null;
    }
    return client;
  };

  useEffect(() => {
    if (connection.status === 'connected') {
      pushActivity('Connected');
    } else if (connection.status === 'vault_locked') {
      pushActivity('Vault locked — unlock to continue', 'error');
    } else if (connection.status === 'missing_identity') {
      pushActivity('Missing VITE_IDENTITY (see website/README.md).', 'error');
    } else if (connection.status === 'error') {
      pushActivity(connection.error ?? 'Failed to connect', 'error');
    }
  }, [connection.error, connection.status]);

  // Event toasts
  useEffect(() => {
    if (connection.status !== 'connected' || !connection.keypair) return;
    const pkHex = connection.keypair.publicKeyHex;
    const pkHexLower = pkHex.toLowerCase();

    const unsubError = connection.onEvent('CasinoError', (e: any) => {
      if (e?.player?.toLowerCase?.() !== pkHexLower) return;
      const msg = e?.message ?? 'Unknown error';
      trackTxFailed({ surface: 'staking', finalMessage: msg, pubkeyHex: pkHex, error: msg });
      pushToast('error', msg);
      track('staking.error', { message: msg });
    });
    const unsubRegistered = connection.onEvent('CasinoPlayerRegistered', (e: any) => {
      if (e?.player?.toLowerCase?.() !== pkHexLower) return;
      const name = e?.name ?? '—';
      const msg = `Registered: ${name}`;
      trackTxConfirmed({ surface: 'staking', kind: 'register', finalMessage: msg, pubkeyHex: pkHex });
      pushToast('success', msg);
      pollRef.current?.();
      track('staking.register.confirmed', { name });
    });
    const unsubDeposited = connection.onEvent('CasinoDeposited', (e: any) => {
      if (e?.player?.toLowerCase?.() !== pkHexLower) return;
      const amount = e?.amount ?? 0;
      const newChips = e?.new_chips ?? e?.newChips ?? 0;
      const msg = `Deposit confirmed: +${amount} (chips=${newChips})`;
      trackTxConfirmed({
        surface: 'staking',
        kind: 'deposit',
        finalMessage: msg,
        pubkeyHex: pkHex,
      });
      pushToast('success', msg);
      pollRef.current?.();
      track('staking.deposit.confirmed', { amount, newChips });
    });
    const unsubStaked = connection.onEvent('Staked', (e: any) => {
      if (e?.player?.toLowerCase?.() !== pkHexLower) return;
      const amount = e?.amount ?? 0;
      const unlockTs = e?.unlockTs ?? e?.unlock_ts ?? '—';
      const msg = `Staked: +${amount} (unlock @ ${unlockTs})`;
      trackTxConfirmed({
        surface: 'staking',
        kind: 'stake',
        finalMessage: msg,
        pubkeyHex: pkHex,
      });
      pushToast('success', msg);
      pollRef.current?.();
      track('staking.stake.confirmed', { amount, unlockTs });
    });
    const unsubUnstaked = connection.onEvent('Unstaked', (e: any) => {
      if (e?.player?.toLowerCase?.() !== pkHexLower) return;
      const amount = e?.amount ?? 0;
      const msg = `Unstaked: ${amount}`;
      trackTxConfirmed({ surface: 'staking', kind: 'unstake', finalMessage: msg, pubkeyHex: pkHex });
      pushToast('success', msg);
      pollRef.current?.();
      track('staking.unstake.confirmed', { amount });
    });
    const unsubClaimed = connection.onEvent('RewardsClaimed', (e: any) => {
      if (e?.player?.toLowerCase?.() !== pkHexLower) return;
      const amount = e?.amount ?? 0;
      const msg = `Rewards claimed: ${amount}`;
      trackTxConfirmed({
        surface: 'staking',
        kind: 'claim_rewards',
        finalMessage: msg,
        pubkeyHex: pkHex,
      });
      pushToast('success', msg);
      pollRef.current?.();
      track('staking.claim.confirmed', { amount });
    });
    const unsubEpoch = connection.onEvent('EpochProcessed', (e: any) => {
      const epoch = e?.epoch ?? '—';
      const msg = `Epoch processed: ${epoch}`;
      trackTxConfirmed({ surface: 'staking', kind: 'process_epoch', finalMessage: msg });
      pushToast('success', msg);
      track('staking.epoch.processed', { epoch });
    });

    return () => {
      try {
        unsubError?.();
        unsubRegistered?.();
        unsubDeposited?.();
        unsubStaked?.();
        unsubUnstaked?.();
        unsubClaimed?.();
        unsubEpoch?.();
      } catch {
        // ignore
      }
    };
  }, [connection.keypair?.publicKeyHex, connection.onEvent, connection.status]);

  // Poll state
  useEffect(() => {
    const client: any = connection.client;
    const pk = connection.keypair?.publicKey;
    if (!client || !pk) return;

    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (cancelled || inFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const [p, s, h] = await Promise.all([
          client.getCasinoPlayer(pk),
          client.getStaker(pk),
          client.getHouse(),
        ]);
        setPlayer(p);
        setIsRegistered(!!p);
        setStaker(s);
        setHouse(h);
      } catch {
        // ignore transient errors
      } finally {
        inFlight = false;
      }
    };

    void poll();
    pollRef.current = () => {
      void poll();
    };
    const interval = setInterval(poll, 3000);

    return () => {
      cancelled = true;
      pollRef.current = null;
      clearInterval(interval);
    };
  }, [connection.client, connection.keypair?.publicKeyHex]);

  const derived = useMemo(() => {
    const staked = BigInt(staker?.balance ?? 0);
    const unlockTs = Number(staker?.unlockTs ?? 0);
    const vp = BigInt(staker?.votingPower ?? 0);
    const unclaimedRewards = BigInt(staker?.unclaimedRewards ?? 0);
    const rewardDebtX18 = BigInt(staker?.rewardDebtX18 ?? 0);
    const totalVp = BigInt(house?.totalVotingPower ?? 0);
    const totalStaked = BigInt(house?.totalStakedAmount ?? 0);
    const rewardPerVotingPowerX18 = BigInt(house?.stakingRewardPerVotingPowerX18 ?? 0);
    const rewardPool = BigInt(house?.stakingRewardPool ?? 0);

    const view = connection.currentView ?? 0;
    const locked = unlockTs > 0 && view < unlockTs;
    const remainingBlocks = locked ? unlockTs - view : 0;

    const shareBps = totalVp > 0n ? Number((vp * 10_000n) / totalVp) : 0;
    const stakedShareBps = totalStaked > 0n ? Number((staked * 10_000n) / totalStaked) : 0;

    const STAKING_REWARD_SCALE = 1_000_000_000_000_000_000n;
    let pendingRewards = 0n;
    if (vp > 0n) {
      const currentDebtX18 = vp * rewardPerVotingPowerX18;
      pendingRewards =
        currentDebtX18 > rewardDebtX18
          ? (currentDebtX18 - rewardDebtX18) / STAKING_REWARD_SCALE
          : 0n;
    }
    const claimableRewards = unclaimedRewards + pendingRewards;

    return {
      staked,
      unlockTs,
      vp,
      unclaimedRewards,
      pendingRewards,
      claimableRewards,
      totalVp,
      totalStaked,
      locked,
      remainingBlocks,
      shareBps,
      stakedShareBps,
      rewardPool,
    };
  }, [connection.currentView, house, staker]);

  const stakeBalance = useMemo(() => BigInt(player?.chips ?? 0), [player?.chips]);
  const stakeAmountParsed = useMemo(() => parseAmount(stakeAmount), [stakeAmount]);
  const stakeDurationParsed = useMemo(() => parseAmount(stakeDuration), [stakeDuration]);
  const stakeValidationMessage = useMemo(() => {
    if (!player) return 'Register to stake';
    if (stakeAmountParsed === null) return 'Enter a whole number amount';
    if (stakeAmountParsed <= 0n) return 'Amount must be greater than zero';
    if (stakeAmountParsed > stakeBalance) return 'Not enough RNG';
    if (stakeDurationParsed === null) return 'Enter a whole number duration';
    if (stakeDurationParsed <= 0n) return 'Duration must be greater than zero';
    return null;
  }, [player, stakeAmountParsed, stakeBalance, stakeDurationParsed]);
  const canStake = !stakeSubmitting && stakeValidationMessage === null;

  const setStakePercent = (pct: number) => {
    const clamped = Math.max(0, Math.min(100, Math.floor(pct)));
    const value = (stakeBalance * BigInt(clamped)) / 100n;
    setStakeAmount(value.toString());
  };

  const ensureRegistered = async () => {
    const client = getReadyClient();
    if (!client) return;
    if (isRegistered) return;
    const name = registerName.trim() || `Staker_${Date.now().toString(36)}`;
    const result = await client.nonceManager.submitCasinoRegister(name);
    if (result?.txHash) {
      setLastTxSig(result.txHash);
      setLastTxDigest(result.txDigest ?? null);
    }
    track('staking.register.submitted', { name });
    trackSubmitted('register', `Submitted register (${name})`, result);
  };

  const claimFaucet = async () => {
    const client = getReadyClient();
    if (!client) return;
    await ensureRegistered();
    const result = await client.nonceManager.submitCasinoDeposit(1000);
    if (result?.txHash) {
      setLastTxSig(result.txHash);
      setLastTxDigest(result.txDigest ?? null);
    }
    track('staking.faucet.submitted', { amount: 1000 });
    trackSubmitted('deposit', 'Submitted faucet claim (1000 RNG)', result);
  };

  const stake = async ({ amount, duration }: { amount: bigint; duration: bigint }) => {
    const client = getReadyClient();
    if (!client) return;
    await ensureRegistered();

    if (!player) {
      pushActivity('Register to stake');
      return;
    }
    if (amount <= 0n || duration <= 0n) {
      pushActivity('Stake amount/duration must be > 0');
      return;
    }
    if (amount > stakeBalance) {
      pushActivity('Not enough RNG');
      return;
    }
    const result = await client.nonceManager.submitStake(amount.toString(), duration.toString());
    if (result?.txHash) {
      setLastTxSig(result.txHash);
      setLastTxDigest(result.txDigest ?? null);
    }
    track('staking.stake.submitted', { amount: amount.toString(), duration: duration.toString() });
    trackSubmitted('stake', `Submitted stake (amount=${amount}, duration=${duration})`, result);
  };

  const unstake = async () => {
    const client = getReadyClient();
    if (!client) return;
    await ensureRegistered();
    const result = await client.nonceManager.submitUnstake();
    if (result?.txHash) {
      setLastTxSig(result.txHash);
      setLastTxDigest(result.txDigest ?? null);
    }
    track('staking.unstake.submitted');
    trackSubmitted('unstake', 'Submitted unstake', result);
  };

  const claimRewards = async () => {
    const client = getReadyClient();
    if (!client) return;
    await ensureRegistered();
    const result = await client.nonceManager.submitClaimRewards();
    if (result?.txHash) {
      setLastTxSig(result.txHash);
      setLastTxDigest(result.txDigest ?? null);
    }
    track('staking.claim.submitted');
    trackSubmitted('claim_rewards', 'Submitted claim rewards', result);
  };

  const processEpoch = async () => {
    const client = getReadyClient();
    if (!client) return;
    await ensureRegistered();
    const result = await client.nonceManager.submitProcessEpoch();
    if (result?.txHash) {
      setLastTxSig(result.txHash);
      setLastTxDigest(result.txDigest ?? null);
    }
    track('staking.epoch.process.submitted');
    trackSubmitted('process_epoch', 'Submitted process epoch', result);
  };

  return (
    <div className="min-h-screen bg-terminal-black text-white font-mono">
      <PageHeader
        title="Staking"
        status={statusText}
        leading={<PlaySwapStakeTabs />}
        right={
          <>
            <WalletPill rng={player?.chips} vusdt={player?.vusdtBalance} pubkeyHex={connection.keypair?.publicKeyHex} />
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className={[
                'h-11 px-3 rounded border text-[10px] tracking-widest uppercase transition-colors',
                showAdvanced
                  ? 'border-terminal-green text-terminal-green bg-terminal-green/10'
                  : 'border-gray-800 text-gray-400 hover:border-gray-600 hover:text-white',
              ].join(' ')}
              title="Show advanced / dev controls"
            >
              Advanced
            </button>
            {lastTxSig ? (
              lastTxDigest ? (
                <Link
                  to={`/explorer/tx/${lastTxDigest}`}
                  className="text-[10px] text-terminal-green tracking-widest hover:underline"
                  title={lastTxDigest}
                >
                  LAST TX: {lastTxSig}
                </Link>
              ) : (
                <div className="text-[10px] text-gray-500 tracking-widest">LAST TX: {lastTxSig}</div>
              )
            ) : null}
          </>
        }
      />

      <div className="p-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Wallet */}
        <section className="border border-gray-800 rounded p-4 bg-gray-900/30">
          <div className="text-xs text-gray-400 tracking-widest mb-3">WALLET</div>
          <div className="space-y-2 text-sm">
            <div>
              Registered:{' '}
              <span className={isRegistered ? 'text-terminal-green' : 'text-terminal-accent'}>
                {isRegistered ? 'YES' : 'NO'}
              </span>
            </div>
            <div>
              RNG: <span className="text-white">{player?.chips ?? 0}</span>
            </div>
            <div>
              vUSDT: <span className="text-white">{player?.vusdtBalance ?? 0}</span>
            </div>
            <div className="text-[10px] text-gray-600 break-all">PK: {connection.keypair?.publicKeyHex ?? '—'}</div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="Name"
              />
              <button
                className="text-xs px-3 py-1 rounded border border-terminal-green text-terminal-green hover:bg-terminal-green/10"
                onClick={ensureRegistered}
              >
                Register
              </button>
            </div>
            <button
              className="w-full text-xs px-3 py-2 rounded border border-terminal-green text-terminal-green hover:bg-terminal-green/10"
              onClick={claimFaucet}
            >
              Daily Faucet (1000 RNG)
            </button>
          </div>
        </section>

        {/* Stake */}
        <section className={['border border-gray-800 rounded p-4 bg-gray-900/30', showAdvanced ? '' : 'lg:col-span-2'].join(' ').trim()}>
          <div className="text-xs text-gray-400 tracking-widest mb-3">STAKE RNG</div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="border border-gray-800 rounded p-3 bg-black/30">
                <div className="text-[10px] text-gray-500 tracking-widest">YOUR STAKE</div>
                <div className="text-white mt-1">{staker?.balance ?? 0}</div>
                <div className="text-[10px] text-gray-600">unlock @ {derived.unlockTs || '—'}</div>
                <div className="text-[10px] text-gray-600">
                  unclaimed {derived.unclaimedRewards.toString()}
                </div>
              </div>
              <div className="border border-gray-800 rounded p-3 bg-black/30">
                <div className="text-[10px] text-gray-500 tracking-widest">VOTING POWER</div>
                <div className="text-white mt-1">{derived.vp.toString()}</div>
                <div className="text-[10px] text-gray-600">share ~ {(derived.shareBps / 100).toFixed(2)}%</div>
                <div className="text-[10px] text-gray-600">
                  claimable {derived.claimableRewards.toString()}
                </div>
              </div>
            </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-2 text-[10px] text-gray-600 tracking-widest uppercase">
              <span>Amount (RNG)</span>
              <span>
                Balance <span className="text-white">{stakeBalance.toString()}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="flex-1 min-w-[180px] h-11 bg-gray-950 border border-gray-800 rounded px-2 text-xs"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder="Amount (RNG)"
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <button
                type="button"
                className="h-11 px-3 rounded border border-gray-800 text-gray-300 text-[10px] tracking-widest uppercase hover:border-gray-600 hover:text-white"
                onClick={() => setStakeAmount(stakeBalance.toString())}
                disabled={stakeBalance <= 0n}
                title="Max"
              >
                Max
              </button>
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="h-11 px-3 rounded border border-gray-800 text-gray-300 text-[10px] tracking-widest uppercase hover:border-gray-600 hover:text-white"
                  onClick={() => setStakePercent(pct)}
                  disabled={stakeBalance <= 0n}
                  title={`${pct}%`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] text-gray-600 tracking-widest uppercase">
              <span>Duration (blocks)</span>
              <span className="text-gray-500">
                {stakeDurationParsed && stakeDurationParsed > 0n && stakeDurationParsed < 1_000_000n
                  ? formatApproxTimeFromBlocks(Number(stakeDurationParsed))
                  : '—'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="flex-1 min-w-[180px] h-11 bg-gray-950 border border-gray-800 rounded px-2 text-xs"
                value={stakeDuration}
                onChange={(e) => setStakeDuration(e.target.value)}
                placeholder="Duration (blocks)"
                inputMode="numeric"
                pattern="[0-9]*"
              />
              {[100, 500, 2000, 10000].map((blocks) => (
                <button
                  key={blocks}
                  type="button"
                  className="h-11 px-3 rounded border border-gray-800 text-gray-300 text-[10px] tracking-widest uppercase hover:border-gray-600 hover:text-white"
                  onClick={() => setStakeDuration(String(blocks))}
                  title={`${blocks} blocks`}
                >
                  {blocks >= 1000 ? `${blocks / 1000}k` : blocks}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`flex-1 text-xs px-3 py-2 rounded border ${
                  canStake
                    ? 'border-terminal-green text-terminal-green hover:bg-terminal-green/10'
                    : 'border-gray-800 text-gray-600 cursor-not-allowed'
                }`}
                onClick={() => (canStake ? setStakeConfirmOpen(true) : null)}
                disabled={!canStake}
              >
                Stake
              </button>
              <button
                className={`text-xs px-3 py-2 rounded border ${
                  derived.locked
                    ? 'border-gray-800 text-gray-600 cursor-not-allowed'
                    : 'border-gray-700 text-gray-300 hover:border-gray-500'
                }`}
                onClick={unstake}
                disabled={derived.locked}
                title={derived.locked ? `Locked for ${derived.remainingBlocks} blocks` : 'Unstake'}
              >
                Unstake
              </button>
              <button
                className={`text-xs px-3 py-2 rounded border ${
                  derived.claimableRewards === 0n
                    ? 'border-gray-800 text-gray-600 cursor-not-allowed'
                    : 'border-gray-700 text-gray-300 hover:border-gray-500'
                }`}
                onClick={claimRewards}
                disabled={derived.claimableRewards === 0n}
                title={derived.claimableRewards === 0n ? 'No rewards to claim' : 'Claim rewards'}
              >
                Claim
              </button>
            </div>

            {derived.locked && (
              <div className="text-[10px] text-gray-500">
                Locked: {derived.remainingBlocks} blocks ({formatApproxTimeFromBlocks(derived.remainingBlocks)})
              </div>
            )}

            {stakeValidationMessage ? <div className="text-[10px] text-terminal-accent">{stakeValidationMessage}</div> : null}

            <div className="text-[10px] text-gray-600 leading-relaxed">
              Rewards are funded from positive epoch net PnL and distributed pro-rata by voting power (amount * duration).
              Call “Process Epoch” after ~100 blocks to roll the epoch and update the reward pool.
            </div>
          </div>
        </section>

        {/* House */}
        {showAdvanced ? (
        <section className="border border-gray-800 rounded p-4 bg-gray-900/30">
          <div className="text-xs text-gray-400 tracking-widest mb-3">HOUSE / REWARDS</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Epoch</span>
              <span className="text-white">{house?.currentEpoch ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Net PnL</span>
              <span className="text-white">{house?.netPnl ?? '0'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Total Staked</span>
              <span className="text-white">{house?.totalStakedAmount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Total Voting Power</span>
              <span className="text-white">{house?.totalVotingPower ?? '0'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">AMM Fees</span>
              <span className="text-white">{house?.accumulatedFees ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Total Burned</span>
              <span className="text-white">{house?.totalBurned ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Total Issuance</span>
              <span className="text-white">{house?.totalIssuance ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Reward Pool</span>
              <span className="text-white">{derived.rewardPool.toString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Reward Carry</span>
              <span className="text-white">{house?.stakingRewardCarry ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">View</span>
              <span className="text-white">{connection.currentView ?? '—'}</span>
            </div>
          </div>

          <div className="mt-4 border-t border-gray-800 pt-4 space-y-2">
            <button
              className="w-full text-xs px-3 py-2 rounded border border-gray-700 text-gray-300 hover:border-gray-500"
              onClick={processEpoch}
            >
              Process Epoch (dev)
            </button>
            <div className="text-[10px] text-gray-600">
          Anyone can call this in dev; later it’s a keeper/admin action.
            </div>
          </div>
        </section>
        ) : null}
      </div>

      <ConfirmModal
        open={stakeConfirmOpen}
        title="Confirm Stake"
        confirmText="Confirm Stake"
        loading={stakeSubmitting}
        onClose={() => (stakeSubmitting ? null : setStakeConfirmOpen(false))}
        onConfirm={async () => {
          if (!canStake) return;
          if (stakeAmountParsed === null || stakeDurationParsed === null) return;
          setStakeSubmitting(true);
          try {
            await stake({ amount: stakeAmountParsed, duration: stakeDurationParsed });
            setStakeConfirmOpen(false);
          } finally {
            setStakeSubmitting(false);
          }
        }}
      >
        <div className="space-y-3 text-sm">
          <div className="text-[10px] text-gray-500 tracking-widest uppercase">Summary</div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="text-gray-500">Amount</div>
            <div className="text-white text-right">
              {stakeAmountParsed === null ? '—' : stakeAmountParsed.toString()} RNG
            </div>
            <div className="text-gray-500">Duration</div>
            <div className="text-white text-right">
              {stakeDurationParsed === null ? '—' : stakeDurationParsed.toString()} blocks
            </div>
            <div className="text-gray-500">Voting power</div>
            <div className="text-white text-right">
              {stakeAmountParsed && stakeDurationParsed ? (stakeAmountParsed * stakeDurationParsed).toString() : '—'}
            </div>
            <div className="text-gray-500">Unlock ETA</div>
            <div className="text-white text-right">
              {stakeDurationParsed && stakeDurationParsed > 0n && stakeDurationParsed < 1_000_000n
                ? formatApproxTimeFromBlocks(Number(stakeDurationParsed))
                : '—'}
            </div>
          </div>
          <div className="text-[10px] text-gray-600 leading-relaxed">
            Voting power = amount × duration. Rewards depend on future epoch net PnL.
          </div>
        </div>
      </ConfirmModal>

      {/* Activity */}
      <section className="mt-4 border border-gray-800 rounded p-4 bg-gray-900/20">
        <div className="text-xs text-gray-400 tracking-widest mb-3">ACTIVITY</div>
        {activity.length === 0 ? (
          <div className="text-[10px] text-gray-600">No activity yet.</div>
        ) : (
          <ul className="space-y-1 text-[10px] text-gray-400">
            {activity.map((item) => {
              const isTx = item.type === 'tx';
              const message = isTx ? item.finalMessage ?? item.message : item.message;
              const when = new Date(isTx ? item.updatedTs : item.ts).toLocaleTimeString();
              const label = isTx
                ? item.status === 'submitted'
                  ? 'PENDING'
                  : item.status === 'confirmed'
                    ? 'OK'
                    : 'FAIL'
                : item.level === 'error'
                  ? 'ERROR'
                  : item.level === 'success'
                    ? 'OK'
                    : 'INFO';
              const labelClass = isTx
                ? item.status === 'confirmed'
                  ? 'text-terminal-green'
                  : item.status === 'failed'
                    ? 'text-terminal-accent'
                    : 'text-gray-500'
                : item.level === 'error'
                  ? 'text-terminal-accent'
                  : item.level === 'success'
                    ? 'text-terminal-green'
                    : 'text-gray-500';

              const messageNode =
                isTx && item.txDigest ? (
                  <Link to={`/explorer/tx/${item.txDigest}`} className="text-gray-300 hover:underline" title={item.txDigest}>
                    {message}
                  </Link>
                ) : (
                  <span className="text-gray-300">{message}</span>
                );

              return (
                <li key={item.id} className="flex items-start gap-2">
                  <span className="text-gray-600">{when}</span>
                  <span className={`text-[10px] tracking-widest ${labelClass}`}>{label}</span>
                  {messageNode}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}
