# E24 - Commonware deployer + host discovery (textbook-style deep dive)

Focus files: `node/src/main.rs`, `docs/hetzner-deployment-runbook.md`

Goal: understand how host inventories become validator peer lists, why ordering matters for consensus, and how these files drive boot-time safety. This chapter treats host discovery as part of the protocol, not just deployment plumbing.

---

## 0) Big idea (Feynman summary)

A validator cannot join consensus unless it knows exactly who the other validators are. Commonware's deployer + host discovery flow:

- Reads a host inventory or peer list file.
- Extracts validator identities from host names.
- Builds a sorted, unique peer set.
- Refuses to boot if that set is malformed.

This is the membership contract of the chain.

---

## 1) Why membership is a consensus boundary

### 1.1 Deterministic ordering is required

Threshold signatures and leader election depend on a shared, ordered list of validators. If two nodes have the same members but in a different order, their threshold schemes produce different results. That leads to invalid signatures and consensus failure.

Therefore, membership is not "configuration" in the casual sense. It is a protocol parameter.

### 1.2 Membership is a security boundary

If a malicious peer can insert itself into the validator list, it can participate in consensus, vote, and possibly block progress. That is why peer lists are explicit and validated.

---

## 2) Host inventories vs peer lists

The node supports two input formats:

- **Hosts inventory**: a full infrastructure list including non-validators.
- **Peers list**: a list of validator public keys and socket addresses.

Both are supported because deployer tools manage infrastructure in different ways. But in both cases, the node must extract only the validator identities and sort them deterministically.

### 2.1 What a hosts inventory looks like

The hosts inventory type in `commonware_deployer::ec2::Hosts` is effectively a list of entries with at least:

- `name` (host identifier),
- `ip` (address).

The deployer treats this as infrastructure metadata, not a consensus configuration. The node repurposes it by parsing public keys from the host names. That is why host naming conventions are so strict: the inventory format is flexible, but the identity extraction is not.

---

## 3) Host discovery in `node/src/main.rs`

### 3.1 The `load_peers` function

`load_peers` is the heart of host discovery. It accepts:

- `hosts_file` (optional)
- `peers_file` (optional)
- a list of bootstrapper IDs
- a port
- the node's public key

It returns:

- the node's IP address,
- a list of peer public keys,
- a list of bootstrappers with socket addresses.

This is the full membership envelope used by the node.

### 3.2 Hosts file path

If a hosts file is provided, the node:

1) Reads the YAML file into `commonware_deployer::ec2::Hosts`.
2) Iterates over all hosts.
3) Uses `parse_peer_public_key` to extract a public key from the host name.
4) Skips any hosts that are not validators.

This design is important. A hosts inventory often includes load balancers, gateways, or monitoring nodes. The validator must ignore those. The parsing function is the filter that enforces that boundary.

### 3.3 Peers file path

If a peers file is provided, the node:

1) Reads the YAML file into a `Peers` struct.
2) Parses each peer's public key and socket address.
3) Skips any entries that do not decode into a valid public key.

This path assumes the file already contains only validators. It is the "explicit" mode.

### 3.4 Error handling as a security feature

Notice how host discovery treats parsing failures as hard errors. For example, if a peer public key cannot be decoded, the node logs a warning and skips it. If bootstrappers cannot be resolved, the node aborts. These choices are deliberate:

- Skipping non-validator hosts is fine because they are not part of consensus.
- Failing on unknown bootstrappers is required because it would otherwise allow arbitrary peers into the network.
- Failing on missing self in the peer list prevents accidental misconfiguration.

This pattern is a security principle: fail fast on anything that could lead to inconsistent membership.

### 3.5 `parse_bootstrappers` as a sanity check

The `parse_bootstrappers` helper in `main.rs` takes the bootstrapper public keys from config, decodes them, and looks them up in the peer map. This enforces two invariants:

1) Bootstrappers must be valid public keys.
2) Bootstrappers must be present in the peer list.

This is not just a convenience. It prevents a configuration where a node tries to bootstrap from a non-validator address or a typoed key. In distributed systems, you always want to detect those errors before starting the process.

### 3.6 Host name parsing and public key hygiene

The host inventory path depends on `parse_peer_public_key`, which extracts a public key from a host name. The exact parsing rules are defined in the node crate, but the intent is clear: host names must embed the validator public key in a predictable format.

This has operational implications:

- Host names become part of the identity system.
- Renaming a host effectively changes its identity.
- Typos in host names will silently exclude a validator.

Because of this, inventory updates should be reviewed like key material changes. If a host name is wrong, the validator set will be wrong.

---

## 4) Bootstrappers and the trust anchor

Bootstrappers are the initial peers a node contacts to join the network. They are specified by public key in the config. The `parse_bootstrappers` function maps those keys to socket addresses using the loaded peer list.

If a bootstrapper key is not found, the node fails fast. This is correct behavior: a node that cannot find its bootstrappers cannot safely join the network.

Bootstrappers are therefore part of the trust anchor. You do not want a node to silently fall back to random peers.

### 4.1 Bootstrapper selection strategy

In practice, bootstrappers should be stable validators with reliable uptime. They are not special in consensus terms, but they are special in network terms because they are the entry point for new nodes. If bootstrappers are flaky, new nodes will struggle to join even if the rest of the network is healthy.

A common strategy is to designate a few validators in different regions as bootstrappers. This provides geographic and network diversity, improving resilience against localized outages.

---

## 5) Deriving the node's IP

The node finds its own IP by looking up its public key in the peer list. This may seem strange, but it is the safest approach. It ensures that every node agrees on each other's advertised address.

If the node cannot find itself in the peer list, it fails. This prevents accidental misconfiguration where a node tries to join with a key that is not in the validator set.

### 5.1 Advertised addresses and NAT

The IP derived from the peer list is the advertised address. This is the address other validators will dial. If a node is behind NAT or has multiple interfaces, the advertised address must be the one reachable by other validators.

This is why inventories often use private IPs within a dedicated network. The inventory becomes the source of truth for reachability, and the node uses it to ensure consistency.

### 5.2 Ports and socket address consistency

The peer list encodes socket addresses, not just IPs. That means the port in the inventory is part of the protocol. If one node advertises port 9000 and another expects port 9010, they will not connect. The `load_peers` function always combines the IP with the configured port for hosts inventories to avoid drift.

This is a subtle but important design decision: use a single source of truth for ports rather than trusting host files to specify them consistently.

---

## 6) Sorting and uniqueness

After the peers are loaded, the node enforces sorting and uniqueness with:

```
Set::try_from(peers.clone())
```

If the list is not sorted or contains duplicates, the conversion fails and the node aborts.

This is one of the most important safeguards in the entire system. It ensures that every node uses the exact same ordering, which is necessary for threshold signature correctness.

### 6.2 Deterministic ordering as a cryptographic prerequisite

Threshold schemes require a consistent mapping from participant index to public key. That mapping is derived from the sorted peer list. If two nodes use different ordering, their shares will correspond to different indices, and certificates will fail to verify.

This is why the peer list is treated as a protocol input rather than a configuration convenience. It defines the cryptographic identity of the validator set.

### 6.1 Why sorting by public key is the safest rule

Public keys are stable identifiers. Sorting by public key ensures that the ordering does not depend on deployment details such as IP address ordering or file order. IP addresses can change; public keys should not. This is why the system insists on sorted public keys as the canonical order.

---

## 7) Dry-run mode as a safety gate

The node supports `--dry-run`, which:

- parses the config,
- loads peers,
- validates the signer and indexer client,
- prints a report.

This allows operators to validate membership and configuration before starting the node. In production, this is the first line of defense against misconfigured inventories.

### 7.1 Dry-run report as a capacity checklist

The dry-run report prints storage sizing, consensus timeouts, and mempool limits. This is not just informational. It lets operators verify that the node's configuration matches expected capacity. For example, if the buffer pool size is unexpectedly small, it will show up here before the node starts.

The report also prints the number of peers and the derived IP. This is a quick sanity check that the host inventory is correct. If the peer count is wrong, the node should not be started.

### 7.2 Indexer connectivity as part of preflight

During dry-run, the node also instantiates the indexer client. This is a subtle but important check: it verifies that the node can reach the indexer endpoint using the provided identity. If this fails in dry-run, it will fail at runtime anyway. Catching it early saves time and avoids partial deployments.

---

## 8) How the Hetzner runbook fits

The `docs/hetzner-deployment-runbook.md` describes how to create and manage host inventories. Key points:

- Only load balancers and bastions have public IPs.
- Validators live on private IPs and are listed in the inventory.
- The inventory must include correct host names that encode validator public keys.

The runbook is not just an operations guide; it is part of the consensus correctness story. If the inventory is wrong, the node will not start or will start with a broken validator set.

### 8.1 Runbook artifacts that affect consensus

The runbook calls out several files that directly affect membership:

- `peers.yaml`: the explicit peer list used by nodes when not using hosts inventory.
- `hosts.yaml` (or equivalent): the deployer inventory used to derive peers.
- `peers.yaml` sorting requirement: nodes enforce sorted order for determinism.

The runbook also emphasizes that validator hosts should use names that embed public keys. This is not cosmetic. It is how the deployer bridges infrastructure and cryptographic identity.

If you change host names without updating keys, you can silently break membership. That is why the runbook treats naming conventions as mandatory.

### 8.2 Inventory layout and example

A typical Hetzner inventory file includes entries like:

- `name`: host identifier that includes the validator public key
- `ip`: private network IP

The deployer uses these fields to build the peer map. The node then extracts public keys from the names and assigns the IP + configured port. This is the full pipeline from infrastructure inventory to consensus membership.

Even small mistakes in this file (typos, missing hosts, wrong IPs) can prevent consensus from forming. That is why inventories are reviewed like code changes.

### 8.3 Non-validator hosts are intentionally ignored

The runbook includes load balancers, bastion hosts, gateways, and other services. These are necessary for operations but must never appear in the validator set. The `parse_peer_public_key` filter enforces this. If a host name does not match the validator pattern, it is skipped.

This keeps the validator set clean even when the inventory includes many other machines. It also means that changing naming conventions can accidentally include or exclude hosts, so naming discipline is crucial.

---

## 9) Host name parsing as protocol glue

The `parse_peer_public_key` helper extracts a public key from a host name. This is how the deployer ties infrastructure to consensus identities.

This design choice has two benefits:

1) It prevents identity drift. The host name itself encodes the identity, so you cannot accidentally reuse a host for a different validator without changing its name.
2) It allows the deployer to manage hosts without a separate identity database.

The downside is that naming conventions become part of the protocol. That is why the runbook is strict about host naming.

### 9.1 Example naming convention

A typical convention is to name validator hosts with a prefix plus the public key, such as:

- `validator-<pubkey>`

The parser extracts the public key from the host name. If the prefix or format changes, parsing will fail. This is intentional: it forces the operator to keep naming consistent with the validator identity.

---

## 10) Failure modes and why they are safe

### 10.1 Missing self in peer list

If the node's key is not in the peer list, it aborts. This prevents unregistered keys from joining consensus.

### 10.2 Duplicate or unsorted peers

If the peer list is not sorted or has duplicates, the node aborts. This prevents inconsistent ordering across nodes.

### 10.3 Unknown bootstrappers

If a bootstrapper key is not found, the node aborts. This prevents accidental or malicious bootstrapping from unknown peers.

These failures are correct because they avoid starting a node in a potentially inconsistent state.

### 10.4 The risk of partial updates

A common operational failure is updating the peer list on only some nodes. This creates two groups with different validator sets. Because ordering and membership differ, their threshold signatures will not verify across groups. The network effectively partitions itself.

This is why membership changes are treated like protocol upgrades: they must be rolled out atomically or with explicit activation points. The code's strict checks are a safeguard against accidental partial updates.

### 10.5 Misordered inventories and silent divergence

Another subtle failure mode is a correctly populated peer list that is ordered differently on different nodes. Because ordering is derived from file order in many systems, two operators editing the same list can accidentally reorder entries. The `Set::try_from` check prevents this by enforcing sorted order, but it also means you must sort before you deploy.

The practical lesson: always normalize peer lists with a deterministic sort (usually by public key) before distributing them. This is not an optimization; it is a cryptographic requirement. If you skip it, the network may start, but signatures will fail to verify and consensus will stall.

---

## 11) Operational best practices

- Always run `--dry-run` before starting a new validator.
- Treat peer lists as immutable once the network is live.
- Use strict host naming conventions that embed public keys.
- Keep bootstrappers stable and well-known.

These practices prevent the most common membership mistakes.

### 11.2 Adding a new validator (step by step)

1) Generate a new validator key pair and share.
2) Add the validator to the host inventory or peers list.
3) Distribute updated inventories to all validators.
4) Run `--dry-run` on each node to validate membership.
5) Restart all validators or coordinate an activation epoch.

This process is intentionally cautious. It prioritizes correctness over speed.

### 11.3 Removing a validator

Removing a validator is the inverse process, but it has additional risk. If you remove a validator from the peer list without coordinating an epoch change, the remaining validators will still expect its signatures. This can stall consensus.

The safe approach is:

1) coordinate an epoch or configuration update that removes the validator,
2) ensure all validators update their peer list simultaneously,
3) verify with dry-run that every node agrees on the new membership.

As with additions, treat removals as protocol upgrades, not as routine ops.

### 11.1 Change management for validator sets

Changing the validator set is a protocol change. It requires:

1) Coordinated configuration updates across all validators.
2) A clear activation point (height or epoch).
3) A fallback plan if the upgrade fails.

This is why membership changes are rare and carefully planned. The node code is strict because the protocol demands it.

---

## 12) Feynman recap

Host discovery is not a side task; it is a consensus boundary. The node reads an inventory or peer list, extracts validator identities, sorts and validates them, and refuses to start if anything is inconsistent. This ensures that every node agrees on the validator set and its ordering, which is required for threshold signatures to work.

If you can explain why the node refuses to boot on an unsorted peer list, you understand why deployer logic is part of the protocol.

The key mental model: infrastructure inventories are consensus inputs. Treat them with the same rigor as protocol code.

### 12.1 Example misconfiguration and its impact

Imagine a five-validator network where one operator updates the peer list to include a sixth validator, but the other four do not. The updated node will start using a six-member threshold scheme. The others will still use a five-member scheme. Their certificates will never verify against each other, and consensus will stall. This is the real-world consequence of partial membership updates, and it is exactly why the code refuses to boot on inconsistent inputs.

In short, host discovery is consensus-critical glue. It looks like ops work, but it encodes the validator set, the ordering, and the bootstrap path. That is why the node is strict and why the runbook is precise.

Treat inventories like signed artifacts, not editable spreadsheets, and you will avoid most failures.

That mindset turns deployment data into a reliable part of the protocol.

It is operational discipline made cryptographic.

Precisely.
