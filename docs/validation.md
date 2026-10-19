# Validation status and reproduction

## Local checks

- 22 Python rule tests cover the scope/role boundaries, source hash binding, exact citations, independent semantic disagreement, substantive citation rejection, immutable revisions, required challenge evidence and customer-only exact-revision acknowledgement.
- 34 JavaScript tests pass: 8 adapter/reconciliation tests, 9 historical-recovery regressions, and 17 prebroadcast/recovery regressions. The latter execute the actual browser transport against SDK/provider/storage stubs: intent-before-send ordering, lost responses and reloads, storage failures, malformed records, wrong recovery identity/calldata/value/mode, exact state read-back, explicit wallet rejection, legacy pending records, and prevention of replacement sends.
- Vite production build is required before release.

The Python runtime is an explicit test stub with predetermined HTTP/model results. Unit tests **do not** establish actual network consensus, prompt-injection resistance, source truth, uptime or production readiness.

Run:

```sh
npm ci
npm test
npm run test:contract
npm run build
npm run plan
```

## Public chain evidence

Verified on GenLayer Studionet (61999). Contract `0x461bCf6a09D2a0358003379dd7B356C91B3074B4`; source SHA-256 `c25dd12beceb4bee7acf1fc34031a473bc256d560adcee6c99c0ff34d7c3d4ab`. Deployment transaction: `0x7a0a8989cbd0f8a587b5930012eb4e3aaa3e8f297492a5260ba4b96dc0c9d145`. The retrieved on-chain source matched the reviewed local bytes.

The public archive contains one complete synthetic case, two frozen official sources, two immutable revisions, one resolved challenge, and a customer acknowledgement of the exact second revision. All seven application transactions and deployment showed successful execution and full-validator `MAJORITY_AGREE`; `leaderOnly` was false. The initial outcome was `EXPLICIT_NO_IMPACT_IN_CAPTURED_INCIDENTS`, changing to `OPERATOR_REPORTED_IMPACT` after additional official evidence. These are operator-statement findings, not actual measurements or independent customer participation.

See `public/deployment.json` and `public/evidence/demo.json` for hashes and recorded receipts. Archive verification passes.

The live workflow recorded seven successful application writes (plus deployment): case open; first official capture; initial semantic evaluation; customer challenge; second official capture; new immutable evaluation; exact customer acknowledgement. It verifies the source hash, both frozen sources, old-revision immutability, changed outcome, all transaction executions, full majority validator consensus and final customer acknowledgement.

`npm run verify` checks canonical source/revision/evidence hashes, citation membership, deterministic outcomes, revision-chain links, challenge resolutions, acknowledgement bindings and successful transaction metadata in the archive. It refuses an unverified placeholder archive. This offline verifier detects structural tampering, not arbitrary forged evidence backed by no chain; reviewers should also inspect the public transaction URLs and read the live contract.

## Browser broadcast recovery regression

The frontend now persists the complete intent before calling `writeContract`. A lost response or interrupted page leaves a recoverable intent and blocks subsequent writes. The recovery form accepts a user-supplied transaction hash, verifies sender/target/exact calldata from the Studionet RPC, saves the hash, and resumes receipt/state verification. Uncertain intents cannot be cleared as failures. Only explicit wallet rejection (EIP-1193 code 4001) or a verified terminal failed transaction releases the saved record, retaining diagnostic history.

These 17 new regression tests are mocked transport/storage tests, not additional live-chain executions. Existing historical evaluation recovery remains covered. No contract or archived chain result changed.

## Read-only transaction recovery check

After the live case reached `ACKNOWLEDGED` with revision 2 current, the actual first evaluation receipt (`0x468d0247948a197a6003c2355f48cfa738fad7a2d995386d9ff0a334bd53329c`) recovered revision 1, digest `86ea229108009883e92c272e3543405c124f2babda7cfd8861229f32232f5807`. The actual second evaluation receipt recovered revision 2, digest `fbe3d309d9267eac03946f15f0b6ae1719f8aa8cfe7376a136a5b6399d87f481`. These checks read existing receipts and current immutable revision history; they made no new chain writes.

Recovery verifies receipt hash, sender, contract, exact ABI calldata, successful full-validator consensus, and decoded leader equivalence outputs against the stored revision's complete findings. It does not infer the result from the latest case state. A later challenge or acknowledgement can therefore coexist with verification of an earlier evaluation. If identical outputs match multiple revisions, recovery retains the pending hash and requires manual inspection instead of choosing a revision. Unit tests cover that conservative failure path. An RPC transaction-hash argument is not treated as proof of a historical state snapshot.

## Review the product

1. Inspect the read-only recorded case and scope.
2. Compare revision 1 with revision 2.
3. Open frozen source updates and quoted passages.
4. Read the challenge that introduced the second incident.
5. Verify the designated customer acknowledged revision 2's digest.
6. Connect a wallet in Live mode to read/create a separate public test case.

No real customer documents or funded wallets are used. A publicly visible GitHub incident is an operator statement, not a measurement by this application.
