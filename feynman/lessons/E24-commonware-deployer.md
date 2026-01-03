# E24 - Commonware deployer + host discovery (textbook‑style deep dive)

Focus files: `node/src/main.rs`, `docs/hetzner-deployment-runbook.md`

Goal: understand how host inventories become validator peer lists, why ordering matters for consensus, and how these files drive boot‑time safety.

---

## 0) Big idea (Feynman summary)

A validator can’t join consensus unless it knows *exactly* who the other validators are. Commonware’s deployer + host discovery flow:
- Reads a host inventory or peer list file.
- Extracts validator identities from host names.
- Builds a sorted, unique peer set.
- Refuses to boot if that set is malformed.

This is the “membership contract” of the chain.

---

## 1) Background: membership and determinism

### 1.1 Why deterministic peer lists matter
Threshold signatures and leader election require **stable ordering** of validators. If two nodes have different orderings, they interpret the same certificate differently.

### 1.2 Host inventories vs peer lists
- **Host inventory**: full infrastructure list (validators + non‑validators).
- **Peer list**: only validators, already sorted.

Commonware supports both, but still requires deterministic ordering.

---

## 2) Host → peers flow (`node/src/main.rs`)

### 2.1 Parsing a hosts file

Excerpt:
```rust
let hosts: Hosts = serde_yaml::from_str(&hosts_file_contents)?;
```

Meaning:
- The deployer’s `Hosts` type gives a structured list of machines.

### 2.2 Extracting validator public keys

Excerpt:
```rust
match parse_peer_public_key(&peer.name)
```

What happens:
- Host names encode validator public keys.
- If the name does not parse, the host is ignored.

This is important because:
- Infrastructure files include non‑validator hosts (gateway, simulator, etc).
- Only validator hosts should become peers.

### 2.3 Building the peer map

Excerpt:
```rust
Some((key, SocketAddr::new(peer.ip, port)))
```

This yields a `HashMap<PublicKey, SocketAddr>` used later to create:
- `peers`: ordered list of public keys.
- `bootstrappers`: initial discovery nodes.

### 2.4 Peers file path
If `--hosts` is not used, the node loads `peers.yaml` directly.

Why it exists:
- In production, you may want a minimal file that lists only validators.

---

## 3) Enforcement of ordering

In `main.rs`, the peer set is converted into an ordered set:

Excerpt:
```rust
let peers_set = commonware_utils::ordered::Set::try_from(peers.clone())?;
oracle.update(0, peers_set).await;
```

Meaning:
- If the peers are not sorted and unique, this conversion fails.
- The node refuses to boot.

This is a **safety feature**:
- Different ordering would break threshold verification and leader selection.

---

## 4) Deployment runbook alignment (`docs/hetzner-deployment-runbook.md`)

The runbook documents this requirement explicitly:
- “Ensure peers.yaml entries are sorted and unique; the node will refuse to start otherwise.”

It also defines how peer files are generated:
- `./scripts/bootstrap-testnet.sh` writes `nodeN.yaml` and `peers.yaml`.

This is the operational guarantee that the code relies on.

---

## 5) Bootstrappers vs peers

- **Bootstrappers** help a node discover the network.
- **Peers** define the actual validator set used for consensus.

The node uses both:
- Bootstrappers get you connected.
- Peers determine who counts.

---

## 6) Invariants and failure modes

- **Malformed host names** → validators excluded unexpectedly.
- **Unsorted peers** → node refuses to boot.
- **Missing peers** → consensus cannot form quorum.

These are *deployment* failures, not runtime failures.

---

## 7) Exercises

1) Read `load_peers` and list each error condition.
2) Compare host‑based and peer‑based paths: what data is lost in each?
3) Verify how `peers.yaml` is used in the runbook and in `main.rs`.

---

## Next lesson
E25 - Commonware macros (select + test_traced): `feynman/lessons/E25-commonware-macros.md`
