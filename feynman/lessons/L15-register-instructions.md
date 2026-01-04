# L15 - Register + deposit instruction encoding (from scratch)

Focus file: `gateway/src/codec/instructions.ts`

Goal: explain how the register and deposit instructions are encoded into bytes for on‑chain submission. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Instructions are byte layouts
The simulator expects instructions in a strict binary format. For register and deposit:
- **Register** includes a tag + name length + UTF‑8 bytes.
- **Deposit** includes a tag + amount.

### 2) Big‑endian encoding
All multi‑byte numbers here use **big‑endian** order. This must match Rust decoding exactly.

---

## Limits & management callouts (important)

1) **Player name length is capped**
- `encodeCasinoRegister` enforces `CASINO_MAX_NAME_LENGTH`.
- Oversized names are rejected before encoding.

2) **Deposit amount is u64**
- Max deposit is `2^64 - 1` in binary, but policy limits should cap this elsewhere.

---

## Walkthrough with code excerpts

### 1) CasinoRegister encoding
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
- Registration is the first on‑chain action. If this encoding is wrong, new users can’t join.

What this code does:
- Encodes the player name into UTF‑8 bytes.
- Allocates a buffer for tag + u32 length + name bytes.
- Writes the tag at byte 0 and the name length as big‑endian at byte 1.
- Copies the name bytes after the header.

---

### 2) CasinoDeposit encoding
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
- Faucet claims and chip deposits rely on this exact layout.

What this code does:
- Allocates a 9‑byte buffer.
- Writes the deposit tag at byte 0.
- Writes the amount as a big‑endian u64 starting at byte 1.

---

## Extended deep dive: byte‑level protocol for onboarding

These two instructions look simple, but they are the first bytes every player ever sends on chain. If they are wrong, onboarding fails completely. The rest of this section unpacks the exact byte layout and the reasoning behind it.

### 3) Byte‑by‑byte layout of `CasinoRegister`

The register instruction is:

```
[tag:1 byte][name_len:4 bytes BE][name_bytes...]
```

Example for name `"Alice"`:

- UTF‑8 bytes: `41 6c 69 63 65`
- Length: 5

So the encoded bytes are:

```
0a 00 00 00 05 41 6c 69 63 65
```

Where `0a` is the register tag (decimal 10). The length is encoded in big‑endian order:

```
00 00 00 05
```

This is a simple, unambiguous layout. The backend reads the tag, then reads exactly 4 bytes for the length, then consumes that many name bytes.

### 4) Why use UTF‑8 and a length prefix

Names can include non‑ASCII characters. UTF‑8 is the standard encoding that:

- supports all Unicode characters,
- has deterministic byte sequences,
- and is widely supported in Rust and TypeScript.

The length prefix is crucial because names are variable length. Without it, the backend would have no way to know where the name ends and the next field begins.

### 5) The `CASINO_MAX_NAME_LENGTH` guardrail

The gateway enforces a maximum length before encoding:

```ts
if (nameBytes.length > CASINO_MAX_NAME_LENGTH) {
  throw new Error(`CasinoRegister name exceeds ...`)
}
```

This protects the gateway from memory abuse and keeps transactions small. It also protects the backend: if a malicious client tried to send a 100 KB name, the gateway would refuse to build the instruction at all.

### 6) Byte‑by‑byte layout of `CasinoDeposit`

The deposit instruction is:

```
[tag:1 byte][amount:u64 BE]
```

That is always 9 bytes. For example, a deposit of 1000 chips is:

```
0b 00 00 00 00 00 00 03 e8
```

Where `0b` is the deposit tag (decimal 11), and `0x03e8` is 1000.

### 7) Why big‑endian everywhere

Big‑endian encoding is the commonware convention in this codebase. It keeps the TypeScript and Rust encoders aligned with commonware‑codec semantics.

The important point is not which endian you choose, but that you choose one and stick to it. Here, the entire instruction layer uses big‑endian, so every encoder and decoder must agree.

### 8) Interop with Rust: strictness matters

The Rust execution layer decodes these instructions directly from bytes. It expects:

- the register tag at byte 0,
- a 4‑byte big‑endian length at byte 1,
- UTF‑8 bytes immediately after.

If the gateway encoded length in little‑endian, Rust would read a huge length and either reject or attempt to read beyond the buffer.

That is why the “false” flag in `setUint32` is so important; it explicitly means big‑endian.

### 9) Deposit limits are policy, not encoding

The encoding itself does not cap the amount; it accepts any `u64`. That is intentional. The protocol allows large values, but the **policy layer** (on chain) decides what deposits are allowed.

This separation is common in blockchain systems:

- Encoding defines what is *possible*.
- Validation defines what is *allowed*.

So if you want to limit deposits, you do it in the execution logic, not here.

### 10) Common failure modes and how to detect them

If register or deposit transactions are rejected, check:

1) **Tag mismatch**: are you using the correct instruction tag?
2) **Length mismatch**: does the name length match the UTF‑8 byte length?
3) **Endianness**: are numeric values written big‑endian?
4) **Name too long**: does the gateway reject names over the cap?

These are the most common encoding mistakes.

### 11) Feynman analogy: packing a labeled box

Think of the instruction as a labeled box:

- The tag is the label.
- The length is the “weight sticker.”
- The contents are the bytes.

If the weight sticker does not match the contents, the shipping system (the backend) will reject the box. That is exactly what happens when you mis‑encode the length.

### 12) Suggested test vectors

Keep a few test vectors in the repo (both TS and Rust):

- Register `"Alice"` → bytes should match the example above.
- Deposit `1000` → bytes should match the example above.

These tests catch accidental changes in tag values, endianness, or length encoding.

### 13) Why this lesson exists separately from L03

L03 covers all instruction encoding. This lesson zooms in on register/deposit because they are the first on‑chain actions every user takes. If these two instructions are wrong, *nothing else matters*. That’s why they deserve their own deep‑dive.

### 14) Length fields: why u32 instead of varint

The register instruction uses a fixed 4‑byte length for the name rather than a varint. That is a deliberate tradeoff:

- **Pros**: constant‑time decode, fixed offset for the name bytes, simpler code.
- **Cons**: slightly larger payload for short names (4 bytes instead of 1).

In this protocol, readability and simplicity matter more than saving 3 bytes on a register message. That is especially true because registration is infrequent compared to gameplay.

### 15) Name encoding and normalization pitfalls

The gateway encodes names as UTF‑8, but it does not normalize them (e.g., Unicode NFC/NFD normalization). That means two visually similar names could encode to different byte sequences.

This is not a bug; it is a policy choice:

- The gateway treats names as raw strings.
- Any uniqueness or canonicalization rules should live on chain.

If you later need to enforce unique names, do it in the execution layer where you can define the policy clearly. The encoder’s job is to transmit bytes, not to decide what names are valid.

### 16) Buffer allocation size math

Both encoders pre‑allocate the exact buffer size:

- `1 + 4 + nameBytes.length` for register
- `9` for deposit

This is important for two reasons:

1) It avoids reallocation or resizing.
2) It makes the byte layout easy to reason about: every byte position is known in advance.

That is why you see manual offsets (`result.set(nameBytes, 5)`). It is deliberate, not accidental.

### 17) BigInt vs number: why it matters

Deposit amounts are `bigint` because JavaScript numbers are floating‑point and cannot precisely represent large integers.

If you accidentally passed a `number` into the deposit encoder, you could lose precision for large values, which would make the on‑chain amount wrong.

So the encoder uses `setBigUint64` and expects a `bigint`. This ensures the encoded bytes reflect the exact intended value.

### 18) How the backend decodes these bytes (mental model)

A Rust decoder for register might look like:

```rust
let tag = reader.read_u8();
let len = reader.read_u32_be();
let name = reader.read_bytes(len);
```

There is no schema registry or negotiation. The decoder simply trusts the tag and length. That is why the encoder must be exact.

For deposit:

```rust
let tag = reader.read_u8();
let amount = reader.read_u64_be();
```

This simplicity is a strength: fewer moving parts, fewer bugs.

### 19) Testing strategy: golden bytes

Because these encoders are tiny, the best tests are golden bytes:

- Build a known instruction in TypeScript.
- Check that the output bytes equal a fixed hex string.
- Decode the same bytes in Rust and ensure the parsed values match.

This kind of test catches accidental changes to tags, endianness, or length encoding.

### 20) Boundary conditions worth testing

Here are edge cases you should test explicitly:

1) Empty name (`""`) → length 0, no name bytes.
2) Max‑length name (`CASINO_MAX_NAME_LENGTH`) → should pass.
3) Name longer than max → should throw.
4) Deposit amount 0 → should still encode (policy may reject later).
5) Deposit amount `u64::MAX` → should encode (policy may reject later).

These tests do not require the backend; they validate the encoder itself.

### 21) Why deposit uses u64 even for “chips”

You might think chips could fit in a smaller type, but u64 has practical advantages:

- It matches commonware’s standard numeric types.
- It avoids future migration if the economy scale increases.
- It keeps the protocol consistent across instructions.

This is one of those “over‑engineering” choices that pays off later.

### 22) Security considerations

Encoding bugs can become security issues:

- If length prefixes are wrong, a malicious client could craft payloads that trigger backend panics or out‑of‑bounds reads (if the backend were unsafe).
- If you mis‑encode amounts, you could accidentally allow deposits larger than intended.

The gateway’s length caps reduce this risk. They stop oversized payloads before they reach the backend.

### 23) Interop with other clients

Even though the gateway is a primary client, other clients (web, scripts) may also encode register/deposit instructions. This is why the encoding must be documented and stable.

If you change the encoding here, you must change it everywhere else. Otherwise, you will fork your client ecosystem.

### 24) Protocol evolution strategy

If you ever need to change the register format (e.g., add a new field):

- you cannot just append bytes; the backend decoder would break,
- you need a new instruction tag or a versioned format.

The safest strategy is to introduce a new instruction tag (e.g., `CasinoRegisterV2`) and keep the old one for backward compatibility.

### 25) Feynman summary

Register and deposit are the simplest instructions, but they are also the foundation of onboarding. They are like the first pages of a book: if they are wrong, you never get to the rest.

That is why we obsess over byte offsets, endianness, and length fields. The simplicity of the encoding is a feature, not a limitation.

### 26) Worked UTF‑8 example with multi‑byte characters

Consider the name `"Zoë"`:

- `Z` = `0x5a`
- `o` = `0x6f`
- `ë` = `0xc3 0xab` (two bytes in UTF‑8)

So the UTF‑8 byte array is 4 bytes long, not 3. The length prefix must be 4, not the number of characters.

Encoded register bytes:

```
0a 00 00 00 04 5a 6f c3 ab
```

This example shows why we cannot compute length using `name.length` (character count). We must use the byte length of the UTF‑8 encoding.

### 27) Table view: register instruction layout

Here is a byte‑offset table:

| Offset | Size | Field       | Notes |
|-------:|-----:|-------------|-------|
| 0      | 1    | tag         | `CasinoRegister` |
| 1      | 4    | name length | u32 big‑endian |
| 5      | N    | name bytes  | UTF‑8 |

For deposits:

| Offset | Size | Field  | Notes |
|-------:|-----:|--------|-------|
| 0      | 1    | tag    | `CasinoDeposit` |
| 1      | 8    | amount | u64 big‑endian |

Having this table makes cross‑language implementation much easier: you can hand it to a Rust engineer or a mobile engineer and they can implement it without reading the TypeScript.

### 28) How these encoders interact with transaction building

The encoder does *not* sign or submit anything. It only produces instruction bytes. Those bytes are then embedded in a transaction:

```
transaction = [nonce][instruction][pubkey][signature]
```

That means any error at the instruction level is “locked in” by the signature. You cannot fix it later.

This is why the encoder must be correct before you ever sign. Once signed, the bytes are immutable.

### 29) Handling empty or whitespace names

The encoder accepts any string, including empty or whitespace‑only names. The on‑chain policy decides whether that is allowed.

If you want to enforce stricter naming rules (e.g., non‑empty, alphanumeric), do it at the gateway validation layer before encoding. Encoding should be a pure transformation, not a policy engine.

### 30) Why register/deposit instructions are stable

Unlike game moves, register/deposit instructions rarely change. They are foundational and simple. That stability is valuable:

- it minimizes client upgrades,
- it keeps onboarding consistent across app versions,
- and it makes external tooling easier to write.

This is also why their tags are rarely touched. If you ever change them, you will invalidate every client that still uses the old tags.

### 31) Recommended documentation snippet

If you are writing public docs for third‑party clients, you can use a concise description like:

```
CasinoRegister: tag 0x0a, u32 length, UTF‑8 name bytes
CasinoDeposit:  tag 0x0b, u64 amount
```

This is enough for any client to implement the encoding in any language.

### 32) When to revisit these encoders

Only revisit these encoders if:

- you need to add new fields to registration,
- you change on‑chain policy to require extra metadata,
- or you migrate to a different identity scheme.

Otherwise, treat them as stable protocol primitives. Unnecessary changes here introduce risk without user‑visible benefit.

### 33) Decoder pitfalls to avoid

When writing decoders, avoid these common mistakes:

- **Using signed integers for amounts**: amounts are unsigned u64. If you decode into a signed type, large values will appear negative.
- **Assuming ASCII**: UTF‑8 names can include multi‑byte characters. Always use UTF‑8 decoding.
- **Reading length as little‑endian**: a length of 5 encoded as BE (`00 00 00 05`) will look like 83 million in LE.

These are not hypothetical; they are the most common bugs when porting encoders.

### 34) Example: quick hex dump helper

When debugging, it is useful to print the encoded bytes as hex. A minimal helper might be:

```ts
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

Then you can log:

```ts
console.log(toHex(encodeCasinoRegister("Alice")));
```

If the hex string does not match your expected vector, you know the bug is in the encoder, not the transaction or backend.

### 35) How to ensure cross‑language consistency

A simple practice that saves time:

1) Pick a set of sample inputs (names and deposit amounts).
2) Encode them in TypeScript.
3) Encode them in Rust.
4) Compare the hex output byte‑for‑byte.

Do this whenever you change instruction tags or encoding logic. It is faster than debugging a full end‑to‑end flow.

### 36) Security note: length caps are not enough

The name length cap protects memory, but it does not protect against offensive or malicious names. If you need content moderation, you must implement it at the gateway validation layer or on chain.

Encoding is deliberately blind to semantics. That is a core design principle: the encoder should never make policy decisions beyond basic size limits.

### 37) Minimal mental model

If you remember only one thing, remember this:

> Register = tag + length + name bytes  
> Deposit = tag + amount

Everything else is detail. This simple model is enough to reason about 90% of bugs.

### 38) Relationship to constants and config

The name length cap comes from `@nullspace/constants/limits`. That means it is shared across multiple clients and the backend.

This is a good pattern: if you change the limit, you change it once, and every component updates together. It reduces configuration drift and prevents subtle mismatches.

The deposit amount, by contrast, does not have a hard cap in the encoder. Any cap should live in the execution policy, not in the encoding layer. That separation keeps the protocol flexible while still enforcing economic rules.

If you want to expose these limits to clients, do it via documented constants, not by hard‑coding them in UI. That keeps clients aligned with the protocol.

### 39) Quick self‑check exercise

Take the name `"Bob"` and amount `42`. Without looking at code:

- Write the register bytes in hex.
- Write the deposit bytes in hex.

Then compare to the encoder output. If they match, you truly understand the instruction format.

If you can do this for register and deposit, you can generalize the method to every other instruction in the system. That’s the core skill: translate intent into bytes with zero ambiguity. This is how protocol engineers think. Practice it often. Once you can do that, debugging cross-language mismatches becomes much faster and far less frustrating because you always know which byte is wrong in context.

---

## Key takeaways
- Register and deposit are simple but strict byte layouts.
- Big‑endian encoding must match Rust decoding exactly.

## Next lesson
L16 - Register transaction building: `feynman/lessons/L16-register-transactions.md`
