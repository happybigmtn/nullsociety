# L17 - Submit client (register + deposit) (from scratch)

Focus file: `gateway/src/backend/http.ts`

Goal: explain how the gateway submits register/deposit transactions to the backend and handles errors/timeouts. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Register + deposit are just submissions
The gateway always sends binary `Submission` payloads to `/submit`. Whether it’s register or deposit doesn’t matter to HTTP — it’s just bytes.

### 2) Timeouts prevent hanging sessions
If the backend is slow, the gateway aborts so clients don’t wait forever.

---

## Limits & management callouts (important)

1) **Default submit timeout = 10s**
- Long enough for normal processing, short enough to keep UI responsive.

2) **Origin header must match backend allowlist**
- If origin mismatches, even valid submissions will be rejected.

---

## Walkthrough with code excerpts

### 1) Submit a transaction to `/submit`
```ts
async submit(submission: Uint8Array): Promise<SubmitResult> {
  if (this.maxSubmissionBytes !== null && submission.length > this.maxSubmissionBytes) {
    return { accepted: false, error: `Submission too large (${submission.length} > ${this.maxSubmissionBytes} bytes)` };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), this.submitTimeoutMs);

  try {
    const response = await fetch(`${this.baseUrl}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Origin': this.origin,
      },
      body: Buffer.from(submission),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { accepted: true };
    }

    let error = `HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (text) error = text;
    } catch {
      // ignore
    }

    return { accepted: false, error };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === 'AbortError') {
      return { accepted: false, error: 'Request timeout' };
    }

    return {
      accepted: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
```

Why this matters:
- Register and deposit live or die by this one submission call.

What this code does:
- Sends binary submission bytes to the backend.
- Aborts after a timeout to avoid hanging.
- Returns a simple `{accepted, error}` result for the caller to act on.

---

## Extended deep dive: why SubmitClient is the onboarding lifeline

Register and deposit are the first on‑chain actions a user takes. Both flow through the same SubmitClient instance. If SubmitClient is flaky, onboarding becomes flaky. This section explains the deeper logic and operational implications.

### 2) The SubmitClient constructor and its policies

The constructor accepts a configuration object:

- `submitTimeoutMs`: how long to wait for `/submit`.
- `healthTimeoutMs`: how long to wait for `/healthz`.
- `accountTimeoutMs`: how long to wait for `/account/:pubkey`.
- `origin`: the Origin header to send.
- `maxSubmissionBytes`: hard cap for payload size.

These are policy knobs. They are not just technical details; they directly control user experience. For example:

- a too‑short submit timeout creates false failures during registration,
- a too‑long timeout makes the UI feel unresponsive,
- a missing origin causes every submission to be rejected.

### 3) Why register/deposit are “just bytes”

The HTTP layer does not know whether a submission is register or deposit. It only sees a byte array. This is a powerful separation:

- encoding is the responsibility of the gateway codecs,
- HTTP transport is the responsibility of SubmitClient,
- validation is the responsibility of the backend.

Each layer does one job. That keeps the system modular and easier to debug.

### 4) The maxSubmissionBytes guard

The SubmitClient rejects payloads larger than `maxSubmissionBytes` before sending them. This is a local safety valve:

- It prevents oversized submissions from saturating the backend.
- It provides a consistent error string for clients.

This is especially important for onboarding. If a register transaction accidentally includes a huge name payload, it will be rejected locally rather than leaking through to the backend.

### 5) Timeouts and the “unknown outcome” problem

If a request times out, the gateway cannot know whether the backend processed it. That means:

- the transaction might have been accepted,
- or it might have been dropped.

This is why the session manager listens to updates and refreshes balances. Those mechanisms are how the system converges even when SubmitClient returns a timeout.

In other words, timeouts are not necessarily errors — they are “unknown outcomes.” The rest of the system must reconcile that uncertainty.

### 6) Error taxonomy and how it affects retry logic

SubmitClient returns `{ accepted, error }`. The session manager uses the error string to decide whether to retry on nonce mismatch.

This is a loose coupling:

- SubmitClient does not interpret the error.
- SessionManager does.

That means backend error messages become part of the contract. If backend errors change, nonce‑retry behavior might break.

This is a subtle cross‑layer dependency. It is why you should treat error messages as part of the API surface in production.

### 7) The Origin header as an authentication token

Even though Origin headers are usually a browser concept, in this system they act as a lightweight authentication token. The backend can allow or reject requests based on Origin.

That means:

- the gateway must send the correct Origin,
- the backend allowlist must include it,
- both sides must be updated together when you change domains.

If those are misaligned, all submissions will be rejected regardless of correctness.

### 8) Submissions are binary; Content‑Type matters

The SubmitClient sets:

```
Content-Type: application/octet-stream
```

This is not optional. It tells the backend to treat the body as raw bytes, not JSON. If you accidentally change this header, the backend will attempt to parse it incorrectly or reject it.

### 9) Why SubmitClient doesn’t retry automatically

Automatic retries are tempting, but they can be dangerous:

- A timeout does not mean the submission failed.
- Retrying could create duplicate submissions.
- Duplicate submissions waste resources and complicate debugging.

So SubmitClient leaves retry decisions to the caller. The session manager chooses a single retry only when it detects a nonce mismatch.

### 10) End‑to‑end register flow through SubmitClient

The register flow is:

1) Session manager builds register instruction bytes.
2) It builds a signed transaction.
3) It wraps the transaction in a submission envelope.
4) It calls `submitClient.submit(...)`.
5) SubmitClient sends HTTP POST to `/submit`.
6) Backend decodes and applies the transaction.
7) Updates stream broadcasts `CasinoPlayerRegistered`.

This illustrates the SubmitClient’s role: it is the transport bridge, not the validator or executor.

### 11) Observability: what to log and why

SubmitClient logs:

- accepted transactions (debug),
- rejected submissions (warn),
- timeouts (error path).

These logs provide a high‑level health signal:

- spikes in “rejected” often mean encoding or nonce issues,
- spikes in “timeout” often mean backend overload,
- a total absence of logs could indicate a broken gateway path.

### 12) Testing SubmitClient in isolation

You can test SubmitClient without a real backend:

- Use a mock HTTP server that returns 200 for one request and 400 for another.
- Ensure `submit` returns `{ accepted: true }` and `{ accepted: false }` as expected.
- Simulate delayed responses to confirm the timeout behavior.

These tests are fast and catch regressions early.

### 13) Common onboarding bugs and how SubmitClient helps diagnose them

1) **Registration stuck**  
   Check SubmitClient logs for repeated timeouts or 400 errors.

2) **Faucet claims never appear**  
   Check if SubmitClient returns accepted but updates stream is down.

3) **“Origin not allowed” errors**  
   Confirm SubmitClient’s origin matches backend allowlist.

The SubmitClient gives you the first observable signal in each of these cases.

### 14) Feynman analogy: courier service with a delivery window

Imagine SubmitClient as a courier service:

- You hand it a sealed package (binary submission).
- It attempts delivery within a time window (timeout).
- It reports “delivered” or “failed” but cannot tell you whether the recipient actually opened it.

This analogy captures the uncertainty of network delivery and why the rest of the system needs confirmations via updates or balance refresh.

### 15) Minimal mental model

If you remember one thing:

> SubmitClient takes bytes, sends them to `/submit`, and returns a yes/no with a reason. Everything else is someone else’s job.

This makes it easier to reason about where problems belong in the stack.

### 16) Health checks and readiness gates

SubmitClient also exposes `healthCheck()` which hits `/healthz`. The gateway does not currently block registration on this check, but you can use it for readiness probes or to short‑circuit onboarding when the backend is clearly down.

Why it matters:

- If the backend is cold‑starting, registration requests will time out.
- A fast health check can give the UI a friendly “backend offline” message before a user tries to register.

### 17) Account queries and nonce recovery

SubmitClient’s `getAccount` method is used by the nonce manager and session manager. It calls `/account/:pubkey` and returns `nonce` and `balance`.

This is the recovery path for nonce drift:

1) A submission fails with a nonce error.
2) The session manager calls `nonceManager.syncFromBackend`.
3) That calls `SubmitClient.getAccount`.
4) The local nonce cache is updated.

So while `submit` is the core method, `getAccount` is the safety net that keeps onboarding resilient after restarts or partial failures.

### 18) Why submit timeout differs from account timeout

Submitting a transaction can be slow because:

- it must be decoded,
- validated,
- enqueued,
- and possibly propagated.

Account queries are simpler and should be faster. That is why `submitTimeoutMs` is typically larger than `accountTimeoutMs`.

In production, a good rule of thumb:

- submit timeout = 5–10 seconds,
- account timeout = 3–5 seconds,
- health timeout = 1–5 seconds.

But you should tune these based on measured backend latency.

### 19) Response body parsing and error surface

When the backend returns a non‑OK response, SubmitClient tries to read the response body and use it as the error string. This is important because:

- error strings are used to detect nonce mismatches,
- the frontend often displays them directly,
- they become part of your operational diagnostics.

If you ever change backend error messages, update the nonce mismatch heuristics accordingly.

### 20) Aligning maxSubmissionBytes with backend limits

The SubmitClient can enforce a `maxSubmissionBytes` limit, but the backend also has its own HTTP body size limit.

Best practice:

- Set the gateway limit to **equal or lower** than the backend limit.
- Document the limit in one place so it doesn’t drift.

If the gateway allows larger submissions than the backend, users will see confusing rejections. If the gateway is stricter, users will see earlier and clearer errors.

### 21) The subtle importance of `Buffer.from`

`fetch` in Node accepts multiple body types. `Buffer.from(submission)` ensures the data is sent as raw bytes.

If you accidentally passed a `Uint8Array` directly, it would still work in most cases, but `Buffer.from` makes the intent explicit and avoids subtle platform differences.

For a binary protocol, this kind of explicitness matters.

### 22) Expected failure patterns during onboarding

During onboarding, you typically see three categories of failures:

1) **Timeouts** – backend slow or overloaded.
2) **400 errors** – encoding issues, invalid nonce, invalid instruction.
3) **Origin errors** – misconfigured allowlists.

SubmitClient logs and error strings are the fastest way to classify the failure. This is why it is so central to debugging.

### 23) Operational tuning playbook

If onboarding feels slow or flaky:

- Increase `submitTimeoutMs` slightly.
- Check backend `/healthz` latency.
- Lower `BALANCE_REFRESH_MS` so the UI converges faster after registration.
- Ensure origin allowlists are correct.

If submissions are failing:

- Check SubmitClient logs for HTTP status.
- Compare error strings to nonce mismatch heuristics.
- Inspect backend logs for decode errors.

This playbook is often faster than deep debugging.

### 24) Exercises (Feynman style)

1) Explain why SubmitClient should not retry automatically on timeout.
2) Describe how the gateway recovers if SubmitClient returns a nonce mismatch error.
3) Given a submission size error, list two places to check (gateway limit, backend limit).
4) Why does SubmitClient include an Origin header even though it is a server‑to‑server call?

If you can answer these clearly, you understand SubmitClient’s role in onboarding.

### 25) Final takeaway for this lesson

SubmitClient is small, but it is the chokepoint between “I want to register” and “the chain accepted my registration.” Treat it as a critical dependency, instrument it well, and tune its timeouts carefully.

### 26) Accepted vs confirmed: the subtle gap

SubmitClient returns `{ accepted: true }` when the backend accepts the submission. That does **not** necessarily mean the transaction is final or visible in a block yet. It only means the backend accepted it for processing.

This is why the gateway still listens to updates and refreshes balances. Those mechanisms provide confirmation.

In onboarding, this gap looks like:

- User clicks “register.”
- SubmitClient returns accepted.
- UI still shows “registering…”
- A few seconds later, an update event confirms registration.

Understanding this gap avoids confusing assumptions in the UI.

### 27) Idempotency and retries

Registration is mostly idempotent: registering twice yields “already registered.” Deposits are not idempotent (they add balance each time).

Therefore:

- Retrying registration is usually safe (though it may emit an error event).
- Retrying deposits can cause unintended double funding if the first attempt eventually succeeded.

This is another reason SubmitClient avoids automatic retries. The caller must understand the semantic difference between instruction types.

### 28) Security boundary: what SubmitClient assumes

SubmitClient assumes:

- The gateway produced valid bytes.
- The backend is trustworthy.
- The Origin header is a sufficient authentication token.

It does not:

- verify signatures,
- enforce nonce rules,
- interpret instructions.

That means SubmitClient is not a security gate by itself. It is a transport layer. Security enforcement happens in the backend.

### 29) What happens when SubmitClient goes down

If SubmitClient cannot reach the backend:

- Registration fails.
- Faucet claims fail.
- Gameplay cannot start.

This is why the gateway should surface backend health clearly in its logs and possibly in a UI status indicator. It is a single point of failure for onboarding.

In production, you might choose to:

- run multiple backends behind a load balancer,
- add retries at the load‑balancer level,
- or queue submissions for later delivery.

Those are architectural decisions above SubmitClient, but they underscore its importance.

### 30) Quick “what to check first” list

If onboarding breaks, check in this order:

1) Is the backend reachable (`/healthz`)?
2) Are SubmitClient logs showing timeouts or 400s?
3) Does the Origin header match backend allowlists?
4) Are nonce mismatch errors appearing?
5) Are updates coming through (registration confirmations)?

This sequence maps directly to the SubmitClient’s responsibilities and its integration points.

### 31) AbortController and cleanup details

SubmitClient uses an `AbortController` with a timer. This is important because:

- it prevents hung requests from accumulating,
- it ensures the Node event loop is not clogged with dangling Promises,
- it gives the caller a clean error (`AbortError`).

The code also clears the timeout in both the success and error paths. That avoids leaking timers over time. In a long‑running gateway process, small leaks can become big problems.

### 32) Latency vs throughput tradeoffs

SubmitClient is optimized for low latency, not high throughput. It sends one HTTP request per submission. That is fine for onboarding and normal gameplay, but in heavy‑load scenarios you might consider:

- batching transactions at the gateway,
- compressing submissions,
- or using persistent HTTP connections.

Those are larger architectural changes, but it is useful to understand why the current design is simple: it prioritizes correctness and clarity over throughput.

### 33) Example log interpretation

Suppose you see:

```
[SubmitClient] Transaction rejected: HTTP 400
```

That suggests:

- the backend decoded the submission, but rejected it,
- likely due to nonce mismatch or instruction validation.

If instead you see:

```
Request timeout
```

That suggests:

- the backend is slow or unreachable,
- or the submission is large and taking too long to process.

Being able to interpret these logs quickly is one of the most practical skills for operating the gateway.

---

### 34) Network errors vs HTTP errors

SubmitClient distinguishes between:

- **HTTP errors**: the server responded with a non‑OK status. This means the backend received the submission and chose to reject it.
- **Network errors**: no response at all (timeouts, DNS errors, connection resets). This means the submission may never have reached the backend.

This distinction matters for retry logic. HTTP errors are usually definitive; network errors are ambiguous and require confirmation via updates or balance refresh.

### 35) TLS and production endpoints

In production, you should use HTTPS for the backend URL. SubmitClient simply replaces the base URL in the fetch call; it does not enforce HTTPS.

That means the deployment is responsible for:

- choosing https:// URLs,
- providing valid TLS certificates,
- ensuring that the Origin header still matches the backend’s allowlist.

If you mix HTTPS and HTTP incorrectly, browsers will refuse to connect to the gateway, and the backend may reject requests due to mismatched origins.

---

### 36) A note on environment defaults

SubmitClient defaults (timeouts, origin) are designed for local development. In production, you should explicitly configure them via environment variables. Relying on defaults is risky because:

- origin defaults to localhost,
- timeouts may be too short for real workloads,
- and max submission bytes may not match backend limits.

Treat these as deployment parameters, not code constants.

This small discipline — always setting explicit values — prevents a surprising class of onboarding failures.

---

Final reminder: SubmitClient does not know or care whether a submission is “register” or “deposit.” It treats both as opaque bytes. That is a feature. It keeps the transport layer simple and stable even as the protocol evolves, which is exactly what you want in a long‑lived gateway component. Keep it boring, and you keep it reliable. That is the whole point here, and it scales well. End of story.

## Key takeaways
- Register/deposit are just binary submissions sent to `/submit`.
- Timeouts and error handling protect the gateway from backend stalls.

## Next lesson
L18 - Register submit HTTP endpoint: `feynman/lessons/L18-register-submit-http.md`
