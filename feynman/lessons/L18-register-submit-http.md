# L18 - Simulator /submit (register + deposit) (from scratch)

Focus file: `simulator/src/api/http.rs`

Goal: explain how register/deposit submissions are received and validated at the simulator’s `/submit` endpoint. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) `/submit` handles all transactions
Register and deposit are not special. They are just `Submission::Transactions` payloads.

### 2) Decode -> apply -> publish
The simulator decodes the submission, applies it to state, then publishes it for downstream consumers.

---

## Limits & management callouts (important)

1) **Decode failure = 400**
- Any malformed bytes are rejected immediately.

2) **Apply failure = 400**
- If the transaction fails validation, the simulator returns a 400.

---

## Walkthrough with code excerpts

### 1) `/submit` handler
```rust
pub(super) async fn submit(
    AxumState(simulator): AxumState<Arc<Simulator>>,
    body: Bytes,
) -> impl IntoResponse {
    let start = Instant::now();
    let status = match Submission::decode(&mut body.as_ref()) {
        Ok(submission) => match apply_submission(Arc::clone(&simulator), submission, true).await {
            Ok(()) => {
                simulator.publish_submission(body.as_ref()).await;
                StatusCode::OK
            }
            Err(_) => StatusCode::BAD_REQUEST,
        },
        Err(_) => StatusCode::BAD_REQUEST,
    };

    simulator.http_metrics().record_submit(start.elapsed());
    status
}
```

Why this matters:
- This is the acceptance gate for every register and deposit transaction.

What this code does:
- Decodes the request body into a `Submission`.
- Applies it to the simulator’s state machine.
- Publishes raw submission bytes for downstream consumers on success.
- Records latency and returns 200 or 400.

---

## Extended deep dive: register/deposit at the HTTP boundary

The `/submit` endpoint is the first server‑side gate that register and deposit transactions pass through. Even though this endpoint is generic, it shapes the onboarding experience. The sections below unpack the details that matter.

### 2) The three phases: decode, apply, publish

The `/submit` handler performs three operations in a fixed order:

1) **Decode** raw bytes into `Submission`.
2) **Apply** the submission to the simulator’s state.
3) **Publish** the raw bytes to downstream consumers.

For register/deposit, this means:

- decoding the transactions envelope,
- passing the transactions into the simulator pipeline,
- broadcasting them to the mempool and update systems.

If any step fails, the request returns 400.

### 3) Why decoding happens before any state change

Decoding is a pure check: “Are these bytes even well‑formed?” The simulator refuses to touch state unless decoding succeeds. This prevents malformed data from leaking into the state machine.

This is especially important for onboarding. A malformed register submission should not partially update player state; it should simply fail fast.

### 4) Apply failure vs decode failure

Decode failure means “the bytes are invalid.” Apply failure means “the bytes are valid, but the action is invalid.”

Examples:

- Decode failure: wrong tag, truncated buffer, invalid length prefix.
- Apply failure: nonce mismatch, account not registered, rate limit violated.

Both result in `400 Bad Request`, but they mean very different things. This is why the backend logs decode errors separately (with a hex preview).

### 5) Why the endpoint returns 400 for invalid transactions

From an HTTP perspective, invalid transactions are a **client error**. The backend is functioning correctly; it is simply rejecting invalid input. That is why the endpoint responds with 400 rather than 500.

This distinction matters for monitoring:

- spikes in 400s usually mean client bugs or invalid submissions,
- spikes in 500s mean backend failures.

### 6) Register/deposit do not get special treatment

At the HTTP layer, register and deposit are just transactions. The endpoint does not inspect the instruction tag; it only cares that the submission decodes and applies.

This is a deliberate layering choice:

- HTTP handles bytes and basic validation.
- Execution handles instruction semantics.

This keeps the endpoint generic and stable as new instructions are added.

### 7) Publishing raw bytes for downstream consumers

After a successful apply, the endpoint calls:

```rust
simulator.publish_submission(body.as_ref()).await;
```

Publishing the raw bytes serves two purposes:

- It allows the update system to re‑decode the submission independently.
- It preserves a canonical byte representation for audit or replay.

This is part of an event‑sourcing style design: the original submission is the source of truth.

### 8) Why the handler logs a hex preview on decode failure

When decoding fails, the code logs:

- the length of the submission,
- the first few bytes in hex.

This is a debugging aid. It avoids logging full payloads (which might be large or sensitive) but still provides enough context to identify mis‑encoded submissions.

For onboarding, this can quickly reveal whether the gateway is sending the wrong tag or wrong length prefix.

### 9) Latency metrics and why they matter for onboarding

The handler records:

```rust
simulator.http_metrics().record_submit(start.elapsed());
```

These metrics capture the end‑to‑end latency of decode + apply + publish.

If register or deposit feels slow to users, the `/submit` latency histogram is the first place to look. It tells you whether the slowness is in the backend or somewhere else in the pipeline.

### 10) A timeline for register at the HTTP layer

1) Gateway sends POST /submit with a transaction.
2) Simulator decodes the submission.
3) Simulator applies it via `apply_submission`.
4) Simulator publishes the raw bytes.
5) Simulator returns HTTP 200.

If any step fails, it returns 400.

This timeline shows why SubmitClient acceptance is only a partial guarantee. The HTTP layer only tells you the submission was accepted for processing; actual confirmation comes from updates.

### 11) Security considerations

The `/submit` endpoint does not authenticate requests. It relies on:

- Origin allowlists (at the gateway and/or proxy),
- network boundaries (private network, firewall),
- upstream rate limits.

If `/submit` is exposed publicly without protection, an attacker could spam it and overwhelm the simulator. That is why operational protections are essential.

### 12) Failure modes to expect

Common register/deposit failures at this layer:

- **Malformed submission**: gateway encoding bug.
- **Oversized body**: gateway exceeded backend size limit.
- **Rate‑limited upstream**: gateway throttled.
- **Unknown tag**: protocol mismatch between gateway and backend.

Because all these result in 400, logs are critical for diagnosis.

### 13) Testing the HTTP boundary

To test `/submit` in isolation:

- Build a valid register transaction.
- Wrap it in a submission envelope.
- POST it to `/submit`.
- Confirm you receive 200.

Then try:

- changing a byte in the tag,
- truncating the submission,
- sending a huge body.

You should receive 400 for each invalid case. These tests validate that the endpoint rejects malformed input correctly.

### 14) Feynman analogy: airport security check

Think of `/submit` as an airport security checkpoint:

- Decode is checking that the boarding pass is correctly formatted.
- Apply is verifying that the traveler is allowed to board.
- Publish is sending the boarding record to the flight system.

If the boarding pass is malformed, the traveler is rejected immediately. If the traveler is not allowed to board, they are also rejected, but for a different reason. The checkpoint does not care about the traveler’s destination — only about the correctness of the credentials.

### 15) Practical troubleshooting checklist

If register/deposit submissions fail:

1) Check the gateway’s SubmitClient logs for HTTP status.
2) Check simulator logs for “Failed to decode submission” warnings.
3) Check simulator metrics for submit latency spikes.
4) Verify that gateway and backend instruction tags match.

This aligns with the responsibilities of the `/submit` endpoint and avoids guesswork.

---

### 16) Relationship to rate limits and body limits

The `/submit` handler itself does not enforce per‑IP rate limits or body size limits. Those controls live in the HTTP layer configuration and in the gateway.

In the simulator, you will see metrics such as:

- `reject_rate_limit_total`
- `reject_body_limit_total`

Those are recorded elsewhere in the HTTP stack, but they directly affect onboarding. If your register requests are being rejected before they reach `/submit`, you will still see 400 or 413‑style failures from the client’s perspective.

So when debugging:

- If decode fails, look at `/submit` logs.
- If the request never reaches `/submit`, look at rate‑limit and body‑limit logs upstream.

### 17) The role of `apply_submission`

`apply_submission` is called inside `/submit`. It performs the internal routing:

- `Submission::Seed`
- `Submission::Transactions`
- `Submission::Summary`

Register and deposit are the Transactions path. The HTTP handler is not responsible for distinguishing them; `apply_submission` is.

This separation makes it easier to reason about the code:

- `/submit` is about HTTP concerns.
- `apply_submission` is about protocol concerns.

### 18) Why `/submit` publishes the raw bytes

The simulator publishes raw submission bytes so that other subsystems can decode them independently. This is important for:

- update streams,
- indexers,
- audits or replay tools.

If the simulator instead published decoded structs, downstream components would be forced to use the same Rust types and might diverge from other clients. Publishing bytes keeps the event stream language‑agnostic.

### 19) Confirmations come from updates, not HTTP

HTTP 200 means “submission accepted,” not “transaction finalized.” The actual confirmation path is:

- updates stream emits `CasinoPlayerRegistered` or `CasinoDeposited`,
- gateway decodes the event and updates the session state,
- UI reflects the change.

So while `/submit` is essential, it is not the end of the story. It is one step in a longer confirmation pipeline.

### 20) Why this endpoint is intentionally minimal

You might expect `/submit` to return detailed error codes or even execution results. It does not. It returns only a status code.

This simplicity is intentional:

- It keeps the HTTP surface stable.
- It avoids coupling the HTTP API to execution internals.
- It forces clients to rely on the updates stream for real‑time information.

This design reduces the risk of accidentally exposing sensitive state via HTTP responses.

### 21) Observability via metrics

The handler records latency in a histogram. That histogram is part of the Prometheus output and can be graphed over time.

If you see a latency spike during onboarding, it could indicate:

- slow decode (oversized submissions),
- slow apply (execution under load),
- slow publish (backpressure).

Those are different causes with different fixes, which is why measuring latency at this layer is valuable.

### 22) Example: interpreting a 400 during registration

Suppose a user clicks “register” and the client sees a 400 response. There are multiple possible reasons:

- The gateway encoded the register instruction incorrectly (decode failure).
- The nonce was invalid (apply failure).
- The submission exceeded size limits (upstream rejection).

The HTTP layer cannot tell you which one it is. You need logs:

- If `log_summary_decode_stages` or decode warnings appear, it was a decode failure.
- If apply submission logs show a nonce mismatch, it was a nonce issue.
- If the request never reaches `/submit`, it was blocked earlier.

This is why correlating client errors with backend logs is essential.

### 23) The shape of a valid register submission (mental model)

A valid register submission looks like:

```
Submission::Transactions [
  Transaction {
    nonce,
    instruction = CasinoRegister { name },
    public key,
    signature
  }
]
```

`/submit` expects exactly that binary layout. If any element is wrong, decode or apply will fail.

This mental model helps you reason about failures without digging into binary bytes.

### 24) Feynman summary

The `/submit` endpoint is like a mail slot:

- It checks the envelope format (decode).
- It passes the letter to the internal office (apply).
- It announces accepted letters to the building (publish).

It does not read the contents or decide what they mean. That job belongs to the execution engine and the updates stream.

---

### 25) Decoding: how the submission is interpreted

The submission is decoded using `Submission::decode`, which comes from `nullspace_types::api`. This decoder reads:

1) a tag byte to determine the submission type,
2) the rest of the payload based on that type.

For `Submission::Transactions`, the decoder expects:

- a varint length for the number of transactions,
- then a sequence of transaction bytes, each parsed using the `Transaction` codec.

This means any error in the instruction encoder or transaction builder can manifest as a decode failure here. That’s why decode failures are logged with a hex preview: the first few bytes often reveal the wrong tag or missing length prefix.

### 26) Why the HTTP handler does not parse instructions

Even though `/submit` could theoretically inspect the instruction tag, it does not. This is deliberate:

- It keeps the HTTP boundary small and stable.
- It avoids duplicating logic that already exists in the execution layer.
- It prevents the HTTP layer from becoming a policy engine.

As a result, register/deposit are indistinguishable from any other transaction at this layer. This is exactly what you want for a clean protocol stack.

### 27) Applying submissions is asynchronous

`apply_submission` is async. That is important because:

- it may perform I/O (state access),
- it may validate cryptographic proofs (for summaries),
- it may broadcast updates.

This means `/submit` is not “just a quick decode.” Under load, apply can dominate latency. That is why the handler times the entire operation.

### 28) Body size and backpressure

The simulator’s HTTP server may enforce a max body size. If the gateway exceeds it, the request is rejected before `/submit` runs.

This is why SubmitClient’s `maxSubmissionBytes` option exists. If you align gateway and backend limits, errors become predictable and easier to diagnose.

### 29) When register fails, where the error originates

Register failures can originate in three places:

1) **Gateway encoding** (invalid bytes) → decode failure in `/submit`.
2) **Execution logic** (already registered) → apply failure in execution.
3) **Nonce mismatch** → apply failure in `prepare`.

All three surface as HTTP 400. That is why logs and updates are essential. The HTTP status alone cannot tell you which layer failed.

### 30) Operational tuning for onboarding bursts

During onboarding waves (e.g., a marketing campaign), `/submit` load will spike. To keep it stable:

- increase backend concurrency or CPU,
- raise body limits if needed,
- monitor submit latency histograms,
- ensure mempool broadcast capacity is sufficient.

The HTTP layer is thin, but it sits at the choke point. Its metrics are the best early warning signals for overload.

### 31) Testing strategy

To test `/submit` with register/deposit:

- Use the gateway to generate a valid register submission.
- POST it directly to `/submit` and expect 200.
- Modify a single byte in the instruction tag and expect 400.
- Modify the length prefix and expect 400.

These tests validate that decode and apply are both enforcing correctness.

### 32) Security posture

The HTTP handler itself does not enforce authentication. In production, you should:

- restrict access via network boundaries,
- use origin allowlists at the gateway,
- enable rate limiting at the edge.

Treat `/submit` like a privileged internal API, not a public endpoint.

### 33) Feynman exercise

Explain to a new engineer why `/submit` returns 400 for both malformed submissions and invalid transactions, and why the system still works. If they can explain the layered responsibilities (decode vs apply vs execute), they understand the endpoint.

---

### 34) The `log_summary_decode_stages` helper (and why you still care)

Even though register/deposit are not summaries, the `/submit` handler calls `log_summary_decode_stages` when decoding fails. This helper attempts to parse a summary and logs the stage where it fails.

Why is this relevant to register?

Because it tells you that a failed decode was likely **not** a summary. If you see “summary decode failed at progress” logs when submitting register, you probably sent a payload with the wrong tag (e.g., `2` instead of `1`). That can happen if the submission wrapper tag is wrong or if bytes are mis‑aligned.

So even summary‑specific logging can help diagnose register issues.

### 35) Prometheus metrics as an onboarding dashboard

The simulator exposes Prometheus metrics for submit latency and rejection counters. In practice, a simple dashboard for onboarding should include:

- submit latency histogram,
- reject rate limit counter,
- reject body limit counter,
- update lag counters (WS send timeouts).

If those metrics look healthy, most onboarding issues are likely at the gateway or client layer rather than the backend.

### 36) Why the endpoint doesn’t echo error details

You might want `/submit` to return structured error details (e.g., “nonce mismatch”). But it doesn’t. This is a conscious tradeoff:

- It keeps the HTTP surface minimal.
- It avoids exposing internal execution details to untrusted clients.
- It encourages the use of the updates stream for confirmations and failures.

For debugging, rely on logs and metrics instead of HTTP bodies.

---

### 37) Hex previews: how to use them

When decode fails, the simulator logs the first few bytes of the submission. You can use this to identify:

- the submission tag (first byte),
- whether the vec length looks sane,
- whether the transaction nonce starts where you expect.

For example, if the first byte is `0x02` you might have sent a summary tag by mistake. If the first byte is `0x01` but the next byte is huge, the vec length might be corrupt.

This is a low‑level but extremely useful debugging technique.

### 38) A short checklist for production readiness

Before shipping:

- Confirm gateway and simulator agree on submission tag values.
- Align size limits (`GATEWAY_SUBMIT_MAX_BYTES` vs backend body limit).
- Monitor submit latency in staging under load.
- Verify updates stream is connected for registration confirmations.

These checks directly cover the most common onboarding failures at the `/submit` boundary.

---

Final note: if the gateway reports “registration failed” but `/submit` shows consistent 200s, the issue is almost always downstream — updates stream connectivity or balance refresh — not the HTTP endpoint itself. Correlate with update logs before you dig into HTTP. That discipline saves hours, especially during incident response, and keeps you focused on the right layer. It is a repeatable habit. Make it part of your runbook. Teach it to every on‑call engineer. It will pay back quickly. Every time.

## Key takeaways
- Register/deposit are not special at the HTTP layer; they are just transactions.
- Decode or apply failures result in a 400 response.

## Next lesson
L19 - Register submission internals: `feynman/lessons/L19-register-submission.md`
