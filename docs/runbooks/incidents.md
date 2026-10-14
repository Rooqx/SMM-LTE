# Incident-response runbook

For every incident: declare an owner, preserve timestamps/correlation IDs,
restrict access, avoid copying sensitive bodies, stabilize before repairing,
and record a blameless timeline and follow-up controls.

## Credential or signing-key leakage

Revoke the affected API key/provider secret/session-signing key at its source,
rotate through the host secret manager, retain overlap only where the protocol
requires it, and inspect audit/auth logs for use since the earliest possible
exposure. Never commit replacement values. Force session revocation when Better
Auth or assertion keys are affected.

## Session compromise or authentication spike

Revoke sessions, preserve user/session IDs and source metadata, increase edge
controls without revealing account existence, and verify Better Auth database
rate limits plus proxy identity. Notify affected owners according to policy.

## Account-isolation defect

Treat as critical. Disable the affected route or traffic, preserve database and
request evidence, identify every object/actor affected, and do not re-enable
until cross-account tests pass on the exact fix. Assess notification obligations
with the data owner.

## Prompt/tool abuse

Disable the affected recipe/tool through a reviewed server release, preserve
action type and hashes rather than full sensitive prompts, check for canonical
state changes, and verify allowlists, size limits, and rendering sanitization.

## Provider outage or unusual spend

Reduce or stop admission, keep queued state durable, preserve auth email
priority, and avoid increasing retries or concurrency reflexively. Confirm rate
limits, model latency, token totals, estimated price configuration, and provider
status. Resume with a canary.

## Database outage, corruption, or pool exhaustion

Stop new work, allow leases to expire, and prevent split-brain writes. For pool
exhaustion, reduce replicas/concurrency and identify long transactions/waits.
For data loss, follow the isolated restore/PITR procedure and measure RPO/RTO.
Do not point two writable primaries at the application.

## Bad migration or release

Stop rollout, drain incompatible workers, and separate application rollback
from database repair. Prefer a forward-fix migration; never edit an applied SQL
file or restore an old database over new production writes without an approved
recovery decision. Keep a worker version capable of every live pinned recipe
and bundle.
