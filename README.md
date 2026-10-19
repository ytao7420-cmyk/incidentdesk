# IncidentDesk

An incident evidence workspace on GenLayer. A case freezes a specific service feature, UTC date window and two wallet roles before capturing official incident statements. Validators independently interpret the frozen material; deterministic code reconciles the findings. Participants can challenge a current revision with additional official evidence, and the designated customer acknowledges an exact revision digest.

**This is an operator-statement record, not measured uptime, authenticated customer impact, a compensation decision or an SLA certificate.** Demo scenarios and wallet actors are controlled by the project. No funds are handled.

## Product workflow

1. The operator opens a case with a distinct customer address, service provider, feature and date window.
2. Either participant captures an incident from an allowlisted official status API, committing the SHA-256 of its canonical incident projection.
3. GenLayer independently retrieves that projection. The captured bytes, exact source passages and source identity become immutable evidence.
4. GenLayer validators independently interpret feature scope, occurrence window and the operator's impact statements, then validate the leader's actual cited passages. Deterministic reconciliation produces a digest-linked revision.
5. Either participant challenges the current revision. Additional official evidence is required before a new revision; the old revision remains intact.
6. Only the designated customer can acknowledge the exact current revision. Old acknowledgements never silently carry over to later revisions.

The UI supports recorded chain evidence, live reads, wallet writes, pending transaction recovery, frozen source inspection, revision selection and a chronological challenge/acknowledgement record.

## Run locally

```sh
npm ci
npm test
npm run test:contract
npm run dev
```

`npm run build` creates `dist/`. The web application does not bundle local test keys. `.local/`, `node_modules/` and `dist/` are excluded from Git.

## Evidence and deployment

```sh
npm run source
npm run plan
# Review the source first and supply its exact SHA-256:
node scripts/live-test.mjs --deploy --source-sha=<reviewed-contract-sha256>
node scripts/live-test.mjs --run
npm run verify
```

The default harness is plan-only. Execution is Studionet 61999, zero value, `leaderOnly: false`. A journal writes broadcast intent and transaction hash before waiting, and blocks uncertain re-broadcasts. Independent test actors are stored locally with restrictive permissions. Never use a funded/mainnet private key.

Until a live workflow completes, `public/evidence/demo.json` explicitly says `verified: false` and the site shows only official-source previews. It never manufactures an approved finding or successful transaction.

## Official source adapters

- GitHub: `https://www.githubstatus.com/api/v2/incidents/{id}.json`
- Cloudflare: `https://www.cloudflarestatus.com/api/v2/incidents/{id}.json`

The fixed provider host and page ID are checked. The source hash covers incident ID/name/status plus each update's ID, status, display date and **exact body**, ordered by display date and ID. Page-level `updated_at` and notification delivery metadata are excluded because they change independently of incident evidence. Any changed meaningful field requires a newly captured hash. HTTP, size, identity or hash failures fail closed; content is never silently truncated.

The example concerns two historical GitHub incidents: log delivery delays that explicitly did not affect actual workflow execution, and a separate Actions incident that did affect the frozen scope. These are official operator statements rather than our monitoring measurements.

See [architecture](docs/architecture.md), [validation](docs/validation.md) and [submission text](docs/submission-draft.md).

## Attribution

GenLayer transport, receipt checking, read pacing and resumable journal patterns are adapted from the same author's ReleaseProof and SchemaWitness projects. IncidentDesk's status-source adapter, evidence reconciliation model, scope/revision contract, tests and UI are purpose-built. It is not a fork of the GenLayer starter application.
