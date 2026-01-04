# L03 - Instruction encoding (binary formats) from scratch

Focus file: `gateway/src/codec/instructions.ts`

Goal: explain how instructions and game payloads are encoded into bytes. For every excerpt, you’ll see **why it matters** and a **plain description of what the code does**.

Supporting references:
- `gateway/src/codec/constants.ts`
- `types/src/execution.rs`

---

## Concepts from scratch (expanded)

### 1) “Binary encoding” in plain words
Computers only understand bytes (0–255). When we send a transaction to the chain, we don’t send JSON — we send **bytes** in a strict layout. The Rust backend decodes those bytes into instructions.

If the layout is wrong by even one byte, the chain will reject the transaction.

### 2) Big‑endian numbers
Multi‑byte numbers can be written in two ways:
- **Big‑endian**: most significant byte first (used here).
- **Little‑endian**: least significant byte first.

Both sides must agree on the same endianness.

### 3) Instruction vs game payload
- **Instruction**: top‑level action like “register”, “deposit”, “start game”.
- **Game payload**: the internal move bytes inside a `CasinoGameMove` instruction (e.g., blackjack hit).

### 4) Tags are opcodes
The first byte of every instruction is a tag (opcode). Tags are defined in `gateway/src/codec/constants.ts` and must match Rust exactly.

---

## Limits & management callouts (important)

1) **Player name length is capped**
- The gateway enforces `CASINO_MAX_NAME_LENGTH` before encoding.
- This protects against oversized names and memory abuse.

2) **CasinoGameMove payload length is capped**
- The gateway enforces `CASINO_MAX_PAYLOAD_LENGTH`.
- This prevents massive payloads even though the length field is u32.

3) **GlobalTable maxBetsPerRound is u8**
- Hard limit 255 bets per round. Real configs should be much lower.

4) **Roulette and SicBo bet counts are u8**
- Max 255 bets per move.

---

## Walkthrough with code excerpts

### 1) CasinoRegister
```ts
export function encodeCasinoRegister(name: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const result = new Uint8Array(1 + 4 + nameBytes.length);
  const view = new DataView(result.buffer);

  result[0] = InstructionTag.CasinoRegister;
  view.setUint32(1, nameBytes.length, false); // BE
  result.set(nameBytes, 5);

  return result;
}
```

Why this matters:
- Registration is the first on‑chain action for every player. If it fails, nothing else works.

What this code does:
- Encodes a register instruction as bytes: tag (10), name length (u32), name bytes.
- Allocates an output buffer sized exactly to fit the tag, length, and UTF‑8 bytes.
- Writes the tag at byte 0, the name length at byte 1 (big‑endian), then copies the name at byte 5.
- Returns the final byte array ready to be signed and submitted.

---

### 2) CasinoDeposit
```ts
export function encodeCasinoDeposit(amount: bigint): Uint8Array {
  const result = new Uint8Array(9);
  const view = new DataView(result.buffer);

  result[0] = InstructionTag.CasinoDeposit;
  view.setBigUint64(1, amount, false);  // BE

  return result;
}
```

Why this matters:
- Faucet deposits and test chips use this encoding. Any mismatch breaks onboarding.

What this code does:
- Encodes a deposit as tag (11) plus a 64‑bit amount.
- Allocates a fixed 9‑byte buffer and writes the tag first.
- Writes the amount as a big‑endian u64 at offset 1.

---

### 3) CasinoStartGame
```ts
export function encodeCasinoStartGame(gameType: GameType, bet: bigint, sessionId: bigint): Uint8Array {
  const result = new Uint8Array(18);
  const view = new DataView(result.buffer);

  result[0] = InstructionTag.CasinoStartGame;
  result[1] = gameType;
  view.setBigUint64(2, bet, false);  // BE
  view.setBigUint64(10, sessionId, false);  // BE

  return result;
}
```

Why this matters:
- Starting a game creates a session on chain. Wrong encoding here breaks gameplay entirely.

What this code does:
- Builds a fixed‑size instruction: tag + game type + bet + session ID.
- Allocates 18 bytes and writes the tag and game type into the first two bytes.
- Writes the bet (u64) at offset 2 and the session ID (u64) at offset 10, both big‑endian.

---

### 4) CasinoGameMove
```ts
export function encodeCasinoGameMove(sessionId: bigint, payload: Uint8Array): Uint8Array {
  const result = new Uint8Array(1 + 8 + 4 + payload.length);
  const view = new DataView(result.buffer);

  result[0] = InstructionTag.CasinoGameMove;
  view.setBigUint64(1, sessionId, false);  // BE
  view.setUint32(9, payload.length, false);  // BE
  result.set(payload, 13);

  return result;
}
```

Why this matters:
- Every move during gameplay uses this instruction. If payload length is wrong, the chain can’t parse moves.

What this code does:
- Encodes a game move with: tag, session ID, payload length, payload bytes.
- Allocates space for the fixed header plus the variable payload.
- Writes tag and session ID, then writes the payload length (u32) so the decoder knows where it ends.
- Copies the payload bytes after the header and returns the combined buffer.

---

### 5) CasinoPlayerAction
```ts
export function encodeCasinoPlayerAction(action: PlayerAction): Uint8Array {
  const result = new Uint8Array(2);

  result[0] = InstructionTag.CasinoPlayerAction;
  result[1] = action;

  return result;
}
```

Why this matters:
- This toggles modifiers (shield, double, super). If encoded incorrectly, modifiers fail silently.

What this code does:
- Encodes an action as tag + 1‑byte action code.
- Allocates a 2‑byte buffer and writes both bytes directly.

---

### 6) CasinoJoinTournament
```ts
export function encodeCasinoJoinTournament(tournamentId: bigint): Uint8Array {
  const result = new Uint8Array(9);
  const view = new DataView(result.buffer);

  result[0] = InstructionTag.CasinoJoinTournament;
  view.setBigUint64(1, tournamentId, false);  // BE

  return result;
}
```

Why this matters:
- Tournament participation depends on this. If it fails, freeroll lifecycle breaks.

What this code does:
- Encodes join with tag + tournament ID.
- Allocates 9 bytes, writes the tag, then writes the tournament ID as a big‑endian u64.

---

### 7) Global table init
```ts
export function encodeGlobalTableInit(config: GlobalTableConfigInput): Uint8Array {
  const result = new Uint8Array(1 + 1 + (8 * 6) + 1);
  const view = new DataView(result.buffer);

  result[0] = InstructionTag.GlobalTableInit;
  result[1] = config.gameType;
  view.setBigUint64(2, BigInt(config.bettingMs), false);
  view.setBigUint64(10, BigInt(config.lockMs), false);
  view.setBigUint64(18, BigInt(config.payoutMs), false);
  view.setBigUint64(26, BigInt(config.cooldownMs), false);
  view.setBigUint64(34, config.minBet, false);
  view.setBigUint64(42, config.maxBet, false);
  result[50] = config.maxBetsPerRound;

  return result;
}
```

Why this matters:
- Global table config controls the timing and limits for live‑table rounds.

What this code does:
- Encodes a fixed‑size config instruction with time windows and bet limits.
- Writes tag + game type, then six u64 values (betting/lock/payout/cooldown/min/max) in big‑endian.
- Writes `maxBetsPerRound` as a single byte at the end.

---

### 8) Global table submit bets
```ts
export function encodeGlobalTableSubmitBets(
  gameType: GameType,
  roundId: bigint,
  bets: GlobalTableBetInput[]
): Uint8Array {
  const lenVarint = encodeVarint(bets.length);
  const result = new Uint8Array(1 + 1 + 8 + lenVarint.length + bets.length * 10);
  const view = new DataView(result.buffer);

  let offset = 0;
  result[offset] = InstructionTag.GlobalTableSubmitBets;
  offset += 1;
  result[offset] = gameType;
  offset += 1;
  view.setBigUint64(offset, roundId, false);
  offset += 8;
  result.set(lenVarint, offset);
  offset += lenVarint.length;

  for (const bet of bets) {
    result[offset] = bet.betType;
    result[offset + 1] = bet.target;
    view.setBigUint64(offset + 2, bet.amount, false);
    offset += 10;
  }

  return result;
}
```

Why this matters:
- Batch bet submission is the heart of live‑table on‑chain mode. Any mistake here invalidates the entire round.

What this code does:
- Encodes a vector of bets with a varint length, then writes each bet into the buffer.
- Calculates the total buffer size using the varint length and per‑bet size (10 bytes each).
- Writes header fields in order (tag, gameType, roundId, bet count).
- Loops through bets and writes `[betType][target][amount]` for each.

---

### 9) Global table state transitions
```ts
export function encodeGlobalTableLock(gameType: GameType, roundId: bigint): Uint8Array {
  const result = new Uint8Array(10);
  const view = new DataView(result.buffer);
  result[0] = InstructionTag.GlobalTableLock;
  result[1] = gameType;
  view.setBigUint64(2, roundId, false);
  return result;
}

export function encodeGlobalTableReveal(gameType: GameType, roundId: bigint): Uint8Array {
  const result = new Uint8Array(10);
  const view = new DataView(result.buffer);
  result[0] = InstructionTag.GlobalTableReveal;
  result[1] = gameType;
  view.setBigUint64(2, roundId, false);
  return result;
}

export function encodeGlobalTableSettle(gameType: GameType, roundId: bigint): Uint8Array {
  const result = new Uint8Array(10);
  const view = new DataView(result.buffer);
  result[0] = InstructionTag.GlobalTableSettle;
  result[1] = gameType;
  view.setBigUint64(2, roundId, false);
  return result;
}
```

Why this matters:
- These transitions control the round lifecycle (lock → reveal → settle). If they are wrong, rounds never finish.

What this code does:
- Encodes a simple tag + gameType + roundId for each stage.
- Each function returns a 10‑byte buffer with the correct opcode for lock/reveal/settle.
- The layout is identical across stages, so the backend only switches on the tag byte.

---

### 10) Game‑specific payloads (examples)

**Blackjack move**
```ts
export function buildBlackjackPayload(move: BlackjackMoveAction): Uint8Array {
  return encodeGameMovePayload({ game: 'blackjack', move });
}
```

Why this matters:
- Blackjack relies on a separate protocol encoding. If that encoder is wrong, every blackjack move fails.

What this code does:
- Delegates to the shared protocol library to encode a blackjack move.
- Wraps the `move` inside a typed payload object so the protocol encoder can choose the right schema.

**Hi‑Lo move**
```ts
export function buildHiLoPayload(guess: 'higher' | 'lower' | 'same'): Uint8Array {
  return encodeGameActionPayload({ game: 'hilo', action: guess });
}
```

Why this matters:
- Hi‑Lo is a single‑action game; the payload must be compact and correct.

What this code does:
- Encodes the guess action into protocol bytes.
- Uses the shared protocol encoder so the binary format matches the Rust decoder.

**Roulette bet payload**
```ts
export function buildRoulettePayload(bets: RouletteBet[]): Uint8Array {
  const result = new Uint8Array(1 + bets.length * 10);
  const view = new DataView(result.buffer);

  result[0] = bets.length;
  let offset = 1;

  for (const bet of bets) {
    result[offset] = bet.type;
    result[offset + 1] = bet.value;
    view.setBigUint64(offset + 2, bet.amount, false);
    offset += 10;
  }

  return result;
}
```

Why this matters:
- Roulette can include many bets in one move. This layout is how the chain decodes them.

What this code does:
- Encodes the number of bets and then each bet as `[type][value][amount]`.
- Allocates a buffer sized to the count and writes the count in byte 0.
- Writes each bet in 10‑byte chunks with a big‑endian u64 amount.

**Craps bet payload + roll payload**
```ts
export function buildCrapsPayload(betType: number, amount: bigint, target: number = 0): Uint8Array {
  const result = new Uint8Array(11);
  const view = new DataView(result.buffer);

  result[0] = 0;  // Action 0 = Place bet
  result[1] = betType;
  result[2] = target;
  view.setBigUint64(3, amount, false);

  return result;
}

export function buildCrapsRollPayload(): Uint8Array {
  return new Uint8Array([2]);
}
```

Why this matters:
- Craps is the most complex game; a single wrong action byte or amount breaks the round.

What this code does:
- Encodes a bet as `[action][betType][target][amount]`.
- Uses action byte `0` to indicate “place bet”.
- Writes amount as a big‑endian u64 starting at offset 3.
- Encodes a roll as a single action byte (`2`) to trigger the roll step.

---

### 11) Other game payload helpers (Video Poker, SicBo, War, Three Card, Ultimate Hold’em)
```ts
export function buildVideoPokerPayload(holds: boolean[]): Uint8Array {
  return encodeGameActionPayload({
    game: 'videopoker',
    action: 'hold',
    holds,
  });
}

export function buildSicBoPayload(bets: SicBoBet[]): Uint8Array {
  const result = new Uint8Array(1 + bets.length * 9);
  const view = new DataView(result.buffer);

  result[0] = bets.length;
  let offset = 1;

  for (const bet of bets) {
    result[offset] = bet.type;
    view.setBigUint64(offset + 1, bet.amount, false);
    offset += 9;
  }

  return result;
}

export function buildCasinoWarPayload(goToWar: boolean): Uint8Array {
  return encodeGameActionPayload({
    game: 'casinowar',
    action: goToWar ? 'war' : 'surrender',
  });
}

export function buildThreeCardPayload(play: boolean): Uint8Array {
  return encodeGameActionPayload({
    game: 'threecard',
    action: play ? 'play' : 'fold',
  });
}

export function buildUltimateHoldemPayload(action: 'check' | 'bet', multiplier: number = 1): Uint8Array {
  if (action === 'check') {
    return encodeGameActionPayload({ game: 'ultimateholdem', action: 'check' });
  }
  const normalized = multiplier === 4 || multiplier === 3 || multiplier === 2 ? multiplier : 1;
  return encodeGameActionPayload({
    game: 'ultimateholdem',
    action: 'bet',
    multiplier: normalized,
  });
}
```

Why this matters:
- These helpers cover the rest of the casino catalog. If any are wrong, that entire game mode breaks.

What this code does:
- Video Poker: encodes which cards to hold using the shared protocol format.
- SicBo: allocates a buffer, writes the bet count, then writes `[type][amount]` for each bet.
- Casino War / Three Card: encodes a single action string using the protocol encoder.
- Ultimate Hold’em: normalizes multipliers to valid values (4/3/2/1), then encodes either “check” or “bet”.

---

## Extended deep dive: instruction layering and protocol safety

The instruction encoder file is not just a set of "utilities." It defines the byte-level protocol between the gateway and the Rust execution engine. To work safely with it, you need a few deeper mental models.

### 12) Instruction vs payload: two layers of protocol

There are two protocol layers:

1) **Instruction layer** (gateway-defined)  
   This layer uses tags such as `CasinoRegister` or `GlobalTableSubmitBets`. It tells the execution engine *what category of action* is being performed.

2) **Payload layer** (game-specific, often from `@nullspace/protocol`)  
   This layer encodes the internal move or action for a specific game.

The key idea: the instruction is the envelope, the payload is the contents. You can change payload encoding within a game as long as both client and backend agree, but you cannot change the instruction layout without breaking the overall protocol.

### 13) Why some payloads are hand-encoded

Some payloads use `encodeGameMovePayload` or `encodeGameActionPayload`. Others, like roulette or craps, are hand-encoded in this file.

This is not arbitrary. The hand-encoded payloads are cases where:

- the payload format is a simple fixed layout, or
- the protocol library does not provide a dedicated encoder.

The downside of hand encoding is that you must keep the TypeScript and Rust implementations synchronized manually. The upside is fewer dependencies and more direct control.

### 14) Strict length caps protect memory and correctness

Two important caps are enforced here:

- `CASINO_MAX_NAME_LENGTH` for player names.
- `CASINO_MAX_PAYLOAD_LENGTH` for game move payloads.

These limits protect the system in two ways:

1) **Memory safety**: The gateway refuses to allocate giant buffers.  
2) **Protocol sanity**: The execution engine can assume payloads are within expected bounds.

If you ever change these constants, you need to change them in all relevant layers (client, gateway, backend) to stay consistent.

### 15) Varints and why they are used for bet vectors

The global table bet submission encodes the number of bets with a varint. That choice has two benefits:

- Small numbers of bets encode in a single byte.
- The format stays stable even if you allow more bets in the future.

However, it also means the decoder must parse a varint before it can compute the total payload length. This is standard in commonware-style codecs but can be surprising if you expect fixed-size headers.

### 16) Global table timing fields: what they mean

`encodeGlobalTableInit` encodes six time values:

- betting window
- lock window
- payout window
- cooldown window
- min bet
- max bet

In plain terms, these define the round lifecycle:

1) Players can place bets during the betting window.
2) The round locks, preventing new bets.
3) The outcome is revealed.
4) Payouts are computed and distributed.
5) A cooldown prevents immediate replay.

The times are encoded as u64 milliseconds. That may seem overkill, but it ensures long-run stability even if rounds last hours or days.

### 17) Worked example: encoding two roulette bets

Suppose a player places two roulette bets:

- Bet 1: type=0 (straight), value=17, amount=100
- Bet 2: type=1 (split), value=4, amount=50

The encoder builds:

```
[count=2][type0][value17][amount100][type1][value4][amount50]
```

Each bet is 10 bytes: 1 for type, 1 for value, 8 for amount.  
Total payload length = 1 + (2 * 10) = 21 bytes.

This is the exact buffer the backend expects. If you swapped bet type and value, the backend would interpret "17" as a type and "0" as a value, which would break payout logic.

### 18) Why endianness matters for all amounts

Every amount is encoded as big-endian. That means the most significant byte comes first.

If you accidentally used little-endian:

- The backend would read 100 as a huge number.
- Players could place "small" bets that become enormous on chain.

That is why every `setBigUint64` uses `false` for the endianness flag.

### 19) Instruction tags are the real API

Instruction tags are the entry points the backend switches on. If a tag changes, the backend will decode the wrong instruction type.

This is why `InstructionTag` is centralized in `constants.ts`. It is the "public API" of the instruction layer. Treat it like a protocol constant, not a casual enum.

### 20) A debugging checklist for instruction encoding

If the backend rejects an instruction, check the following:

1) Does the tag match the backend's expected tag?
2) Are all multi-byte integers big-endian?
3) Are length prefixes correct (especially payload length and bet counts)?
4) Is the payload size within the caps?
5) Does the instruction layout match the Rust struct exactly?

Most encoding bugs are one of these five issues. Having a checklist shortens debugging time.

### 21) Feynman explanation: packing a suitcase

Think of encoding as packing a suitcase with compartments:

- The tag is the label on the suitcase.
- Fixed-size fields are fixed compartments.
- Variable payloads are the clothes you place in after you measure the space.

If you put the clothes in the wrong compartment, the airport scanner (the backend) will reject the suitcase. The scanner is strict; it only accepts the exact arrangement it expects.

This analogy is why encoding must be precise.

---

### 22) Interop reminder: Rust is the source of truth

Even though the gateway encoders live in TypeScript, the execution engine is in Rust. That means the Rust definitions are the source of truth for what is valid.

Whenever you add or change an instruction, cross-check it against `types/src/execution.rs` and the relevant execution module. The gateway and backend must agree not just on field order, but also on value ranges and limits.

If you keep that in mind, you will avoid the most common class of errors: "gateway sends bytes the backend does not understand."

One practical habit: whenever you update an encoder here, add or update a golden test vector in both TypeScript and Rust. That keeps the formats aligned.

---

## Key takeaways
- Instructions are strict byte layouts; a single wrong byte breaks the chain interface.
- Game payloads are separate from top‑level instructions and have their own rules.
- Big‑endian and length fields must match Rust exactly.

## Next lesson
L04 - Transaction building + signing: `feynman/lessons/L04-transactions-signing.md`
