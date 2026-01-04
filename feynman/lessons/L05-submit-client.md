# L05 - Submit client and HTTP submission (from scratch)

Focus file: `gateway/src/backend/http.ts`

Goal: explain how the gateway sends binary transactions to the backend and how it handles errors and timeouts. For every excerpt, you’ll see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) HTTP requests in plain terms
- The gateway talks to the backend using HTTP.
- It sends bytes to the `/submit` endpoint and receives a success or error response.

### 2) Status codes
- **200 OK** means the backend accepted the submission.
- **4xx / 5xx** mean the backend rejected or failed to process the request.

### 3) Timeouts
- If a request hangs too long, the gateway should abort it so the client isn’t stuck.
- Timeouts protect the gateway from backend stalls.

### 4) Origin header
- The backend may require an `Origin` header. The gateway supplies it to match allowlists.

---

## Limits & management callouts (important)

1) **Default submit timeout = 10s**
- Too low = false failures on slow backends.
- Too high = client waits too long before seeing errors.

2) **Health check timeout = 5s**
- Good for a fast liveness check. If your backend is under heavy load, you may need to adjust.

3) **Account query timeout = 5s**
- If this is too low, balance refresh may fail; too high increases request pile‑up under failure.

4) **Origin must match backend allowlist**
- If origin is misconfigured, all submissions can be rejected even if the backend is healthy.

---

## Walkthrough with code excerpts

### 1) SubmitClient constructor
```ts
export class SubmitClient {
  private baseUrl: string;
  private submitTimeoutMs: number;
  private healthTimeoutMs: number;
  private accountTimeoutMs: number;
  private origin: string;
  private maxSubmissionBytes: number | null;

  constructor(baseUrl: string, options: SubmitClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.submitTimeoutMs = options.submitTimeoutMs ?? 10_000;
    this.healthTimeoutMs = options.healthTimeoutMs ?? 5_000;
    this.accountTimeoutMs = options.accountTimeoutMs ?? 5_000;
    this.origin = options.origin || 'http://localhost:9010';
    this.maxSubmissionBytes =
      typeof options.maxSubmissionBytes === 'number' && options.maxSubmissionBytes > 0
        ? Math.floor(options.maxSubmissionBytes)
        : null;
  }
}
```

Why this matters:
- Every backend request depends on these values. A wrong base URL or origin breaks all transactions.

What this code does:
- Stores the backend URL and all timeout settings independently.
- Normalizes the base URL by removing a trailing slash so path joins are consistent.
- Applies a default origin if one was not provided (localhost in dev).
- Optionally sets a maximum submission size to prevent oversized requests.

---

### 2) Submit a transaction to `/submit`
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
- This is the **one and only path** for sending transactions to the backend. If it fails, no gameplay can happen.

What this code does:
- Enforces a hard max payload size if configured.
- Builds a POST request with the binary submission body and required headers.
- Uses `AbortController` to enforce a hard timeout on the request.
- On non‑OK responses, attempts to read the response body as a text error message.
- Returns a simple `{ accepted, error }` object for the gateway to act on.

---

### 3) Health check
```ts
async healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${this.baseUrl}/healthz`, {
      method: 'GET',
      headers: {
        'Origin': this.origin,
      },
      signal: AbortSignal.timeout(this.healthTimeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

Why this matters:
- Lets the gateway quickly detect if the backend is reachable.

What this code does:
- Sends a GET request to `/healthz` with an Origin header.
- Uses a short timeout so liveness checks never hang.
- Returns `true` only when the backend responds with a success status.

---

### 4) Account state query
```ts
async getAccount(publicKeyHex: string): Promise<{ nonce: bigint; balance: bigint } | null> {
  try {
    const response = await fetch(`${this.baseUrl}/account/${publicKeyHex}`, {
      headers: {
        'Origin': this.origin,
      },
      signal: AbortSignal.timeout(this.accountTimeoutMs),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return {
      nonce: BigInt(data.nonce || 0),
      balance: BigInt(data.balance || 0),
    };
  } catch {
    return null;
  }
}
```

Why this matters:
- The gateway uses this to refresh balances and resync nonces. Without it, local state drifts.

What this code does:
- Fetches account data from the backend by public key.
- Rejects any non‑OK response by returning `null`.
- Parses JSON and converts `nonce` and `balance` into BigInt for on‑chain math.

---

## Extended deep dive: the HTTP submission boundary

The SubmitClient is deceptively small, but it is one of the most important boundaries in the whole system. It is the gateway's only HTTP bridge to the backend. Everything else in the gateway is about translating user intent into bytes and getting them to this bridge.

Below, we expand on the parts of the file that do not appear directly in the code snippets, as well as the architectural consequences of the choices made here.

---

### 5) SubmitClientOptions and why each field exists

The constructor accepts a `SubmitClientOptions` object. This turns a "simple HTTP wrapper" into a configurable boundary. The fields are:

- `submitTimeoutMs`: How long we wait for `/submit`. This is the "transaction commit" SLA for the gateway.
- `healthTimeoutMs`: How long we wait for `/healthz`. This is about liveness, not correctness.
- `accountTimeoutMs`: How long we wait for `/account/:pubkey`. This drives balance refresh responsiveness.
- `origin`: The Origin header to send. This must match backend allowlists.
- `maxSubmissionBytes`: Optional guardrail to reject oversized payloads before sending.

The key insight: these are separate timeouts because they are different types of operations. A `submit` can take longer under load (consensus or indexing latency), but a `healthz` check should be quick and fail-fast. Grouping them into a single timeout would either make health checks too slow or submissions too brittle.

This is a subtle but important design choice.

---

### 6) The size guard (`maxSubmissionBytes`) as a safety valve

The first line in `submit` is a local size check:

- If `maxSubmissionBytes` is configured and the payload exceeds it, the function immediately returns an error.

Why is this useful?

1) It protects the gateway from sending huge payloads that could spike memory or network usage.
2) It provides a consistent error path for clients, instead of letting the backend reject with a generic 413 or timeout.
3) It allows the gateway to enforce a smaller limit than the backend, which can be useful if the gateway is resource-constrained.

Think of it as a "front door" size check. The backend likely has its own maximum message size (and the validator has a maximum message size as well). This check is about failing earlier and cheaper.

Operational note: this size limit should align with the backend's own limit. If the gateway allows 10 MB but the backend accepts only 2 MB, clients will see confusing rejections. The ideal outcome is for both limits to match, or for the gateway to be a little stricter.

---

### 7) Two kinds of timeouts and why they are different

The code uses two different timeout mechanisms:

1) For `submit`, it creates an `AbortController` and calls `setTimeout` to abort.
2) For `healthCheck` and `getAccount`, it uses `AbortSignal.timeout(...)`.

Why this difference?

- The `submit` path needs more control because it wants to guarantee the timer is always cleared once a response is received (to avoid leaking timers in long-running servers).
- `AbortSignal.timeout` is simpler and works well for short, fast checks.

From a conceptual standpoint, think of `submit` as a long-running, important operation (like making a purchase), while `healthz` is a quick "ping."

That difference justifies a more explicit timeout mechanism for `submit`.

---

### 8) Error taxonomy: what can go wrong, and how it is reported

There are three broad categories of failure in the `submit` path:

1) **Local guard failure** (size too large).  
   - The code returns `{ accepted: false, error: "Submission too large ..." }`.
   - This happens without any network call.

2) **HTTP rejection** (non-2xx response).  
   - The code reads the response body if possible and uses that as the error string.
   - This is where backend validation errors surface (e.g., "invalid nonce", "signature invalid").

3) **Network or timeout failure** (fetch throws or aborts).  
   - The code differentiates timeouts (`AbortError`) from other errors.
   - This is important because a timeout may mean "the backend is overloaded" rather than "the submission is invalid."

These categories matter for client experience:

- A validation error should be shown to the user as a normal rejection.
- A timeout should be shown as "try again" because the backend might recover.
- A local size failure should be shown as "your request is too big."

The SubmitClient chooses to return a simple `{ accepted, error }` object, and the gateway decides what to do. This keeps the HTTP layer simple and puts policy decisions at a higher layer.

---

### 9) Why the Origin header is still important for server-to-server calls

It might feel odd to set an Origin header from one server to another. After all, there is no browser involved. But the backend might enforce origin allowlists as a security boundary. If the gateway does not set the expected Origin, the backend will reject valid submissions.

This is the subtle coordination risk:

- The gateway has a configured `GATEWAY_ORIGIN`.
- The backend has a configured allowlist of accepted origins.
- If these do not match, *every submission fails*.

So the Origin header is not just a browser artifact; in this system, it is an explicit security token used to authenticate the gateway's identity at the HTTP boundary.

---

### 10) Binary transport details: why `application/octet-stream`

The gateway sends raw bytes, not JSON. That is why the Content-Type is `application/octet-stream`.

This matters for two reasons:

1) It avoids JSON encoding overhead (transactions are already bytes).
2) It removes ambiguity about how the backend should parse the body.

In other words, this is the most direct way to deliver a binary transaction payload. You can think of it as a dedicated "wire format" for on-chain transactions.

The code uses `Buffer.from(submission)` because `fetch` expects a `Buffer` or `ArrayBuffer`. This is not just a type conversion; it ensures Node's HTTP layer sends the correct binary data.

---

### 11) The end-to-end submission flow (full pipeline)

To understand why SubmitClient is critical, trace the entire flow:

1) The client sends a JSON message over WebSocket (e.g., "start game" or "place bet").
2) The gateway validates the message schema and finds the correct handler.
3) The handler builds an instruction payload (using `gateway/src/codec/instructions.ts`).
4) The handler builds a transaction (`buildTransaction`) using the session's nonce and key.
5) The handler wraps the transaction into a submission envelope (`wrapSubmission`).
6) The handler calls `submitClient.submit(...)`.
7) The backend processes `/submit`, validates the transaction, and broadcasts results over the updates stream.
8) The gateway's updates client receives events and pushes them to the session.

The SubmitClient is step 6. If it fails, everything after it collapses.

That is why this module is so important, even though it is small.

---

### 12) Interactions with nonce management

Nonce management is handled by the `NonceManager` in the session layer. But it depends on the SubmitClient's error strings to detect when a rejection is due to nonce mismatch.

In other words:

- SubmitClient translates HTTP errors into a string.
- NonceManager uses that string to decide whether to resync from the backend and retry.

This is a fragile but practical coupling. It means the backend error messages must remain stable (or at least recognized by NonceManager).

If backend error formats change, the retry logic in session management could silently stop working. That is a cross-layer contract to keep in mind.

---

### 13) Observability: logs and what they signal

The SubmitClient logs two main events:

- A debug log when a transaction is accepted.
- A warning log when a transaction is rejected.

This gives operators a high-level view of traffic:

- A spike in rejection logs often means nonce drift or invalid payloads.
- A spike in timeouts suggests backend overload.

Because SubmitClient does not log success for every request at an info level, it keeps the logs quieter in normal operation. That is intentional for production.

If you need per-transaction visibility, you should add logging at the handler level (where you have user context) rather than at this low-level HTTP wrapper.

---

### 14) What SubmitClient does not do (and why)

It is just as important to understand what the code *does not* do:

- It does not retry automatically (except when the caller chooses to retry).
- It does not deduplicate submissions.
- It does not batch multiple submissions.

These omissions are intentional. Retrying blindly can create duplicate transactions because a "timeout" does not guarantee failure. With nonce-based systems, duplicates are rejected anyway, but they still add load and confusion.

Therefore, the SubmitClient keeps the contract minimal: "I tried once, here is the result."

---

### 15) Operational tuning guide

Here is a practical, system-level guide to tuning SubmitClient:

1) **Set `submitTimeoutMs` to slightly above expected backend processing time.**  
   If consensus + indexing usually takes 1-2 seconds, a 10 second timeout is safe. If it often takes longer, increase the timeout to avoid false failures.

2) **Keep `healthTimeoutMs` low.**  
   Health checks are about detecting dead backends quickly, not about full processing. 1-5 seconds is reasonable.

3) **Set `accountTimeoutMs` based on UI expectations.**  
   The balance refresh path is a UI feature. If it times out, the UI can still function, but with stale data.

4) **Align `maxSubmissionBytes` with backend configuration.**  
   If backend rejects > 1 MB, set the gateway limit to 1 MB or slightly less.

5) **Keep `origin` stable.**  
   Changing the origin breaks backend allowlists. Treat it as part of the deployment contract.

---

### 16) Feynman explanation: the mail carrier analogy

Think of the SubmitClient as a mail carrier who delivers sealed envelopes:

- The envelope is the transaction bytes.
- The address is the `/submit` URL.
- The delivery deadline is `submitTimeoutMs`.

If the package is too big, the carrier refuses to accept it. If the destination says "no," the carrier returns the refusal message. If the carrier gets stuck in traffic (timeout), you get a "delivery failed" note.

The carrier does not open or interpret the package. It only cares about delivery.

That is exactly what SubmitClient does: it transports bytes and reports delivery success or failure.

---

### 17) Checklist for adding new HTTP calls in the gateway

If you add new HTTP calls to the backend, follow the same patterns:

- Always include an Origin header.
- Always use a timeout.
- Return a simple, typed result instead of throwing.
- Convert JSON numbers to BigInt when they represent on-chain values.

These are the conventions that keep the gateway predictable.

---

### 18) Troubleshooting scenarios and how to reason about them

Here are common failure modes at the SubmitClient boundary and how to diagnose them:

1) **Every submission returns "Origin not allowed" or a similar error.**  
   This is almost always a mismatch between the gateway's configured origin and the backend allowlist. Confirm the gateway's `origin` option and the backend's allowlist match exactly (scheme + host + port).

2) **Submissions time out but eventually appear on-chain.**  
   The backend may be slow, but still processing. Timeouts do not mean failure. The client should treat these as "unknown" and listen for updates on the updates stream. If this happens frequently, increase `submitTimeoutMs` or investigate backend load.

3) **Submissions rejected for "nonce too low" or "nonce too high."**  
   This indicates nonce drift between the gateway's local state and the backend's account state. The session manager handles some retries, but repeated errors usually mean the nonce manager is not syncing or the gateway restarted without restoring its nonce cache.

4) **Submissions rejected with HTTP 413 or "too large."**  
   This means the gateway limit or backend limit is being exceeded. The SubmitClient's `maxSubmissionBytes` gives a clearer, earlier error. Align the limits and consider enforcing payload size earlier (e.g., at the handler).

5) **Health checks fail but submissions succeed.**  
   This is a sign the health endpoint is not reachable or is using a different Origin policy. Health checks should be configured identically to submit in terms of origin.

These cases show why the boundary must be robust: many errors are not "bugs" but mismatches in configuration or expectations.

---

### 19) Exercises: proving you understand the boundary

Use these as self-checks or onboarding exercises:

1) Trace a `CasinoDeposit` from WebSocket input to the backend `/submit`. List every function it passes through and the exact transformation of bytes.
2) Describe what happens if `submitTimeoutMs` is set to 500 ms while backend consensus routinely takes 2 seconds. How would the user experience change?
3) Explain why it is dangerous to implement automatic retries inside SubmitClient.
4) Show how you would add a `maxSubmissionBytes` check at the handler layer as an additional defense.
5) Describe how a balance refresh uses `getAccount` and what happens when it fails.

If you can answer these clearly, you understand the SubmitClient's role in the system.

---

## Key takeaways
- SubmitClient is the gateway’s **HTTP bridge** to the backend.
- Timeouts are essential to keep the gateway responsive.
- Origin headers must match backend policy or all requests will fail.

## Next lesson
L06 - Simulator /submit endpoint (decode + dispatch): `feynman/lessons/L06-simulator-submit-http.md`
