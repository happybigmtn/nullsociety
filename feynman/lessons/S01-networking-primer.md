# S01 - Networking primer (HTTP/WS, CORS, origins) (textbook-style deep dive)

Focus: concepts (applies to gateway, auth, live-table, and simulator services)

Goal: provide a university-level networking primer for HTTP, WebSockets, origins, and CORS, with explicit mapping to how our services communicate.

---

## 0) Big idea (Feynman summary)

Networking is the plumbing of distributed systems. If you do not understand how requests move across the network, you cannot reason about latency, security, or correctness. HTTP and WebSockets are just two different ways of moving messages. CORS and origins are the browser's safety rules that decide which websites are allowed to talk to which servers.

---

## 1) Background: HTTP as a request/response protocol

### 1.1 What HTTP is
HTTP is a stateless protocol:
- The client sends a request.
- The server sends a response.
- The connection can be closed immediately after.

This is perfect for:
- health checks,
- REST APIs,
- login requests,
- small, independent operations.

### 1.2 Statelessness and scale
Because HTTP is stateless:
- servers can be scaled horizontally,
- load balancers can route each request anywhere,
- failures are isolated to individual requests.

### 1.3 HTTP example (health check)
```text
GET /healthz HTTP/1.1
Host: gateway.example.com
```

Interpretation:
- The load balancer uses this to check if a gateway is alive.
- The gateway returns a simple 200 OK.

---

## 2) WebSockets: a long-lived channel

### 2.1 Why WebSockets exist
HTTP alone is not good for real-time systems:
- The server cannot push messages to clients without a request.
- Polling is wasteful and slow.

WebSockets solve this by upgrading an HTTP connection into a persistent, two-way channel.

### 2.2 The upgrade handshake
A WebSocket starts as an HTTP request:
```text
GET /ws HTTP/1.1
Host: gateway.example.com
Upgrade: websocket
Connection: Upgrade
Origin: https://app.example.com
```

If the server accepts, the connection becomes a WebSocket.

### 2.3 Why WebSockets are critical here
Our system relies on real-time updates:
- round countdowns,
- bet confirmations,
- live-table outcomes.

These are best delivered via WebSocket fan-out.

---

## 3) Origins: the browser's identity label

### 3.1 What an origin is
An origin is defined by three parts:
- protocol (http/https),
- host (example.com),
- port (443).

Example:
- `https://app.example.com:443` is a different origin than
- `https://app.example.com:444` or `http://app.example.com:443`.

### 3.2 Why origins matter
Browsers use origins to prevent one website from reading data from another website.

This is the core security model of the web.

---

## 4) CORS: Cross-Origin Resource Sharing

### 4.1 What CORS is
CORS is the set of rules browsers enforce when a page tries to call a server from a different origin.

### 4.2 The CORS response
A server must explicitly allow the origin:
```text
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Credentials: true
```

If the server does not include these headers, the browser will block the response.

### 4.3 CORS is browser-only
CORS does **not** affect:
- mobile apps,
- server-to-server requests,
- command-line tools like curl.

That means CORS is not a substitute for authentication.

---

## 5) Preflight requests

### 5.1 What a preflight is
When a browser wants to send a request with credentials or non-simple headers, it first sends a preflight:

```text
OPTIONS /api/submit HTTP/1.1
Origin: https://app.example.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Content-Type, Authorization
```

The server must answer with `Access-Control-Allow-*` headers.

### 5.2 Why preflight matters
If the server fails preflight, the real request never happens. This is a common source of confusing bugs.

---

## 6) WebSocket origins and security

### 6.1 WebSocket origin checks
Browsers send an `Origin` header during WebSocket upgrades. Servers can reject unknown origins.

This is why the gateway has an allowlist:
- `GATEWAY_ALLOWED_ORIGINS`

### 6.2 Why origin checks are not enough
Origin checks only protect against browser-based attacks. They do not stop:
- malicious scripts on the same origin,
- direct socket connections from non-browser clients.

So you still need:
- authentication,
- rate limiting,
- server-side validation.

---

## 7) Mapping to our system

### 7.1 Gateway
- WebSocket interface for clients.
- Must enforce origin allowlist in production.
- Should rate-limit per IP/session.

### 7.2 Simulator / indexer
- HTTP/WS API for read-only state queries.
- CORS determines which frontends can call it.

### 7.3 Auth service
- HTTP API for login and challenge flows.
- CORS protects browser access, but tokens protect actual auth.

### 7.4 Live-table service
- WebSocket connection used internally by gateways.
- Runs on private network, so CORS is not relevant.

---

## 8) Latency, jitter, and user perception

### 8.1 Latency
Latency is the time between a request and a response. WebSockets do not magically remove latency; they only remove extra handshakes.

### 8.2 Jitter
Jitter is variance in latency. For real-time games, jitter is worse than stable delay because it makes countdowns and animations feel inconsistent.

### 8.3 Mitigations
- Keep services in the same region.
- Use private networks for backend traffic.
- Broadcast countdown ticks frequently and include server timestamps.

---

## 9) Security summary

- CORS protects browser clients, not the backend.
- Always validate inputs server-side.
- Keep P2P and database ports private.
- Use authentication tokens for sensitive endpoints.

---

## 10) Exercises

1) Explain the difference between an origin and a URL.
2) Write the HTTP headers required to allow `https://app.example.com` to call a server with credentials.
3) Describe why WebSockets are required for the gateway but not for the auth service.
4) List three security controls that CORS does not replace.

---

## Next lesson
S02 - Distributed systems primer (mempool, blocks, execution): `feynman/lessons/S02-distributed-systems-primer.md`
