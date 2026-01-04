# L24 - Rust types (register + deposit) (from scratch)

Focus file: `types/src/execution.rs`

Goal: explain how register/deposit instructions and events are defined and encoded in Rust. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Instruction tags
Instructions are tagged by a single byte (opcode). Register and deposit are tags 10 and 11.

### 2) Event tags
Events carry the results of register/deposit. These are emitted and streamed to clients.

### 3) Length limits are enforced in Rust
Even if the gateway sends long names, Rust will reject names beyond `CASINO_MAX_NAME_LENGTH`.

---

## Limits & management callouts (important)

1) **CASINO_MAX_NAME_LENGTH**
- Enforced at decode time for `CasinoRegister`.
- Must match client-side limits to avoid confusing rejections.

2) **CASINO_MAX_PAYLOAD_LENGTH**
- Used for game moves, but shows how Rust enforces payload bounds.

---

## Walkthrough with code excerpts

### 1) Instruction enum (register + deposit)
```rust
pub enum Instruction {
    // Casino instructions (tags 10-17)
    /// Register a new casino player with a name.
    /// Binary: [10] [nameLen:u32 BE] [nameBytes...]
    CasinoRegister { name: String },

    /// Deposit chips (for testing/faucet).
    /// Binary: [11] [amount:u64 BE]
    CasinoDeposit { amount: u64 },
    // ... other instructions ...
}
```

Why this matters:
- These definitions are the source of truth for binary layouts.

What this code does:
- Declares the register and deposit instructions and documents their byte format.

---

### 2) Decode register + deposit with limits
```rust
pub const CASINO_MAX_NAME_LENGTH: usize = crate::casino::MAX_NAME_LENGTH;

impl Read for Instruction {
    fn read_cfg(reader: &mut impl Buf, _: &Self::Cfg) -> Result<Self, Error> {
        let kind = u8::read(reader)?;
        let instruction = match kind {
            tags::instruction::CASINO_REGISTER => {
                let name_len = u32::read(reader)? as usize;
                if name_len > CASINO_MAX_NAME_LENGTH {
                    return Err(Error::Invalid("Instruction", "casino name too long"));
                }
                if reader.remaining() < name_len {
                    return Err(Error::EndOfBuffer);
                }
                let mut name_bytes = vec![0u8; name_len];
                reader.copy_to_slice(&mut name_bytes);
                let name = String::from_utf8(name_bytes)
                    .map_err(|_| Error::Invalid("Instruction", "invalid UTF-8 in casino name"))?;
                Self::CasinoRegister { name }
            }
            tags::instruction::CASINO_DEPOSIT => Self::CasinoDeposit {
                amount: u64::read(reader)?,
            },
            _ => { /* ... */ }
        };
        Ok(instruction)
    }
}
```

Why this matters:
- This is the exact server‑side validation the gateway must satisfy.

What this code does:
- Reads the opcode and branches on register vs deposit.
- Enforces a maximum name length and valid UTF‑8 for registration.
- Reads the deposit amount as a u64.

---

### 3) Event enum (registration + deposit results)
```rust
pub enum Event {
    CasinoPlayerRegistered {
        player: PublicKey,
        name: String,
    },
    CasinoDeposited {
        player: PublicKey,
        amount: u64,
        new_chips: u64,
    },
    // ... other events ...
}
```

Why this matters:
- These events are what the client sees after register/deposit.

What this code does:
- Defines the event payloads that are broadcast to updates streams.

---

## Extended deep dive: the register/deposit ABI as a contract

The `types/src/execution.rs` file is the canonical ABI for the chain. It is not just a Rust file; it is the single source of truth for how bytes on the wire become instructions and events. This section explains the register/deposit types as if they were a formal protocol specification.

---

### 4) Tags are the protocol's language, not just numbers

Every instruction is identified by a one-byte tag. For register and deposit, those tags are 10 and 11 respectively. These values are not arbitrary; they are part of a protocol contract between:

- the gateway (which encodes instructions),
- the execution engine (which decodes and applies),
- the clients (which sometimes decode events directly).

If you change a tag, you are effectively changing the language. All clients must be updated in lockstep, or you will get silent misinterpretations. That is why tags live in a dedicated `tags` module and are treated as stable.

A useful mental model: tags are like ASCII characters in a file format. If you change the code point for "A", no parser will understand your file anymore.

---

### 5) Instruction encoding: tag + payload

The instruction encoding pattern is always:

```
[ opcode: u8 ][ payload bytes... ]
```

For register, the payload is a length-prefixed UTF-8 string:

```
[ 10 ][ name_len: u32 ][ name_bytes... ]
```

For deposit, the payload is a fixed-size amount:

```
[ 11 ][ amount: u64 ]
```

The payload format is defined by the Write impl for `Instruction`. If you want to know the exact byte layout, do not guess: read the Write impl. It is the authoritative definition.

---

### 6) A byte-level example: register "Ada"

Let's encode the name "Ada" (3 bytes). The register instruction becomes:

- opcode = 10 (0x0A)
- name_len = 3 (0x00 00 00 03)
- name_bytes = 0x41 0x64 0x61

Final encoding:

```
0A 00 00 00 03 41 64 61
```

If a gateway encodes anything else, the backend will reject it. This is why frontends must mirror the backend's encoder.

---

### 7) A byte-level example: deposit 1000

Deposit encodes as:

- opcode = 11 (0x0B)
- amount = 1000 (0x00 00 00 00 00 00 03 E8)

Final encoding:

```
0B 00 00 00 00 00 00 03 E8
```

This shows the simplicity of deposit compared to register. It is a fixed-length payload and therefore simpler to validate.

---

### 8) Decode rules: defensive parsing

The Read impl for Instruction enforces multiple guards:

- It reads the opcode first.
- It checks the length for string payloads.
- It validates UTF-8 for names.
- It errors with `EndOfBuffer` if bytes are missing.

This makes the decoder robust against truncated or malformed transactions. The gateway should never send such input, but the network must assume that it might receive arbitrary bytes.

---

### 9) Length limits are protocol-level, not UI-level

`CASINO_MAX_NAME_LENGTH` is enforced at decode time. This matters because UI limits are easy to bypass. Only the protocol-level limit guarantees that malicious users cannot submit oversized names.

The limit is defined in `types/src/casino/constants.rs` and re-exported in `execution.rs` so the decoder can enforce it. If the UI uses a different limit, users will experience confusing rejections. This is why length limits must be kept consistent across frontend and backend.

---

### 10) EncodeSize: predicting size without encoding

`Instruction` implements `EncodeSize` so we can compute its size without serializing. This is useful for:

- checking maximum submission size,
- estimating block size,
- preallocating buffers.

For register, the encode size is `1 + 4 + name.len()`. For deposit, it is `1 + 8`.

This is not just micro-optimization. In high-throughput systems, knowing sizes ahead of time helps avoid repeated allocations and reduces latency.

---

### 11) Transaction layout: where instructions live

The instruction is embedded inside the `Transaction` type, which adds:

- public key
- nonce
- signature

The instruction encoding defines only the payload. The transaction encoding wraps it with identity and replay protection. That is why opcode correctness alone is not enough; the transaction must also have a valid signature and nonce.

---

### 12) Events: the mirror of instructions

Events are the public output of execution. For register/deposit, the key event tags are:

- `CASINO_PLAYER_REGISTERED` (tag 20)
- `CASINO_DEPOSITED` (tag 41)

Event encoding is also tag + payload. For example, `CasinoPlayerRegistered` encodes as:

```
[ 20 ][ player:PublicKey ][ name_len:u32 ][ name_bytes... ]
```

`CasinoDeposited` encodes as:

```
[ 41 ][ player:PublicKey ][ amount:u64 ][ new_chips:u64 ]
```

Notice that the event includes the updated chip balance. This makes the event self-contained, so the client does not need to read state to know the new balance.

---

### 13) Why event tags are not consecutive

Event tags are grouped by subsystem. Register events live in the 20-24 range, while deposit lives at 41. This looks odd but is intentional: it reflects historical evolution and grouping. The important takeaway is that **tags are stable even if the ranges are not aesthetically sequential**.

Changing a tag to "make it look nice" would break backward compatibility. Stability beats neatness.

---

### 14) Range-bound decoding for safety

For some instructions, the decoder uses `ReadRangeExt` to limit payload length (e.g., game move payloads). Register uses a custom length check for name. The principle is the same: all variable-length fields have upper bounds.

This is a security requirement. Without upper bounds, a malicious transaction could allocate enormous buffers and cause denial-of-service.

---

### 15) ABI evolution and backwards compatibility

When new instructions are added, they get new tags. Existing tags cannot be repurposed. This is the blockchain equivalent of a database migration: you must maintain backward compatibility because old transactions may exist forever.

A common pattern is:

1) Add a new instruction tag.
2) Leave the old tag in place.
3) Deprecate the old tag in clients, but keep decoder support.

This is how you evolve the protocol without breaking nodes that still process old blocks.

---

### 16) Why register/deposit are simple by design

Register and deposit are intentionally simple instructions:

- They use fixed or small variable-length payloads.
- They carry only essential data.
- They are easy to validate.

This matters because they are the first instructions any user sees. Complexity should scale with advanced actions, not with onboarding.

---

### 17) Common pitfalls for implementers

1) **Incorrect endian assumption**: integers must be encoded exactly as `commonware_codec` defines them. Do not assume a different byte order.
2) **UTF-8 handling**: names must be valid UTF-8. Raw bytes will be rejected.
3) **Length mismatch**: the length prefix must equal the number of bytes, not the number of characters.
4) **Name length limit**: enforce the same max length in UI to avoid backend rejections.

These are the most common reasons for "instruction invalid" errors.

---

### 18) Testing strategies

To test register/deposit encoding:

- Write a test that encodes a register instruction and compares the byte sequence to a known hex string.
- Write a test that decodes the same bytes and verifies the struct fields.
- Write a negative test with a too-long name and ensure decoding fails.
- Write a test with invalid UTF-8 and ensure decoding fails.

These tests are cheap and give high confidence that the ABI is stable.

---

### 19) Feynman model: mail envelopes

Imagine instructions as envelopes:

- The opcode is the label on the envelope.
- The payload is the letter inside.
- The length prefix is the "number of pages" in the letter.

Register is a longer letter because it includes a name. Deposit is a short note with a single number. The decoder is the postal worker who rejects any envelope with the wrong label or an inconsistent page count.

---

### 20) How the backend enforces limits even if the gateway is wrong

Even if the gateway sends an oversized name, the decoder will reject it. That means the chain enforces its own safety boundary. This is crucial for a decentralized system: you cannot assume all clients are well-behaved.

The gateway should still enforce limits to avoid wasting user transactions, but the definitive check is in the types layer.

---

### 21) Where to look when adding new fields

If you ever need to add a field to register (for example, an avatar URL), you must update:

1) The Instruction enum variant.
2) The Write impl for Instruction.
3) The Read impl for Instruction.
4) The EncodeSize impl.
5) Any client encoders/decoders.

Missing any of these steps results in broken decoding or incorrect size estimates.

---

### 22) Exercises for mastery

1) Encode the name "Zoe" manually and verify the hex string.
2) Explain why `name_len` is a u32 and not a u16.
3) Trace how a malformed name (invalid UTF-8) becomes an `Error::Invalid` result.
4) Describe how the event tags map to UI behavior in the updates stream.

If you can answer these, you understand the register/deposit ABI at a deep level.


## Advanced topics: events, errors, and ABI stability

This addendum explains the parts of the ABI that are easy to overlook: event decoding, error payloads, and the practical impact of ABI changes on clients.

---

### 23) Event decoding mirrors instruction decoding

Just like instructions, events are decoded with a tag and payload. The decoder applies length checks and UTF-8 validation. For `CasinoPlayerRegistered`, the event decoder enforces the same `CASINO_MAX_NAME_LENGTH` as the instruction decoder. This guarantees that a validator never emits an event with an oversized or invalid name.

This is important because events are not always trusted. Nodes exchange events; clients might parse them directly. Validating them at decode time keeps the system robust.

---

### 24) Error event payloads have their own limit

`CasinoError` is a structured event:

```
player: PublicKey
session_id: Option<u64>
error_code: u8
message: String
```

The decoder enforces a maximum error message length (`MAX_ERROR_MESSAGE_LENGTH = 256`). This prevents oversized error messages from becoming a denial-of-service vector. It also keeps error events compact for UI consumption.

When you add new error messages, keep them concise. A short, stable string is better than a long paragraph. Clients often map error codes to localized messages anyway.

---

### 25) Why EncodeSize exists for Event too

Events also implement `EncodeSize`. This allows upstream systems to estimate block sizes and buffer allocations without serializing every event. It is particularly useful when you are constructing outputs in memory before persistence.

If you add fields to an event but forget to update `EncodeSize`, you will get subtle size mismatches. These can lead to out-of-bounds reads or incorrect buffer allocations, which are hard to debug. This is why EncodeSize is part of the ABI contract.

---

### 26) ABI changes are protocol changes

It is tempting to treat this file as "internal Rust" and refactor freely. That would be a mistake. The encoding here is a protocol contract. Any change to:

- tags
- field ordering
- length prefixes
- integer sizes

is a protocol change. That means all validators, gateways, and clients must update in lockstep. In decentralized systems, this kind of change should be treated like a hard fork.

A good heuristic: if changing a line in `execution.rs` affects how bytes are serialized, assume it is a protocol change.

---

### 27) Compatibility strategy when adding new fields

If you need to add new data to register or deposit, you have two safe options:

1) Add a new instruction tag and keep the old one untouched.
2) Add a versioned wrapper around the payload (e.g., include a version byte).

Option 1 is simplest. It preserves backward compatibility and allows old nodes to keep decoding old instructions. Option 2 is more flexible but requires more careful client coordination.

The current design uses option 1 for most changes (new tags for new features).

---

### 28) Frontend coupling: why encoders must match exactly

The gateway and frontend encode instructions in JavaScript/TypeScript. If their encoding differs by even one byte, the backend will reject the instruction. Common pitfalls:

- Using character length instead of byte length for UTF-8.
- Forgetting to include the length prefix.
- Using the wrong integer size (u16 vs u32).
- Using a different endian order than the codec.

This is why the lessons earlier emphasize "backend is the source of truth." When in doubt, derive the encoder directly from this file.

---

### 29) Size limits interact with gateway submission limits

The gateway enforces `maxSubmissionBytes`. That limit should be compatible with `EncodeSize` for instructions and transactions. If you allow a register instruction name that barely fits into the transaction size, you still need to account for the surrounding transaction envelope (signature, public key, nonce, etc.).

A safe practice is to compute the full transaction size on the client using the same logic as `EncodeSize`, not just the instruction size. That prevents oversize submissions.

---

### 30) The ABI is a documentation artifact

You can treat `types/src/execution.rs` as a machine-readable protocol specification. This is useful for:

- generating client SDKs,
- auditing network compatibility,
- producing wire-level documentation.

If you ever build a formal spec, this file is the primary source. That is why the file comments that include "Binary: [tag] [field...]" are valuable; they are proto-docs embedded in code.

---

### 31) Exercises for mastery

1) Locate the `CasinoError` event encoding and explain each field's type and size.
2) Calculate the maximum possible byte length of a register instruction payload.
3) Explain why a register instruction with a 300-byte UTF-8 name is rejected even if the gateway UI allows it.
4) Identify all places in `execution.rs` that must be updated if you add a new field to `CasinoRegister`.

If you can answer these, you understand the ABI at a systems level.


### 32) Option encoding: why errors include session_id

`CasinoError` includes `session_id: Option<u64>`. In the codec, `Option<T>` is encoded with a presence flag followed by the value when present. This is small but important: it lets the same error event format work for both session-scoped errors (like a specific game) and account-wide errors (like registration or faucet).

When you see a `CasinoError` event with `session_id = None`, it means the error is not tied to a particular game session. For register and deposit, that is the expected case. If you ever extend register/deposit with session-specific semantics, you already have a place to attach that context without changing the ABI.

This is a good example of forward-compatible design: the event format anticipates multiple contexts without exploding the number of event variants.


### 33) Unsigned integers and BigInt bridges

On the Rust side, amounts are `u64`. On the gateway side, JavaScript uses `bigint` for the same values. This mismatch is a common source of bugs if a client accidentally uses `number` (which loses precision past 2^53). The ABI assumes full 64-bit precision. That is why the gateway code stores nonces and amounts as BigInt and serializes them with explicit 64-bit encoders. Treat this as a strict rule: any client that uses floating-point numbers for on-chain amounts will eventually break.


## Key takeaways
- Rust types define the authoritative register/deposit layouts.
- Name length and UTF‑8 validation happen on the backend.
- Events are the public output of registration and deposits.

## Next lesson
L25 - Web nonce manager: `feynman/lessons/L25-web-nonce-manager.md`
