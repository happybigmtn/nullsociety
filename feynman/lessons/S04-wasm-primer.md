# S04 - WASM pipeline: web transaction builders and canonical encoding

Focus file: `website/wasm/src/lib.rs` plus the JS bridge `website/src/api/wasm.js`

Goal: explain how the web app uses WASM to encode and sign transactions exactly the same way as Rust nodes do, why this matters for consensus, and how each key function in the WASM layer fits into the end to end flow.

---

## Learning map

This chapter is long. The shortest path to usefulness is:

1) Sections 1 to 3 for the idea of canonical encoding and why WASM exists here.
2) Sections 4 to 7 for the core exported functions (Signer, Transaction, encode keys, digest).
3) Sections 8 to 10 for decoding updates, proofs, and testing helpers.

If you already know WASM, focus on Sections 5 and 6. If you are new to WASM, start at Section 1.

---

## 1) What problem the WASM layer solves

### 1.1 The problem

We have one chain, many clients: Rust nodes, a web UI, and mobile clients. All of them must encode transactions the same way. If a client encodes a transaction differently, the chain rejects it. That leads to user-visible failures and is painful to debug.

If we implemented transaction encoding separately in Rust and JavaScript, we would risk subtle mismatches:

- Endianness bugs (big endian vs little endian).
- Different string encodings.
- Off-by-one errors in length prefixes.
- Missing domain separation or namespace bytes.

### 1.2 The solution: compile the Rust logic to WASM

The repo solves this by compiling a Rust crate to WebAssembly and using it in the web app. That crate is `website/wasm`.

Key idea:

- The authoritative transaction encoding lives in Rust (`nullspace_types` and `types/src/execution.rs`).
- The WASM crate uses the same Rust types and encoding logic.
- JavaScript calls into WASM rather than reimplementing encoding.

This guarantees that the client and the chain use the same byte layout.

---

## 2) Where the WASM layer lives in the repo

Key locations:

- `website/wasm/src/lib.rs`: the Rust code compiled to WASM.
- `website/wasm/pkg/*`: generated WASM bindings.
- `website/src/api/wasm.js`: JS wrapper around the WASM exports.

The JS wrapper creates a higher level API: it initializes the WASM module, instantiates a `Signer`, and exposes helper methods to the rest of the web app.

This is the central place where web UI transactions get constructed and signed.

---

## 3) Why canonical encoding matters so much

A blockchain is a replicated state machine. Every node must reach the same state given the same inputs. If two nodes read the same transaction bytes but parse them differently, consensus breaks. If a client produces bytes that are not canonical, nodes reject them.

Canonical encoding is enforced by:

- Using a single encoding library (`commonware_codec`).
- Defining precise byte layouts in `nullspace_types`.
- Using the WASM layer to reuse the Rust implementation.

This is why the WASM crate is not just a convenience. It is a correctness layer.

---

## 4) Structure of `website/wasm/src/lib.rs`

The file is large, but you can mentally group it into sections:

1) Instruction kind definitions (macro + enum)
2) Signer (key management for dev/test)
3) Transaction constructors (one per instruction)
4) Encoding helpers (keys, filters, queries)
5) Hashing and digest helpers
6) Decoders (lookup, seed, updates)
7) Testing helpers (execute_block, encode_seed)
8) Submission wrappers

Each section is a bridge between JS and Rust types. The JS world passes bytes and numbers; the Rust world understands real types like `Instruction`, `Key`, and `Update`.

---

## 5) InstructionKind: stable IDs for UI and analytics

The top of `lib.rs` defines a macro `define_instruction_kinds!`. This macro generates an enum `InstructionKind` exported to WASM.

Why this exists:

- The UI sometimes wants a stable numeric ID and a human-readable name.
- We need to avoid duplicating logic across JS and Rust.

The macro does three things:

1) Defines the enum with fixed discriminants.
2) Implements `from_instruction` to map a real `Instruction` to the enum.
3) Implements `as_str` to return a canonical name.

There are tests (in the generated `instruction_kind_tests` module) that ensure discriminants and names are unique. This is a subtle but important guarantee: if two instruction kinds had the same discriminant, the UI could mislabel a transaction.

---

## 6) Signer: local keys for dev and testing

### 6.1 What the Signer is

The `Signer` struct in `lib.rs` is a WASM-exported wrapper that stores an Ed25519 private key and public key.

Important security note (from the code): this is for development and testing. The private key lives in WASM memory, which is not secure enough for production custody.

### 6.2 Key methods

- `new()`: generates a fresh private key using `OsRng`.
- `from_bytes()`: constructs a signer from an encoded private key.
- `public_key` and `public_key_hex`: return the public key.
- `private_key` and `private_key_hex`: only available when the `private-key-export` feature is enabled.
- `sign(message)`: signs the provided message with `TRANSACTION_NAMESPACE`.

This last point is important. The Signer signs a transaction payload with the transaction namespace, not a raw message. That is the same domain separation that the Rust execution logic expects.

### 6.3 How JS uses it

In `website/src/api/wasm.js`, the wrapper typically constructs a `Signer` when the web client is managing keys locally. It then calls WASM functions to build transactions.

In production, we want to move toward external key management (vaults, passkeys, or external wallets). But the Signer is extremely useful for local testing and automated QA runs.

---

## 7) Transaction constructors: type-safe signing in WASM

### 7.1 The Transaction wrapper

`lib.rs` defines a WASM-exposed `Transaction` struct that wraps `nullspace_types::execution::Transaction`.

It exposes:

- `encode()`: returns transaction bytes.
- `instruction_kind()` and `instruction_name()`: map to the `InstructionKind` enum.

### 7.2 One constructor per instruction

There is a constructor function for each instruction type. Examples:

- `casino_start_game`
- `casino_game_move`
- `casino_register`
- `stake`, `unstake`, `claim_rewards`
- `bridge_withdraw`, `bridge_deposit`, `finalize_bridge_withdrawal`
- `global_table_*`

Each constructor does three important things:

1) Converts JS-friendly parameters (u8 values, bytes, etc.) into Rust enums or structs.
2) Builds an `Instruction` value.
3) Signs it using `ExecutionTransaction::sign` and the provided `Signer`.

This gives JS a safe, typed way to produce correct transaction bytes.

### 7.3 Example flow: casino_start_game

Inside `casino_start_game`:

- A `game_type: u8` is mapped to the Rust enum `GameType`.
- An `Instruction::CasinoStartGame` is created with `bet` and `session_id`.
- `ExecutionTransaction::sign` is called with the Signer private key, nonce, and instruction.
- A new `Transaction` wrapper is returned.

This ensures that a user starting a game produces a byte-for-byte correct transaction for the chain.

---

## 8) Encoding helpers: keys, filters, queries

The WASM layer also exposes several encoding helpers that are used by the UI and gateway.

### 8.1 Key encoding

Functions like `encode_account_key`, `encode_vault_key`, and `encode_lp_balance_key` take a public key or identifier and return the canonical encoded key bytes.

These helpers call into `nullspace_types::execution::Key`, which is the canonical enum of all state keys. This matters because state queries require the exact encoded key bytes, and those bytes are hashed before they hit the database.

### 8.2 Updates filters

Functions `encode_updates_filter_all`, `encode_updates_filter_account`, and `encode_updates_filter_session` return canonical filters for the updates stream.

The updates stream is how clients subscribe to events. The filter encoding is consensus-critical because the backend verifies filter structure and lengths.

### 8.3 Query encoding

`encode_query_latest` and `encode_query_index` return encoded `Query` values for state queries. Again, this is canonical encoding reused from Rust.

### 8.4 Hashing keys

`hash_key` is a small but important helper. It takes an encoded key and hashes it with SHA-256. That matches the Rust storage system. The UI uses this for explorer requests: it hashes a key into a hex string used in `/state/<keyhash>` URLs.

---

## 9) Digest helper: explorer-friendly transaction IDs

The function `digest_transaction` takes transaction bytes and returns the transaction digest as hex. The docstring explicitly says it matches `Transaction::digest()` in Rust.

Why this exists:

- The explorer UI wants a stable identifier for a transaction.
- The digest excludes the signature, so it identifies the intent rather than the signature bytes.
- Using the WASM version ensures the digest is computed identically to Rust.

If your explorer displays a digest that does not match the backend, this is the first function to inspect.

---

## 10) Decoding: turning bytes back into JSON

The chain produces binary updates and events. The WASM layer includes decoders so the UI can interpret those bytes without reimplementing Rust decoding in JS.

### 10.1 `decode_lookup`

This function decodes a raw state lookup response into a JSON-friendly object. It understands the `Value` enum from `nullspace_types` and maps it into a JSON structure that the UI expects.

### 10.2 `decode_seed`

This decodes a consensus seed (BLS signature over a round) and verifies it using the network identity. It is used for verifying randomness seeds and consensus events.

### 10.3 `decode_update`

`decode_update` handles `Update` values, which can contain:

- Seed updates
- Events updates
- Filtered events updates

The function verifies the BLS signatures embedded in the updates using the provided `identity` (a BLS public key). If verification fails, it returns an error. This is important because updates can arrive from untrusted sources, and the UI should never accept invalid events.

This is also where you see the system's consensus layer peeking into the UI layer. The UI does not just display events; it verifies them.

---

## 11) Testing helpers: deterministic execution in the browser

The WASM crate exposes several functions behind the `testing` feature flag. These are used for QA, demos, and deterministic simulations.

### 11.1 `get_identity`

This function derives a BLS public key from a deterministic seed. It allows the UI to test consensus-related features without running a full node.

### 11.2 `encode_seed`

This function creates a signed `Seed` using a deterministic seed and a view number. It uses a namespace (`NAMESPACE || _SEED`) to domain-separate the seed signature.

### 11.3 `execute_block`

This is the heavyweight helper. It:

- Derives a network keypair from a seed.
- Decodes a list of transaction bytes.
- Runs the execution logic in a deterministic runtime (`commonware_runtime::deterministic::Runner`).
- Produces a `Summary` that includes outputs and state updates.

This lets you run an entire block execution in the browser, which is extremely helpful for QA and local testing. It is not intended for production, but it is a huge accelerator for developers.

---

## 12) Submission wrappers

At the very bottom you will find `wrap_transaction_submission`, `wrap_summary_submission`, and `wrap_seed_submission`.

These functions take raw bytes (transaction, summary, seed), decode them into the Rust types, and then wrap them into a `Submission` enum. This is the format expected by the `/submit` endpoint.

The key idea: the submit API expects a `Submission` enum, not raw transaction bytes. The WASM layer helps the client produce that correct envelope.

If you get errors like "invalid submission tag" or "failed to decode transaction", the bug is often in how the client is wrapping or not wrapping submissions.

---

## 13) The full web pipeline in one pass

Here is the complete data flow from UI to chain, tying together the functions we just described:

1) UI event triggers an action (start game, deposit, etc.).
2) JS calls a WASM transaction constructor (for example, `transaction_casino_start_game`).
3) WASM builds the `Instruction`, adds the nonce, and signs it with the Signer.
4) WASM returns encoded transaction bytes.
5) JS optionally wraps it in a `Submission` via `wrap_transaction_submission`.
6) JS sends bytes to `/submit`.
7) Backend decodes the `Submission`, verifies signatures, checks nonce, and includes in a block.
8) Chain emits events; updates are streamed back to clients.
9) JS receives updates and uses `decode_update` to verify and interpret them.

This pipeline is the core of the web client's correctness. Every step is using the same Rust types, just compiled into WASM.

---

## 14) Security boundaries and warnings

The code itself contains explicit warnings about the Signer. These are not decorations. They are telling you that:

- Storing private keys in WASM memory is not safe for production.
- The `private-key-export` feature should remain disabled in production builds.
- Production should use external key storage (vaults, passkeys, or wallets).

Remember: WASM helps with correctness, not custody. We should be very careful to keep those concerns separate.

Another boundary to remember is trust in the gateway. The WASM layer can verify event signatures, but it does not validate every API response. If the gateway returns malformed data outside the update stream, the UI can still be confused. That is why the project focuses on using signed updates for state changes, and why the WASM layer includes decoders for `Update` and `Lookup` responses. Wherever possible, we want to treat data as signed, typed, and verifiable, rather than as ad-hoc JSON.

Finally, notice that the WASM layer does not enforce business rules such as "shield only allowed in tournaments". It only builds transactions. The chain enforces rules during execution. This is another security boundary: the client may try to submit invalid instructions, but the chain decides what is accepted. The WASM layer does not replace validation; it replaces byte encoding bugs.

---

## 15) Common pitfalls and how to debug them

### 15.1 Wrong instruction values

If a JS client passes the wrong enum value (for example, game type 7 when it should be 5), the WASM layer will usually return a JS error. These match statements exist to prevent silent failures.

### 15.2 Incorrect public key bytes

Many encode functions expect a 32-byte public key. If you pass hex strings or wrong lengths, the `ed25519::PublicKey::read` call will fail. That is an early warning that your key formatting is wrong.

### 15.3 Using raw transaction bytes instead of Submission

If you send raw transaction bytes to `/submit` without wrapping them, the backend will reject the submission tag. This is why `wrap_transaction_submission` exists.

### 15.4 Misunderstanding testing-only functions

`execute_block` and `encode_seed` are only compiled when the `testing` feature is enabled. If you try to call them in production builds, they will not exist. This is by design.

When debugging, it is often useful to open the generated bindings in `website/wasm/pkg/nullspace_wasm.d.ts`. That file documents each exported function and includes important docstrings (for example, the exact digest formula). If your JS code calls a function that has different arguments than expected, the bindings are a fast source of truth. The bindings are generated from the Rust source, so they are always current for the compiled WASM.

---

## 16) JS <-> WASM boundary: memory, bytes, and why encoding helpers exist

It is easy to underestimate the complexity of the JS to WASM boundary. JS deals in strings and typed arrays. Rust deals in structured types. The WASM interface has to translate between them safely.

Here are the important details that the code handles for you:

- Every public key passed into WASM is expected to be raw bytes, not hex. That is why the JS wrapper often calls `hexToBytes` or uses Uint8Array directly.
- Many helpers decode bytes into Rust types using `Read` implementations. For example `encode_account_key` calls `ed25519::PublicKey::read` to ensure the bytes are the correct length and format. If the bytes are wrong, the function returns a JS error rather than producing a bad key.
- Every function that returns bytes returns a fresh `Vec<u8>`, which JS receives as a `Uint8Array`. That prevents accidental sharing of Rust memory between calls.

This is the main reason the WASM layer exposes so many small helpers. Each helper is a guardrail: it ensures correct byte lengths, correct enum values, and canonical encoding. Without these helpers, JS would need to reimplement encoding and validation logic, which would be error-prone.

Finally, note that WASM functions that accept byte slices (`&[u8]`) are reading from JS-provided memory. If you pass a buffer with extra bytes, the decode may fail or may interpret unexpected data. That is why the JS wrapper constructs exact-length buffers for keys and instructions.

## 17) Event verification and BLS in the UI

The UI does more than display events. It verifies them. This is a major design decision: clients are not blindly trusting the gateway. They check cryptographic proofs.

In `decode_update`, the function reads an `Update` enum. For `Update::Events` and `Update::FilteredEvents`, it calls `events.verify(&identity)`. The `identity` is a BLS public key for the network, and the events include a BLS signature plus proof data. If verification fails, the UI treats the update as invalid.

Why this matters:

- If a gateway is compromised or buggy, it could stream incorrect events. Verification prevents the UI from believing false state transitions.
- The UI can show data that is cryptographically backed by the consensus layer, not just the HTTP server.

The BLS identity is decoded with `decode_bls_public`, which reads a public key from bytes. That means you must supply the correct network identity to the UI. If you use the wrong identity (for example, testnet identity on localnet), verification will fail and the UI will report errors. This is a frequent source of confusion when switching networks.

This is also why the WASM layer exposes `get_identity` and `encode_seed` under the testing feature. It allows the UI to derive a synthetic identity and verify deterministic updates in local test environments.

## 18) Feynman recap: explain it like I am five

- WASM is a way to run Rust code in the browser.
- We use it so the browser builds transactions exactly like the chain expects.
- The Signer is a temporary key holder for development.
- Every helper function exists to avoid mismatched bytes and broken signatures.

---

## 19) Exercises (to build mastery)

1) Use the WASM layer to build a `CasinoRegister` transaction, then compute its digest with `digest_transaction`. Compare the digest to the one computed in Rust.

2) Use `encode_account_key` and `hash_key` to generate a state key, then call the backend state endpoint with that hash. Confirm that the same hash is produced in Rust (`client/src/client.rs`).

3) Use `wrap_transaction_submission` and inspect the output bytes. Verify that the first byte is the `SubmissionTag::Transactions` value defined in the protocol.

4) Run `execute_block` in a local test setup (with testing feature enabled) and compare the summary outputs to the backend execution logs.

---

## Next primer

S05 - Auth flows + threat model: `feynman/lessons/S05-auth-primer.md`
