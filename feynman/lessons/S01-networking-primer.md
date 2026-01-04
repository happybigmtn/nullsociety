# S01 - Networking primer (HTTP/WS, CORS, origins) (textbook-style deep dive)

Focus: concepts (applies to gateway, auth, and simulator services)

Goal: provide a university-level networking primer for HTTP, WebSockets, origins, and CORS, with explicit mapping to how our services communicate.

---

## 0) Big idea (Feynman summary)

Networking is the plumbing of distributed systems. If you do not understand how requests move across the network, you cannot reason about latency, security, or correctness. HTTP and WebSockets are just two different ways of moving messages. CORS and origins are the browser's safety rules that decide which websites are allowed to talk to which servers. If you can explain those concepts to a new engineer with simple analogies, you can debug 80 percent of production networking problems.

---

## 1) Mental model: the network stack as a postal system

Think of the network as a postal system with several layers of envelopes.

- The **application** writes a letter (your HTTP or WebSocket data).
- The **transport** layer (TCP or UDP) adds a certified mail envelope so the postal service can track delivery.
- The **network** layer (IP) adds a street address (IP address) and city (network) so it can route across the country.
- The **link** layer (Ethernet or WiFi) adds a local courier label so it can deliver inside the local neighborhood.

Each layer wraps the layer above it. When the message arrives, the receiver unwraps each layer in reverse order.

In practice:

- **IP addresses** are like street addresses.
- **Ports** are like apartment numbers inside a building.
- **DNS** is the phonebook that maps names like `api.example.com` to IP addresses.

Your code never sees Ethernet frames, but it cares about ports, DNS, and TCP. That is the level this primer focuses on.

---

## 2) Names, addresses, and ports

### 2.1 DNS: how names become IPs

When a browser requests `https://gateway.example.com`, it does not know the IP address yet. It first asks DNS, which is a distributed database that maps domain names to IP addresses.

A typical lookup sequence:

1) Browser asks the OS resolver: "What is gateway.example.com?"
2) OS asks a recursive resolver (your ISP or a public DNS).
3) Resolver queries authoritative DNS for `example.com`.
4) Resolver returns an IP, the OS caches it, and the browser connects.

Important properties:

- DNS responses are cached for a TTL (time-to-live). If you change IPs, old clients might keep hitting the old IP until TTL expires.
- DNS is not encrypted by default (though DNS over HTTPS or DNS over TLS exist). This is one reason TLS is mandatory at higher layers.
- DNS is often the first source of "mysterious" outages when a deployment changes IPs.

### 2.2 IP: how packets move across networks

IP is best-effort delivery. It does not guarantee delivery or order. It simply says: take this packet from IP A to IP B. Routers make decisions based on routing tables, often using BGP (Border Gateway Protocol) across the internet.

Because IP is unreliable, a higher layer must provide reliability. That higher layer is TCP.

### 2.3 Ports: multiplexing on a single machine

Ports let multiple services share the same IP. A port is just a 16-bit number. Port 443 is HTTPS by convention, port 80 is HTTP, and custom apps use arbitrary ports.

A tuple `(source IP, source port, destination IP, destination port)` identifies a connection uniquely. That is how one server can handle many clients simultaneously.

In our stack, each service binds to a local port, and load balancers or reverse proxies forward external traffic to the right port based on hostnames and paths.

---

## 3) TCP vs UDP: reliability vs speed

### 3.1 TCP: reliable streams

TCP is a reliable, ordered byte stream. It provides:

- **Connection setup** (3-way handshake).
- **Reliable delivery** (retransmissions).
- **In-order delivery** (packets arrive in the same order sent).
- **Flow control** (receiver can slow the sender).
- **Congestion control** (sender slows down to avoid congesting the network).

In short: TCP is like certified mail with tracking and receipts. It costs overhead but provides correctness.

### 3.2 UDP: fast datagrams

UDP is "send and hope." It is connectionless and unordered. If you need low-latency and can tolerate loss, UDP can be ideal (for example, real-time voice or video). But you must build reliability yourself.

Our system primarily uses TCP, because financial transactions and consensus protocols demand correctness over raw speed. HTTP and WebSockets both run on top of TCP.

### 3.3 Why TCP matters for WebSockets and HTTP

Even though WebSockets feel "real-time," they are still TCP. This means:

- If a packet is lost, everything after it waits (head-of-line blocking).
- Congestion control will slow down if the network is saturated.
- A single slow client can create backpressure.

That is why systems use message batching, compression, and careful fan-out design at the application layer.

---

## 4) TLS: privacy and trust

### 4.1 What TLS does

TLS (Transport Layer Security) encrypts traffic and authenticates the server.

- **Confidentiality:** eavesdroppers cannot read traffic.
- **Integrity:** attackers cannot modify data without detection.
- **Authentication:** clients know they reached the right server.

### 4.2 The handshake in simple words

1) Client connects and says: "I want TLS, here are the ciphers I support." (ClientHello)
2) Server responds with its certificate and chosen cipher. (ServerHello)
3) Client verifies the certificate against trusted CAs.
4) Both sides derive session keys and begin encrypted communication.

If this fails, browsers block the connection.

### 4.3 TLS termination and internal hops

Often a load balancer terminates TLS, decrypts, and forwards traffic to internal services over plain HTTP. This is common in private networks, but you must trust the internal network. For production, a common pattern is:

- TLS from client to edge LB.
- Internal network isolation and firewall rules.
- Optional TLS between internal services if the threat model requires it.

### 4.4 Why this matters for our stack

Our clients include browsers, so TLS is mandatory. It also affects WebSocket connection stability because browsers will block non-TLS WebSocket connections from HTTPS pages.

---

## 5) HTTP: request/response protocol

### 5.1 Core structure

An HTTP request has:

- Method (GET, POST, PUT, DELETE)
- Path (`/api/submit`)
- Headers (metadata)
- Body (optional)

An HTTP response has:

- Status code (200, 401, 404, 500)
- Headers
- Body

### 5.2 Statelessness and scaling

HTTP is stateless: the server is not required to remember previous requests. That makes it easy to load balance and scale. If a request is independent, any server instance can handle it.

However, many apps need state. That state must then be stored outside of the HTTP server (database, cache, or session store). That is why you see services like session managers, nonce stores, or database-backed auth in our stack.

### 5.3 Idempotency and retries

Because HTTP requests can fail or time out, clients retry. A safe retry requires **idempotency**: the same request can be processed multiple times without changing the result.

- GET is idempotent by definition.
- POST is usually not unless you include an idempotency key.

For transaction submission, we often add explicit nonces or ids to prevent double execution. This is a key concept in blockchain and payment systems.

### 5.4 HTTP/1.1 vs HTTP/2 vs HTTP/3

- **HTTP/1.1** uses one request per connection (or a limited pipeline). It suffers from head-of-line blocking.
- **HTTP/2** multiplexes many streams over a single TCP connection, reducing overhead.
- **HTTP/3** runs over QUIC (UDP) and avoids TCP head-of-line blocking.

Browsers and CDNs often negotiate HTTP/2 or HTTP/3 automatically. Your app code usually does not care, but performance can change dramatically.

---

## 6) WebSockets: full-duplex streams

### 6.1 Why WebSockets exist

HTTP is request/response. That is awkward for realtime updates. WebSockets create a persistent, full-duplex connection between client and server, letting either side send messages at any time.

### 6.2 The WebSocket handshake

WebSockets start as HTTP:

1) Client sends `GET /ws` with `Upgrade: websocket` header.
2) Server responds `101 Switching Protocols`.
3) The connection upgrades to WebSocket framing.

After this, messages are sent as frames, not HTTP requests.

### 6.3 Ping/pong and liveness

WebSockets include ping/pong frames. Servers use them to detect dead connections and free resources. If a client stops responding, the server closes the socket.

This matters for capacity planning: stale connections waste memory and file descriptors.

### 6.4 Backpressure

If the server sends data faster than a client can read, buffers fill. Without backpressure, the server can run out of memory.

Typical strategies:

- Drop or coalesce updates (keep only the latest state).
- Apply rate limits per connection.
- Use bounded queues and disconnect clients that cannot keep up.

Our gateway services must handle thousands of concurrent WebSocket connections, so backpressure is a real operational concern.

### 6.5 WebSockets with load balancers

Load balancers must support long-lived connections and the `Upgrade` header. They also need generous idle timeouts. Otherwise, they close active connections.

In practice, you often configure:

- Idle timeout (for example, 60s or higher).
- TCP keep-alives or WebSocket ping intervals.
- Sticky sessions (optional) if the server keeps connection state in memory.

---

## 7) CORS and the browser security model

### 7.1 Same-origin policy

The browser's same-origin policy says: a script from `https://app.example.com` cannot freely read data from `https://api.other.com`.

Origin is defined by **scheme + host + port**. So:

- `https://app.example.com` and `https://app.example.com:443` are the same origin.
- `http://app.example.com` is a different origin (different scheme).
- `https://api.example.com` is a different origin (different host).

### 7.2 What CORS does

CORS (Cross-Origin Resource Sharing) lets servers explicitly allow other origins to access them. It works by adding headers to responses, such as:

- `Access-Control-Allow-Origin: https://app.example.com`
- `Access-Control-Allow-Methods: GET, POST`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

### 7.3 Preflight requests

For non-simple requests, browsers send a preflight `OPTIONS` request first to ask permission. If the server does not respond with the right CORS headers, the browser blocks the real request.

This is a common source of confusion: the server may be functioning, but the browser blocks the response. Always check network logs in the browser devtools.

### 7.4 Credentials and cookies

If you use cookies or other credentials, you must set:

- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Origin` must be a specific origin, not `*`.

This is a security rule that prevents leaking cookies to arbitrary sites.

### 7.5 Mapping to our stack

Our web clients live on one or more origins. The gateway and auth services must explicitly allow those origins. This is why you see CORS configuration in the gateway and auth layers.

---

## 8) Cookies, tokens, and CSRF

### 8.1 Cookies

Cookies are small key/value pairs stored by the browser and sent with each request to a matching domain. They are used for session authentication.

Important flags:

- `HttpOnly`: not accessible to JavaScript, reduces XSS risk.
- `Secure`: only sent over HTTPS.
- `SameSite`: controls cross-site request behavior.

### 8.2 Tokens

Tokens are often stored in localStorage or memory and sent via `Authorization: Bearer` headers. This avoids CSRF but is more vulnerable to XSS.

### 8.3 CSRF

Cross-Site Request Forgery happens when a malicious site causes a browser to send a request with your cookies to a target site. The target thinks the request is legit because it has cookies.

Mitigations:

- Use `SameSite` cookies.
- Require CSRF tokens.
- Prefer token-based auth for APIs that are called from JavaScript.

In our stack, if we rely on session cookies for auth, CSRF protection is mandatory. If we use bearer tokens, CORS and XSS prevention become more important.

---

## 9) Reverse proxies, gateways, and load balancers

### 9.1 Reverse proxies

A reverse proxy sits in front of your services. It accepts connections and forwards them to internal services. It can handle:

- TLS termination
- Routing based on host/path
- Compression
- Rate limiting
- Logging

### 9.2 Load balancers

A load balancer distributes requests across multiple instances of the same service. Strategies include:

- Round-robin
- Least connections
- IP hash (sticky sessions)

WebSockets complicate load balancing because connections are long-lived. Once a client connects, it stays on the same server. That is why horizontal scaling requires enough capacity for concurrent connections.

### 9.3 Gateways in this system

Our gateway acts as a stateless edge that accepts client connections (HTTP and WebSocket), validates input, and forwards commands to the authoritative table engines or simulation services. The gateway is designed to scale horizontally, while the stateful game logic is centralized in the table engine.

---

## 10) Latency, jitter, and tail behavior

### 10.1 Why tail latency matters

Users do not notice the average, they notice the worst. If 1 percent of requests take 2 seconds, players feel the system as slow.

Tail latency often comes from:

- Garbage collection pauses
- Slow database queries
- Network congestion
- Overloaded services

### 10.2 Jitter and gameplay

In realtime games, jitter (variance in latency) matters more than raw latency. A stable 80 ms feels better than 10 ms sometimes and 300 ms other times.

This is why systems often smooth updates, use round-based timing, and broadcast at fixed intervals. That matches what the global table architecture describes: a single authoritative clock that all clients follow.

---

## 11) Observability for networks

You cannot debug what you cannot see. At minimum you want:

- Request logs (method, path, status, latency).
- Connection counts and open sockets.
- Bytes in/out per service.
- Error rates (timeouts, connection resets).
- Correlation ids between services.

Tracing (OpenTelemetry) helps you see end-to-end latency across services. Without tracing, a multi-service request looks like a black box.

---

## 12) Failure modes and resilience

### 12.1 Common failures

- **DNS failures:** wrong records, expired TTLs, propagation delays.
- **TLS issues:** expired certificates, wrong hostnames, unsupported cipher suites.
- **Timeouts:** slow upstreams or misconfigured timeouts.
- **Connection limits:** file descriptor exhaustion.
- **CORS misconfiguration:** browser blocks requests.
- **WebSocket drops:** idle timeouts on LBs or proxies.

### 12.2 How to mitigate

- Monitor DNS and certificate expiration.
- Use conservative timeouts and retry with backoff.
- Implement graceful degradation in the UI.
- Use health checks and remove unhealthy nodes from the LB pool.
- Expose metrics for open connections and buffer usage.

---

## 13) Mapping to our system

Here is a simplified flow for a web client using the gateway:

```
Browser -> DNS -> Load Balancer (TLS) -> Gateway
  - HTTP for login, account actions, and static data
  - WebSocket for realtime table updates
Gateway -> internal services (HTTP or RPC)
Table engine -> broadcasts -> Gateway -> WebSocket clients
```

Key details:

- The gateway is the public face. It must handle CORS, auth headers, and WebSocket upgrades correctly.
- Internal services should be isolated from the public internet; only the gateway (and a bastion for admin) should have public exposure.
- The authoritative game engine should never trust the client directly; it trusts the gateway or the simulator which validates and sequences commands.

---

## 14) Caching, CDNs, and static assets

Large systems often fail because of caching surprises rather than raw network failures. Browsers, CDNs, and proxies all cache content to reduce latency and bandwidth. Caching is a tradeoff between freshness and speed.

Key HTTP headers:

- `Cache-Control: max-age=...` tells the browser how long it can reuse a response without revalidating.
- `ETag` and `If-None-Match` enable conditional requests: the client asks \"has it changed?\" and receives `304 Not Modified` if not.
- `Vary` tells caches which headers affect the response (for example, `Vary: Origin` matters for CORS responses).

Why this matters for us:

- Static assets (web app bundles) should be cached aggressively with content hashes in their filenames. That lets you set long max-age without breaking updates.
- API responses should be cached conservatively unless they are explicitly read-only.
- CORS responses should include `Vary: Origin` if you allow multiple origins, otherwise a cache may serve the wrong headers to the wrong origin.

CDNs (content delivery networks) sit in front of your origin servers and serve cached assets from edge locations. This reduces latency for global users. But CDNs also add failure modes: stale assets, misconfigured cache keys, and \"split brain\" if different POPs have different cached versions. The safest strategy is to treat static assets as immutable by embedding a content hash in the filename. Then you can cache forever and never worry about stale assets.

For WebSocket endpoints, CDNs are usually bypassed. Most CDNs do not proxy WebSockets by default, or they require special configuration. That is why you often separate domains: one for static assets and APIs (CDN-friendly), another for realtime WebSocket connections (direct to gateways).

## 15) Practical debugging checklist

When something breaks, walk the stack:

1) Can the client resolve DNS?
2) Does TLS complete? (Is the certificate valid?)
3) Does the server respond to HTTP? (Check status codes.)
4) If WebSocket, does `101 Switching Protocols` appear?
5) Are CORS headers correct for the origin?
6) Are there timeouts or idle disconnects at the proxy?
7) Are errors visible in logs or metrics?

This checklist solves most "mystery" network bugs.

If you want a simple sanity check, use `curl` for HTTP and `wscat` or browser devtools for WebSockets. These tools remove the browser UI layer and let you see raw status codes, headers, and handshake behavior. When debugging, reduce the system to the smallest reproduction first.

---

## 16) Exercises

1) Explain the difference between CORS and CSRF to a junior engineer.
2) Why do WebSockets need special LB timeouts?
3) When would you choose UDP over TCP?
4) What does `Access-Control-Allow-Origin` do, and why can it not be `*` for credentialed requests?
5) Describe the full path of a request from browser to table engine.

---

## 17) Feynman recap

Networking is layered. TCP gives you reliable streams. HTTP gives you request/response. WebSockets give you full-duplex streams. CORS and origins are the browser's guardrails. Once you understand those pieces, you can predict how every request in our system behaves, and you can debug failures systematically instead of guessing.
