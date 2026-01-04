# L49 - Simulator passkey dev endpoints (from scratch)

Focus files: `simulator/src/passkeys.rs`, `simulator/src/api/mod.rs`

Goal: explain the dev-only passkey flow in the simulator and why it is not production-safe. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Dev-only passkeys
The simulator includes a simplified passkey flow for development. It is feature-gated and stores raw private keys in memory.

### 2) Challenge + session flow
The flow is: get a challenge → register → login → sign messages using a session token.

### 3) Why this is unsafe for production
Real passkey systems never expose private keys. This dev flow generates ed25519 keys on the server and signs on demand.

---

## Limits & management callouts (important)

1) **Feature-gated**
- Passkey endpoints only compile with the `passkeys` feature.
- They are intentionally off by default.

2) **Session TTL = 30 minutes**
- Passkey sessions expire after 30 minutes.
- Shorter TTL reduces risk but increases friction.

3) **Private keys live in memory**
- Credentials store raw ed25519 private keys server-side.
- This is acceptable only in dev environments.

---

## What this passkey system actually is (deep dive)

The simulator passkey flow is not WebAuthn in the production sense. It is a
developer convenience layer that mimics the shape of WebAuthn but uses a
server generated ed25519 key pair. The server then signs on behalf of the
client when given a session token.

That makes it extremely easy to build local dev clients, but it also means the
server is a custodian of private keys. That is the opposite of how real
passkeys work, and it is why the feature is explicitly marked as dev only.

---

## Data structures (deep dive)

### 1) PasskeyChallenge
`PasskeyChallenge` stores:

- `challenge`: a random string (UUID without dashes)
- `issued_at_ms`: a timestamp

Note that the timestamp is not used for expiry; it is stored but never checked.
That is fine for a dev flow, but a production flow would need TTLs and cleanup.

### 2) PasskeyCredential
Each credential stores:

- `credential_id` (client provided)
- `ed25519_public_key` (hex string)
- `ed25519_private_key` (raw key in memory)

The credential id is just a lookup key in a `HashMap`. There is no attestation
validation and no link to a real WebAuthn credential.

### 3) PasskeySession
Each session stores:

- `credential_id`
- `expires_at_ms` (30 minutes)

Session tokens are random UUIDs and are checked on each signing request. They
are removed when expired, but only when a signing request occurs.

---

## Challenge flow (deep dive)

The challenge endpoint:

1) Generates a random challenge string.
2) Stores it in the passkey store.
3) Returns it to the client.

The challenge is a one time token. It is removed when used in register or
login. This is the minimum viable replay protection.

However, challenges are never expired automatically. If a client asks for a
challenge and never uses it, it remains in memory forever. For dev, this is
fine. For prod, you would want TTL, cleanup, and likely a size limit.

---

## Registration flow (deep dive)

Registration takes three inputs:

- `credential_id` (client chosen)
- `webauthn_public_key` (ignored)
- `challenge`

The handler does not validate `webauthn_public_key`. It simply checks the
challenge exists and then generates a new ed25519 key pair server side.

This is the most important difference from real WebAuthn: in production,
the client generates the key and the server receives only the public key.
Here, the server generates the key and stores the private key in memory.

---

## Login flow (deep dive)

Login is essentially a session creation step:

1) The client provides `credential_id` and `challenge`.
2) The challenge is removed (single use).
3) If the credential exists, a session token is created.
4) The token expires in 30 minutes.

The response includes the public key and session token. From this point on,
the client uses the token to request signatures.

Again, no WebAuthn assertion is verified. This is a deliberate simplification
for local development.

---

## Signing flow (deep dive)

Signing is the only endpoint that actually uses the private key:

1) The token is read from `Authorization: Bearer`.
2) The session is loaded and checked for expiry.
3) The credential is loaded.
4) The request message is decoded from hex.
5) The private key signs the message with domain separation:
   `nullspace_types::execution::TRANSACTION_NAMESPACE`.

This domain separation is important. It ensures that the signature is valid
only for transaction signing, not for arbitrary application messages.

If any step fails, the handler returns `401` or `400`. This keeps the flow
simple and easy to debug in dev.

---

## What makes this unsafe for production

There are four major reasons this cannot be used in production:

1) **Server custodianship**: the server stores raw private keys.
2) **No attestation or verification**: there is no cryptographic proof that a
   real authenticator created the credential.
3) **No persistent storage**: keys vanish on restart.
4) **No cleanup**: challenge and session maps can grow without bound.

The system is intentionally weak because it is only meant for development
tools and local testing.

---

## How a production passkey flow would differ

If you wanted a real passkey system, you would need to:

- Store only public keys server side.
- Verify WebAuthn attestation and assertions.
- Use a challenge TTL and cleanup.
- Use a secure, persistent credential store.
- Bind credentials to user accounts and require user verification.

The simulator does none of these. That is fine for dev, but you should never
enable the `passkeys` feature in production.

---

## Example sequence (mental model)

1) Client requests `/webauthn/challenge`.
2) Client sends `/webauthn/register` with a credential id and the challenge.
3) Client sends `/webauthn/challenge` again.
4) Client sends `/webauthn/login` with the new challenge and credential id.
5) Client sends `/webauthn/sign` with the session token and a transaction blob.

This is enough to build a local client that signs transactions without manual
key handling. It is not enough to build a secure authentication system.

---

## In memory storage implications (deep dive)

All passkey state is stored in memory inside `Simulator.state`. There is:

- no database
- no file persistence
- no background garbage collector

That means a simulator restart wipes all passkey credentials and sessions.
From a dev perspective this is fine; from a user perspective it is a total
account loss. This is one of the most important reasons the feature is not
enabled in production.

It also means that running multiple simulator instances is not supported. Each
instance would have its own private keys and sessions. If a client connects to
a different instance, its session token will not be recognized.

---

## Request and response shapes (mental model)

The endpoints are not JSON WebAuthn assertions; they are minimal JSON payloads:

1) `GET /webauthn/challenge` -> `{ challenge }`
2) `POST /webauthn/register` -> `{ credential_id, ed25519_public_key }`
3) `POST /webauthn/login` -> `{ session_token, credential_id, ed25519_public_key }`
4) `POST /webauthn/sign` (with `Authorization: Bearer <token>`)
   -> `{ signature_hex, public_key }`

You can think of this as a tiny "signing service API". The credential id is a
lookup key, the challenge is a CSRF token, and the session token is a short
lived bearer token.

---

## Threat model (dev only)

Even in dev, it helps to understand what could go wrong:

- Anyone with network access can obtain a challenge and register.
- Sessions are bearer tokens; if leaked they allow signing.
- There is no rate limiting or abuse protection specific to these endpoints.
- There is no account binding; a credential id is just a string key.

This is fine when running locally on a trusted network. It is not fine on the
public Internet.

---

## Why the server signs transactions

The simulator is designed to accept signed transactions, not raw private keys.
The passkey endpoints simulate a client side signer by providing a server side
signer. The `sign_with_passkey` handler takes raw bytes and applies the
ed25519 private key with a transaction namespace.

That makes it trivial to write a dev client that only needs to know how to:

1) ask for a challenge
2) log in
3) request signatures

This is faster for development, but it should never be confused with secure
user authentication.

---

## Common debugging tips

If a dev client fails to sign, check these in order:

1) Is the `passkeys` feature enabled at build time?
2) Did you log in after registering?
3) Are you including `Authorization: Bearer` on /sign?
4) Is the session expired (30 minutes)?
5) Did the simulator restart?

Most failures are due to missing authorization or an expired session.

---

## Suggested production replacement (high level)

If you want a production passkey flow, the minimal replacement should:

- store only public keys
- verify WebAuthn assertions
- enforce challenge TTL and session TTL
- store credentials in a durable DB
- bind credentials to a user identity model

In other words, the production version would be a completely different system.

---

## Session lifecycle details

Session tokens expire after 30 minutes, but there is no background sweeper.
Expired sessions are removed only when the token is used. That means the
session map can grow if clients never call `/webauthn/sign` again. In practice
this is not a problem for local dev, but in production it would be a memory
leak.

Similarly, challenges are removed only when used. A client that never registers
or logs in leaves its challenge behind. Again, acceptable for dev, not for prod.

---

## Domain separation and transaction safety

When the server signs, it passes a namespace:
`nullspace_types::execution::TRANSACTION_NAMESPACE`. This is a standard
domain separation trick. It means the signature is bound to "transaction"
messages and cannot be reused for other message types.

If you ever change the transaction namespace in the execution layer, you must
update the passkey signer. Otherwise signatures will look valid but fail to
verify in consensus.

---

## Example dev client flow (conceptual)

Below is a conceptual flow. This is not the exact HTTP payloads, but it shows
the order and the trust boundaries:

1) Fetch challenge
2) Register credential id
3) Fetch challenge again
4) Login to get session token
5) Send sign requests with Authorization header

The important detail is that the session token is a bearer token. Any client
with the token can sign. That is why you must keep it private and never expose
it to untrusted scripts.

---

## When to use this feature

Use the simulator passkey endpoints when you:

- need quick dev signing without managing private keys
- want a web client demo that does not require key management UI
- are running the simulator locally or on a trusted network

Do not use it when you:

- expose the simulator publicly
- need persistent credentials across restarts
- require real WebAuthn security properties

This feature is a sharp tool. It is excellent for prototypes, dangerous for
production.

---

## Comparison with real WebAuthn (quick table)

Real WebAuthn:

- private keys live in secure hardware
- server stores only public keys
- login uses signed assertions tied to a challenge
- credentials survive server restarts

Simulator passkeys:

- private keys live in server memory
- server stores private keys
- login is a simple token issuance
- credentials are wiped on restart

The two systems share only the naming of endpoints. The security properties
are completely different.

---

## Developer pitfalls

1) **Reusing a challenge**
Challenges are single use. If you reuse a challenge for register or login, it
will be rejected. The fix is to fetch a new challenge each time.

2) **Assuming persistence**
If you restart the simulator, all credentials are gone. If your dev client
does not handle this, it will fail silently when trying to sign.

3) **Expecting browser WebAuthn flows**
These endpoints do not speak WebAuthn. A browser WebAuthn API will not talk to
them directly without a custom shim. They are for development tooling, not for
native WebAuthn.

---

## Build and deployment implications

The passkey endpoints are compiled only when the `passkeys` feature is enabled.
This is a compile time switch, not a runtime flag. That means:

- If you want these endpoints in dev, you must enable the feature at build.
- If you do not want them in production, do not enable the feature at build.

This pattern is safer than an environment variable toggle because the endpoints
do not exist in the binary at all. It eliminates an entire class of accidental
exposure.

---

## Token handling details

The signing endpoint expects `Authorization: Bearer <token>`. If the header is
missing or malformed, it returns `401`. This is strict by design: the endpoint
never tries to read tokens from query params or request bodies. That keeps the
parsing surface small and reduces accidental leaks.

The token is looked up in the in memory session map. If it does not exist or
is expired, the request is rejected. Expired tokens are removed immediately.
That means the sign endpoint is also the cleanup path for expired sessions.

This is a reasonable design for dev, but it would not scale as a production
auth system. A production system would want a background sweeper and more
structured token management.

---

## Logging and privacy notes

The passkey code does not log private keys, but it does log warnings for bad
requests. If you build tooling around these endpoints, be careful not to log
raw messages that might contain sensitive transaction data. The safest pattern
is to log request ids and error codes, not payloads.

This matters even in dev, because logs often get uploaded to shared dashboards
or issue trackers. Treat the signing payload as sensitive.

If you need to debug signatures, log hashes of payloads rather than payloads.
That preserves the ability to correlate events without leaking the raw data.

In practice, a single SHA-256 of the message is enough to match client logs
with server logs while keeping the actual transaction body private.

If you are building automated tests, store those hashes alongside expected
signatures. That makes failures reproducible without leaking secrets.
This is a simple habit that keeps dev tooling safe even when logs are shared.
When copying logs into issues or chats, scrub session tokens and credential ids.
Treat them like passwords, because they function like passwords in this system.
Always.

---

## Walkthrough with code excerpts

### 1) Passkey routes are feature-gated
```rust
#[cfg(feature = "passkeys")]
let router = router
    .route(
        "/webauthn/challenge",
        get(crate::passkeys::get_passkey_challenge),
    )
    .route(
        "/webauthn/register",
        post(crate::passkeys::register_passkey),
    )
    .route("/webauthn/login", post(crate::passkeys::login_passkey))
    .route("/webauthn/sign", post(crate::passkeys::sign_with_passkey));
```

Why this matters:
- This ensures the dev-only passkey endpoints are not accidentally enabled in production.

What this code does:
- Registers WebAuthn-like endpoints only when the `passkeys` feature is enabled.

---

### 2) Issuing a challenge
```rust
pub(crate) async fn get_passkey_challenge(
    AxumState(simulator): AxumState<Arc<Simulator>>,
) -> impl IntoResponse {
    let challenge = Uuid::new_v4().to_string().replace('-', "");
    let issued_at_ms = Simulator::now_ms();
    let passkey_challenge = PasskeyChallenge {
        challenge: challenge.clone(),
        issued_at_ms,
    };

    let mut state = simulator.state.write().await;
    state
        .passkeys
        .challenges
        .insert(challenge.clone(), passkey_challenge);

    Json(ChallengeResponse { challenge }).into_response()
}
```

Why this matters:
- Challenges prevent replay: you must prove possession at a specific time.

What this code does:
- Generates a random challenge ID.
- Stores it in memory for later validation.
- Returns the challenge to the client.

---

### 3) Registering a dev passkey
```rust
pub(crate) async fn register_passkey(
    AxumState(simulator): AxumState<Arc<Simulator>>,
    Json(req): Json<RegisterRequest>,
) -> impl IntoResponse {
    let mut state = simulator.state.write().await;

    if state.passkeys.challenges.remove(&challenge).is_none() {
        return StatusCode::BAD_REQUEST.into_response();
    }

    let mut rng = OsRng;
    let private = ed25519::PrivateKey::random(&mut rng);
    let public = private.public_key();

    let cred = PasskeyCredential {
        credential_id: credential_id.clone(),
        ed25519_public_key: hex(public.as_ref()),
        ed25519_private_key: private,
    };

    state
        .passkeys
        .credentials
        .insert(credential_id.clone(), cred);

    Json(RegisterResponse {
        credential_id,
        ed25519_public_key: hex(public.as_ref()),
    })
    .into_response()
}
```

Why this matters:
- Registration generates the keypair that will later sign transactions.

What this code does:
- Validates the challenge is still available.
- Generates a new ed25519 keypair and stores it in memory.
- Returns the public key to the client.

---

### 4) Logging in and creating a session
```rust
pub(crate) async fn login_passkey(
    AxumState(simulator): AxumState<Arc<Simulator>>,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    let mut state = simulator.state.write().await;

    if state.passkeys.challenges.remove(&req.challenge).is_none() {
        return StatusCode::BAD_REQUEST.into_response();
    }

    let credential = match state.passkeys.credentials.get(&req.credential_id) {
        Some(c) => c.clone(),
        None => return StatusCode::NOT_FOUND.into_response(),
    };

    let token = Uuid::new_v4().to_string();
    let now = Simulator::now_ms();
    let session = PasskeySession {
        credential_id: credential.credential_id.clone(),
        expires_at_ms: now + 30 * 60 * 1000,
    };
    state.passkeys.sessions.insert(token.clone(), session);

    Json(LoginResponse {
        session_token: token,
        credential_id: credential.credential_id,
        ed25519_public_key: credential.ed25519_public_key,
    })
    .into_response()
}
```

Why this matters:
- The session token authorizes future signing requests.

What this code does:
- Validates the challenge.
- Creates a short-lived session token (30 minutes).
- Returns the token and public key.

---

### 5) Signing a message with a session token
```rust
pub(crate) async fn sign_with_passkey(
    AxumState(simulator): AxumState<Arc<Simulator>>,
    headers: HeaderMap,
    Json(req): Json<SignRequest>,
) -> impl IntoResponse {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(|s| s.to_string());

    let token = match token {
        Some(t) => t,
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    let credential = {
        let mut state = simulator.state.write().await;
        let session = match state.passkeys.sessions.get(&token) {
            Some(s) => s.clone(),
            None => return StatusCode::UNAUTHORIZED.into_response(),
        };

        if session.expires_at_ms < Simulator::now_ms() {
            state.passkeys.sessions.remove(&token);
            return StatusCode::UNAUTHORIZED.into_response();
        }

        match state.passkeys.credentials.get(&session.credential_id) {
            Some(c) => c.clone(),
            None => return StatusCode::UNAUTHORIZED.into_response(),
        }
    };

    let raw = match from_hex(&req.message_hex) {
        Some(raw) => raw,
        None => return StatusCode::BAD_REQUEST.into_response(),
    };
    let signature = credential.ed25519_private_key.sign(
        Some(nullspace_types::execution::TRANSACTION_NAMESPACE),
        &raw,
    );

    Json(SignResponse {
        signature_hex: hex(signature.as_ref()),
        public_key: credential.ed25519_public_key,
    })
    .into_response()
}
```

Why this matters:
- This endpoint turns a dev-only passkey session into actual signatures.

What this code does:
- Validates the bearer token and session expiry.
- Signs the provided hex message using the stored private key.
- Returns the signature and public key.

---

## Key takeaways
- Simulator passkeys are dev-only and feature-gated.
- Challenges and sessions are in-memory and short-lived.
- Private keys are stored server-side, which is unsafe for production.

## Next lesson
L50 - Web vault (passkey/password) storage: `feynman/lessons/L50-web-vault-passkeys.md`
