# Architecture and trust boundaries

## Different trust problem

A service operator's status report can describe a different feature, an event outside the review's precommitted time window, a preliminary suspicion later corrected, or delayed log visibility without delayed execution. IncidentDesk records a bounded, revisable reconciliation of those statements. It never measures availability itself.

The immutable scope is `{provider, feature, from_date, to_date, time_basis}`. The date window uses inclusive UTC calendar dates, not calculated outage minutes. A case operator and a distinct designated customer can supply official evidence; any wallet can read the public record. These wallet roles do not prove independent real-world identities.

## Source capture

Adapters construct HTTPS URLs from fixed allowlisted hosts and 12-character incident IDs. The returned incident's identity and provider page ID must match. Each snapshot preserves all supported update bodies, including HTML entities, exact display dates and statuses, without truncation. A deterministic projection drops unrelated page and notification metadata. Capture compares the canonical projection to a caller-precommitted SHA-256 and runs under GenLayer strict equality across independent source fetches.

Four snapshots per case, 30 updates per snapshot and 40,000 projection bytes bound the workload. Exceeding limits is an error. No arbitrary URLs, private API keys or user-supplied report body enter the official source path.

If an operator corrects an existing incident, participants can challenge and capture its new projection. The newest captured version of that incident drives the current review. Older snapshots, original findings and their acknowledgements remain stored. An unchanged snapshot cannot be added twice.

## Semantic consensus

For each active incident, the leader extracts three bounded fields: feature relation, occurrence-window relation and impact statement. Citations must be exact substrings of identified frozen updates. Each validator independently extracts the same semantic tuple and separately checks that the leader's actual citations substantively support it in full source context. The validator compares all three fields; different prose or equivalent citation selection is allowed.

Prompts treat scope, challenge and source content as untrusted data, distinguish publication timestamps from described event dates, and require ambiguity to stay uncertain. This is defense in depth, not a proof of prompt-injection resistance or objective truth. Validators share model/network trust assumptions. Official status posts can be incomplete or wrong.

## Deterministic reconciliation

- Any in-scope, in-window official impact report → `OPERATOR_REPORTED_IMPACT`.
- Uncertain scope/window or unestablished impact among included incidents → `INCONCLUSIVE` unless a positive report already establishes the bounded claim.
- No included evidence → `NO_SCOPED_EVIDENCE`.
- Included incidents all explicitly deny impact to the feature → `EXPLICIT_NO_IMPACT_IN_CAPTURED_INCIDENTS`.

A no-impact statement for one incident never cancels impact reported in another. The final label is code-derived; the model cannot select an arbitrary outcome. None of these outcomes means that the service was globally healthy, establishes a duration or pays compensation.

## State lifecycle

`OPEN → EVIDENCE_READY → REVIEWED → ACKNOWLEDGED`

`REVIEWED or ACKNOWLEDGED → CHALLENGED → [new official evidence] → REVIEWED`

An evaluation commits an immutable revision containing the frozen scope digest, evidence digests, findings, deterministic outcome and previous revision digest. A challenge binds to the current digest and requires a new snapshot before evaluation. Up to three challenges are supported. Only the designated customer can acknowledge the exact current reviewed digest. Historical acknowledgements are never overwritten.

## Client and harness

The website uses `genlayer-js` 1.1.8 and EIP-6963 discovery for MetaMask. It verifies the active account/network before writing, sends zero-value Studionet transactions with a full validator run, checks receipt execution rather than only transaction status, and reads committed state back. A versioned intent containing actor, contract, network, method, arguments and zero-value/full-validator mode is persisted and read back before invoking the SDK send. Unknown outcomes remain blocked even without a returned hash; unreadable storage also blocks new writes. The user can recover a hash from wallet activity or the explorer. Recovery verifies the RPC transaction hash, actor, target, exact ABI calldata, and any exposed value/validator mode before associating it with the saved intent. It then performs normal full-validator execution and state verification. Known hashes survive page reload and are resumed without resubmission. Only explicit EIP-1193 user rejection of the unsent wallet request or an observed terminal failed transaction can release the record; diagnostics remain in local storage. Clearing browser storage loses this local recovery protection. The recovery entry requires the hash of the intended attempt; it does not search history or automatically choose an older matching call.

The local harness uses private test keys in ignored `.local/` with mode 0600, serialized receipt polling/read pacing, source-code hash verification, per-action journals and evidence archives. Deployment and live execution are explicit flags. All demo actors are project-controlled.
