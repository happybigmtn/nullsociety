# E21 - Commonware cryptography + certificates (textbook-style deep dive)

Focus files: `types/src/execution.rs`, `node/src/supervisor.rs`, `types/src/api.rs`

Goal: treat this as a cryptography chapter. We explain signatures and threshold schemes conceptually, then walk through the exact code that signs, verifies, and certifies data in our stack. This is a practical cryptography chapter, not a generic summary.

---

## 0) Big idea (Feynman summary)

Cryptography is the trust engine of the chain:

- Users prove ownership with **ed25519** signatures.
- Validators prove quorum with **BLS threshold certificates**.
- Namespaces prevent signatures from being reused in the wrong context.

If you understand how signatures are built and verified, you understand the security boundary of the chain.

---

## 1) Cryptography building blocks

### 1.1 Hashing

A hash function maps any input to a fixed-size output. The critical property is collision resistance: it should be infeasible to find two different inputs that hash to the same output.

In our codebase, SHA-256 is used for:

- key hashing in storage,
- transaction and block digests,
- commitments inside certificates.

Hashes are the backbone of identity for objects: they are the "names" consensus agrees on.

### 1.2 Signatures

A signature scheme has three parts:

- **Key generation**: create a private/public key pair.
- **Signing**: produce a signature over a message using the private key.
- **Verification**: check the signature using the public key.

Ed25519 is used for user transactions because it is fast, deterministic, and widely supported.

### 1.3 Threshold signatures

A threshold signature scheme allows a group of validators to collectively sign a message. Each validator holds a share of a secret key. When a quorum signs, their shares can be combined into one compact signature.

This is powerful because clients only need to verify one signature, not a list of signatures.

In our stack, BLS threshold signatures are used for notarizations and finalizations. They are the cryptographic proof that consensus has reached quorum.

### 1.4 Domain separation (namespaces)

A signature is only meaningful in the context it was created for. Domain separation ensures that a signature on one message cannot be reused for a different message type.

Namespaces in this codebase are byte prefixes appended to messages before signing. This is a simple but effective defense against cross-protocol signature replay.

---

## 2) Transaction signatures in `types/src/execution.rs`

The transaction struct is the core user-facing cryptographic object:

```
pub struct Transaction {
    pub nonce: u64,
    pub instruction: Instruction,
    pub public: ed25519::PublicKey,
    pub signature: ed25519::Signature,
}
```

### 2.1 The payload being signed

`Transaction::write_payload` writes the nonce and instruction into a byte buffer. That buffer is the payload that gets signed. Notice what is *not* included: the signature itself. This avoids self-referential signatures.

### 2.2 Signing

The signing path is:

1) Serialize nonce + instruction.
2) Sign the bytes with the user's private key.
3) Attach the public key and signature to the transaction.

This happens in `Transaction::sign` and `Transaction::sign_with_scratch`. The `scratch` buffer is reused to avoid allocations, which is important for performance when signing many transactions.

### 2.3 Verification

Verification mirrors signing:

1) Serialize nonce + instruction.
2) Verify signature using the public key and a namespace.

The verify functions include `verify`, `verify_with_scratch`, `verify_batch`, and `verify_batch_with_scratch`. Batch verification is critical for throughput: it allows the validator to verify many signatures efficiently.

### 2.4 Namespaces for transactions

Signing uses a constant namespace (`TRANSACTION_NAMESPACE`). The public key verifies the signature with that same namespace. This ensures the signature is bound to the transaction domain and cannot be reused for another message type.

This is a subtle but vital safety property: a signature on a transaction cannot be replayed as a signature on a block or a certificate.

### 2.5 Why the signature does not include itself

Notice that the signature is not part of the payload being signed. If it were, you would have a circular dependency: the signature would depend on itself. By signing only the nonce and instruction, the payload is stable and deterministic. The signature is then appended as a separate field.

This is not just theory. A signature must be computed over deterministic bytes that every validator can reproduce. If you include extra data (like signatures or timestamps) inconsistently, nodes will disagree about validity. The `write_payload` helper is therefore a correctness boundary.

### 2.6 Batch verification and DoS resistance

`verify_batch` allows validators to verify many signatures at once. This is not merely faster; it changes the cost structure for attackers. If you had to verify each signature individually, an attacker could flood the node with many small transactions and consume CPU. Batch verification amortizes that cost.

In practice, validators will build a batch of transactions, call `verify_batch_with_scratch`, and then execute the batch verification step. This is a performance lever that directly impacts throughput.

### 2.7 Deterministic serialization is part of cryptography

Cryptography assumes that everyone signs the exact same bytes. If two nodes serialize a transaction differently, they will compute different hashes and signatures. That is why the transaction payload is built with explicit `write` and `encode_size` implementations.

This is also why the instruction type has a fixed binary format and why decoding errors are handled explicitly. Determinism in serialization is the prerequisite for deterministic signatures. Without it, no amount of cryptographic strength can guarantee agreement.

---

## 3) Consensus certificates in `types/src/execution.rs`

The file also defines types like `Notarized` and `Finalized`:

```
pub struct Notarized {
    pub proof: Notarization,
    pub block: Block,
}

pub struct Finalized {
    pub proof: Finalization,
    pub block: Block,
}
```

### 3.1 Verification of notarizations

`Notarized::verify` uses a threshold scheme to verify that the notarization proof is valid. It constructs a certificate verifier from the shared identity and checks the signature with the namespace.

This is a critical boundary: only a quorum of validators can produce a valid proof. If the verification fails, the notarization is rejected.

### 3.2 Verification of finalizations

`Finalized::verify` is similar. It ensures that the finalization proof is a valid threshold signature. This is what gives deterministic finality its cryptographic strength: finalization is a signature, not just a local opinion.

### 3.3 Digest binding

The `Read` implementation for `Notarized` includes an important check:

- It verifies that the proof payload matches the block digest.

This prevents a malicious proof from being attached to a different block. It is a simple check, but it enforces the binding between signature and content.

### 3.4 Notarized vs finalized: why two certificates

The code distinguishes between notarization and finalization. In many BFT protocols, notarization is an intermediate certificate (for example, a proof that a block was proposed and voted on), while finalization is the certificate that locks the block permanently.

Separating the two allows the protocol to pipeline work: a notarized block can be gossiped early, while finalization provides the hard safety guarantee. The cryptography reflects that: both are threshold certificates, but they have different roles in the protocol.

### 3.5 Threshold verification and randomness

Threshold signature verification in this codebase uses a `scheme` and a random number generator (`rand::thread_rng`). The randomness here is not about secrecy; it is about the verification algorithm's internal optimizations. Some BLS verification routines use randomness to speed up pairing checks or to randomize verification of multiple signatures.

The important point is that verification is deterministic in outcome. The randomness does not change whether a certificate is valid; it only affects how the algorithm reaches the result. This is safe because verification does not mutate consensus state, it only gates whether a certificate is accepted.

---

## 4) Supervisor and threshold scheme setup (`node/src/supervisor.rs`)

The supervisor is where validator cryptography is configured. This file constructs threshold signing schemes and provides them to consensus and aggregation engines.

### 4.1 Participants and sorting

The supervisor receives a list of participants (validator public keys). It sorts them and stores them in an ordered set. This is not cosmetic. Threshold schemes depend on consistent ordering of participants. If two validators use different ordering, their signature shares will not combine correctly.

### 4.2 Sharing and shares

The supervisor is constructed with:

- a `Sharing<MinSig>` object, which represents the public parameters for the threshold scheme,
- a `Share`, which is the validator's own secret share.

The code uses `bls12381_threshold::Scheme::signer` to create a signer with that share. It also creates a `certificate_verifier` using the shared public identity.

The line:

```
.expect("share index must match participant indices")
```

is the cryptographic equivalent of a sanity check. If the share does not match the participant list, the node would sign incorrectly and cause consensus failure. That is why the code crashes early if the indices do not match.

### 4.3 Aggregation scheme

The supervisor also constructs a separate aggregation scheme for certificates used in aggregation. This is a distinct scheme because aggregation has its own certificate types. The pattern is the same: signer for producing shares, certificate verifier for verification.

### 4.4 Identity and epoch management

The supervisor holds an `identity` which is the public threshold key. This identity is what clients use to verify certificates. It also manages epoch updates and peer set notifications. When the epoch changes, subscribers are notified with the updated peer set.

In short: the supervisor is the crypto root of trust for the validator set.

### 4.5 Epoch changes and key rotation

Although the current configuration uses a fixed epoch, the supervisor is built to handle changes. The `EpochManager` tracks the current epoch and notifies subscribers. If the validator set changes, a new sharing and identity can be distributed and the scheme will be updated.

This is how key rotation would work in practice: a new epoch implies a new validator set and therefore a new threshold identity. Clients must then verify certificates against the new identity. The supervisor is the mechanism that makes this transition orderly instead of chaotic.

This is also why participant ordering is strict. When the epoch changes, every node must agree on the exact participant list and ordering, or signature shares will not combine correctly.

### 4.6 Supervisor as Manager and Blocker

The supervisor implements the `Manager` and `Blocker` traits from the P2P layer. This is how cryptography intersects with networking: the same component that knows the validator set also controls which peers are authorized.

From a security perspective, this is ideal. You do not want peer admission logic to drift away from the cryptographic validator set. By centralizing it in the supervisor, the system ensures that the peer set and the signing set are always aligned.

It is also operationally convenient. When the epoch changes, the supervisor can notify peer subscribers and update the network membership without touching consensus logic.

---

## 5) Namespaces as cryptographic domains

### 5.1 Transaction namespace

The transaction namespace is built from a chain namespace plus a suffix. It is used in `Transaction::sign` and `Transaction::verify`. This ensures that even if the same payload appears elsewhere, the signature is not valid outside the transaction domain.

### 5.2 Consensus namespaces

Consensus signatures (notarizations and finalizations) also use namespaces. This prevents a signature meant for consensus from being reused as a transaction signature or vice versa.

### 5.3 Why domain separation matters

Without namespaces, a signature could be reused across different message types if the payload accidentally matched. Domain separation makes such cross-protocol attacks infeasible. It is a small detail with huge security implications.

### 5.4 How namespaces are constructed

The transaction namespace is formed by combining the chain namespace with a suffix. This is a simple and effective design. The chain namespace ensures signatures are bound to this particular chain, while the suffix ensures signatures are bound to the transaction domain.

If you ever change the chain namespace (for example, during a fork or testnet reset), all signatures from the old namespace become invalid. That is intentional. It ensures cryptographic separation between networks.

---

## 6) API-level verification (`types/src/api.rs`)

The API module defines verification logic for summaries, proofs, and certificates. It imports the same aggregation certificate type used by the validator.

This means clients and simulators use the same cryptographic rules as validators. That is critical: if clients verify with a different scheme, they might accept invalid data or reject valid data.

### 6.1 Proof verification and cryptography

The verification functions in `types/src/api.rs` combine:

- signature verification (for certificates),
- proof verification (for state and event proofs),
- digest checks (for progress linkage).

The crypto system is therefore end-to-end: signatures protect consensus, and proofs protect data availability and correctness.

### 6.2 Client verification flow

From a client's perspective, verification is a pipeline:

1) Verify the aggregation certificate signature against the known identity.
2) Verify that the certificate payload matches the expected digest.
3) Verify state or event proofs against the committed root.
4) Reject the response if any step fails.

The important idea is that clients do not trust the node by default. They trust the cryptographic proofs. This is the promise of a blockchain: you can verify the result without trusting the server that delivered it.

### 6.3 Certificates and proofs together

A certificate alone proves that validators agreed on a digest. It does not prove what that digest contains. Proofs provide that content binding. This is why summaries carry both certificates and proof bundles. The certificate says "the validators agreed," while the proof says "and here is the exact data that agreement refers to."

This pairing is what makes light clients viable. A client can verify the certificate against the identity, then verify the proof against the root in the summary. If both checks pass, the client has strong assurance without downloading full block history. This is the cryptographic contract between validators and clients.

---

## 7) How a transaction becomes trusted state

Putting the pieces together:

1) A user signs a transaction with ed25519.
2) Validators verify the signature with the transaction namespace.
3) Consensus orders the transaction into a block.
4) Validators sign a threshold certificate over the block digest.
5) The block is finalized and persisted.
6) The aggregator produces proofs that clients can verify.

At each step, cryptography provides a guarantee:

- user signature proves authorization,
- threshold certificate proves quorum agreement,
- proofs prove state correctness.

### 7.1 Why threshold signatures help clients

Without threshold signatures, a client would need to verify many individual validator signatures to confirm finality. That is expensive and complex. With threshold signatures, the client verifies a single compact signature. The complexity of quorum agreement is hidden inside the certificate.

This is a practical advantage for mobile and web clients. It reduces bandwidth and CPU usage while preserving security. It also simplifies API design because the summary only needs one certificate field instead of a list of signatures.

---

## 8) Security and operational considerations

### 8.1 Key management

User private keys must be protected; validator shares must be protected even more. A leaked validator share reduces the fault tolerance of the network. In production, shares should be stored in secure enclaves or HSMs.

### 8.2 Replay and nonce discipline

Even with valid signatures, replayed transactions are prevented by nonce checks. The cryptography provides authentication, but the nonce provides ordering. Both are required for safety.

### 8.3 Batch verification

Batch signature verification is a performance optimization, not just a speed hack. Without batching, validators might spend too much CPU on signature checks and fall behind. The `Batch` APIs in `types/src/execution.rs` allow validators to verify many signatures efficiently.

### 8.4 Common cryptographic pitfalls

Even with strong primitives, operational mistakes can break security:

- **Key reuse across environments**: using the same validator keys in testnet and mainnet defeats isolation.
- **Missing namespaces**: if a signature is verified without a namespace, it might be replayed in a different context.
- **Incorrect participant ordering**: threshold shares will not combine correctly if ordering differs.
- **Weak randomness**: while ed25519 signatures are deterministic, BLS threshold signing still relies on secure randomness for some operations. Weak randomness can leak information about shares.

The code is designed to avoid these pitfalls, but operators must still treat key management as a first-class responsibility.

### 8.5 Operational checklist for cryptography

Before any production launch, teams should verify:

- validator keys are generated securely and stored in hardened environments,
- shares correspond to the correct participant list and ordering,
- namespaces are correct for the target network,
- certificate verification passes on multiple independent clients,
- batch verification is enabled and tested under load.

This checklist is boring by design. Cryptographic failures are catastrophic and hard to debug, so you want to prevent them with disciplined operational practices.

### 8.6 Incident response and key rotation

If a validator key is suspected to be compromised, you must rotate it. In a threshold scheme, that often means updating the entire sharing and distributing new shares to the validator set. This is not a trivial operation; it is a consensus event. The supervisor's epoch logic is the place where such changes can be coordinated.

Practically, this means you need a runbook for key rotation and a testnet rehearsal. Cryptographic systems fail rarely, but when they do, the blast radius is huge. Treat rotation procedures as part of the production readiness checklist, not as an afterthought.

---

## 9) Feynman recap

Ed25519 signatures authenticate users. BLS threshold signatures authenticate validator quorums. Namespaces prevent cross-domain signature reuse. The supervisor constructs the signing and verification schemes and enforces correct participant ordering. The transaction code signs and verifies payloads deterministically. The consensus code verifies notarizations and finalizations against the shared identity.

If you can explain why `Transaction::sign` uses a namespace and why `Finalized::verify` checks a threshold certificate, you understand the cryptographic security boundary of this chain.

When reviewers ask "why should we trust this state," the answer is these cryptographic checks. They are the explicit, auditable proofs that link a user action to a finalized block and a client-visible result. That is the practical meaning of cryptographic security in this system.

In short, cryptography is not decoration; it is the system's contract with every participant.

It is the guarantee that consensus, execution, and clients all share the same truth.

Nothing in this stack works without it.
