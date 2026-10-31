# Exports, independent backups and recovery

Phase 15 application code and runner tooling are implemented locally. Provider provisioning, the database-backed checks, live alerts, seven-day Neon history and a full database-plus-R2 restore drill are **not verified**. No backup is operational until the operator completes the setup and acceptance gates below.

## Owner exports

Open **Settings → Exports → Create export**, then Refresh until ready. The owner receives a private `zenshin-workspace.json.gz` download. Exports include archived records, property definitions/options/values, stable IDs, task references, relationships, current canonical notes, Markdown notes, note revisions, activity and GitHub domain metadata. `records.attachments` is a manifest; attachment bytes are not bundled. Sessions, API keys, credential records, OAuth tokens, provider keys, job payloads and operational secrets are excluded by explicit table/column allowlists.

The schema is version 1: `{schemaVersion, ownerId, capturedAt, records, taskReferences, markdownNotes}`. Record column names follow PostgreSQL snake_case so recovery can preserve numeric precision, IDs and relationships. The readable Markdown view is derived from canonical note JSON.

`POST /api/v1/settings/exports` accepts `{idempotencyKey: <UUID>}` and returns 202. Retain that UUID on transport retries; the export ID is the same UUID. Only one non-expired pending/running export per owner is accepted. `GET` lists 50 exports by default, maximum 100, with `cursor`/`nextCursor`. `GET /api/v1/settings/exports/<id>/download` returns a five-minute signed URL capped by the remaining export lifetime. All routes and service methods require a human owner; bearer keys cannot export even with all scopes. Writes require the browser origin. No export tool is exposed through MCP.

The existing bounded durable runner executes two stages: repeatable-read snapshot capture, then gzip/private R2 publication. The persisted snapshot lets upload retries keep the same point-in-time data. Jobs honor their abort signal and lease; obsolete leases cannot publish ready state. Immutable object creation detects mismatched retries rather than overwriting bytes. Exports are bounded at **64 MiB of uncompressed JSON including Markdown and 200,000 records**; larger workspaces fail visibly and must use the independent backup. Expensive snapshot queries have a 2.5-second statement timeout and remain subject to the existing per-request job budget. Check integration health if an export exhausts retries.

Exports expire **24 hours after request**, including failed/incomplete snapshots. Downloads stop immediately at expiry. Durable deletion waits a one-minute margin beyond expiry to fence in-flight writers; like other application cleanup, it advances with authenticated traffic. Deletion clears the private object key and staged JSON. This convenience export does not replace an independent backup or point-in-time recovery.

Apply the reviewed additive migration `0008_export_snapshot.sql` before deploying compatible application code. Generation/build/tests do not apply it to an application database.

## Independent runner configuration

The independent runner uses a direct, unpooled database connection and **read-only R2 source credentials**, with separate AWS S3/KMS credentials. Keep these exclusively in the runner's secret store, never in the application environment or repository:

| Variable | Purpose |
| --- | --- |
| `BACKUP_DATABASE_URL` | Direct PostgreSQL dump URL; pooler hosts and connection overrides are rejected. Remote connections use `sslmode=verify-full`. |
| `BACKUP_R2_ENDPOINT`, `BACKUP_R2_BUCKET` | Source account endpoint/private attachment bucket. |
| `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` | R2 object read access only. |
| `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION` | Independent AWS S3 destination. |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | Narrowly scoped destination credentials, separate from the source/application credentials. |
| `BACKUP_S3_KMS_KEY_ID` | Full ARN of the destination KMS key. |
| `BACKUP_ALERT_FROM_EMAIL`, `BACKUP_ALERT_EMAIL` | Verified SES sender and owner destination. SES must permit the destination (verify it too while in the SES sandbox). |

The runner needs Node/pnpm from the project pins, `pg_dump` compatible with the source PostgreSQL major, AWS CLI with `sesv2`, and the frozen package lockfile. It never loads `.env.local` or another environment file automatically. Use secret injection. The backup workflow installs PostgreSQL client 18 from the official repository and rejects an older dump client; update the workflow client when upgrading the source database major.

The private-repository workflow `.github/workflows/backups.yml` schedules backups at **00:17 and 12:17 UTC** (05:47 and 17:47 India time), with serialized runs and a 45-minute limit. A separate `.github/workflows/backup-monitor.yml` checks age hourly at minute 47. Both require repository variable `BACKUPS_ENABLED=true` and configured `backup` / `backup-monitor` environments. They are disabled until configured. Give the monitor its own read-only destination credentials plus SES sending permission; it needs no database or R2 credentials. Do not add backup secrets to ordinary CI/test environments.

GitHub schedules are best effort. Configure a separate external dead-man monitor for the monitor workflow itself; an outage affecting all GitHub Actions cannot be detected by another Actions job in the same service. No external monitor has been provisioned here.

## Destination provisioning — operator action, still pending

Use an independent AWS account/bucket and KMS key. Enable S3 Versioning and Object Lock, all four public-access-block flags, and default SSE-KMS using the full configured key ARN. Set default Object Lock **COMPLIANCE retention to 30 days**. Compliance retention prevents deletion of protected versions before their retain-until date, so review this setting before applying it. The runner verifies privacy, default encryption, versioning and default retention before starting a backup.

For a pre-created destination, the operator can apply the following configurations with their administration credentials:

```sh
aws s3api put-public-access-block --bucket "$BACKUP_S3_BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$BACKUP_S3_BUCKET" \
  --versioning-configuration Status=Enabled
aws s3api put-object-lock-configuration --bucket "$BACKUP_S3_BUCKET" \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":30}}}'
```

Configure default bucket encryption with `SSEAlgorithm=aws:kms` and `KMSMasterKeyID` equal to the full `BACKUP_S3_KMS_KEY_ID` ARN. Add a bucket policy requiring TLS and the intended KMS key for writes. Configure lifecycle expiry for snapshots/old versions at or after the retention window (31 days is a practical deletion margin); Object Lock must remain authoritative for extended attachment retention. Do not grant application credentials any destination access. Protect the KMS key from accidental deletion too.

The backup role needs bucket configuration reads (`GetBucketPublicAccessBlock`, `GetEncryptionConfiguration`, `GetBucketVersioning`, `GetBucketObjectLockConfiguration`), object `GetObject`, `GetObjectVersion`, `PutObject`, `GetObjectRetention`, `PutObjectRetention`, and KMS data-key/decrypt access for that key. It does **not** need object/version deletion, public ACL, bucket policy mutation, Object Lock bypass or bucket deletion. Restrict object permissions to `objects/*`, `snapshots/*`, `latest.json`, `latest-attempt.json`; scope SES sending to the verified sender/owner. Use separate administration credentials for provisioning/lifecycle changes.

Retention and privacy behavior follow [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html); object versions remain the recovery reference even when a newer version/delete marker exists. Client installation follows [official PostgreSQL Ubuntu instructions](https://www.postgresql.org/download/linux/ubuntu/).

## Backup consistency and completeness

Run `pnpm backup` from the project with runner secrets injected. It opens a read-only repeatable-read transaction, exports its PostgreSQL snapshot and uses that same snapshot for `pg_dump`, ready-file inventory and domain row counts. The dump includes the complete database, including sensitive authentication state, and is encrypted privately at the independent destination. Unlike a portable owner export, this is a full operational backup.

After the dump, each ready attachment is copied under a hash of its immutable source object key. New uploads carry SHA-256 checksums; the runner verifies size, provider checksum, version ID, encryption key and retention. Existing verified copies are reused, and their specific versions' retention is extended for every new referencing snapshot. It does not delete source-deleted backup bytes. If a source file disappears during a first copy, or verification fails, the backup fails and leaves the last complete pointer unchanged.

The runner uploads the dump and a versioned manifest referencing exact attachment/dump **VersionIds, sizes and SHA-256 checksums**. It publishes `latest.json` only after all referenced bytes are verified and protected. `capturedAt`, rather than the later upload completion time, drives the recovery-age calculation. A partial dump or manifest is never counted as recoverable. Each dump is bounded at 2 GiB and each source attachment at 20,000,000 bytes; exceeding these limits fails visibly rather than truncating a backup. Temporary local dumps are removed and are never uploaded as GitHub build artifacts.

This snapshot pairing uses PostgreSQL's [exported snapshot support in pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html). Review source DB upgrade compatibility before changing the pinned major.

## Age monitoring and alerts

Run `pnpm backup:monitor` independently with destination read and SES permissions. It checks the checksum-protected complete manifest and latest attempt state. Healthy backups younger than 18 hours produce no owner notification. At 18 hours it warns, at 24 hours it reports an RPO breach; missing/invalid/future-dated manifests, unreadable status and failed newer attempts also alert. Failure messages contain timestamps/state only, not task text, credentials, dump content or signed URLs. The runner separately records failures and attempts an immediate email.

Test the actual SES owner delivery and the external dead-man monitor during provisioning. Unit tests verify alert selection and email payload construction without sending real mail. Provider IAM/SES delivery and workflow execution are not verified by those tests. Keep owner alerting enabled until a newer complete snapshot is healthy.

## Isolated full restore drill

1. Select a complete backup before the incident. Prepare a new **local empty database** named `zenshin_restore_<name>`, a separate private R2 bucket named `zenshin-restore-<name>`, and separate restore credentials. Stop any app connected to the target. Keep the source/production database and bucket untouched. Use a matching application checkout and a sufficiently new `pg_restore`.
2. Inject `RESTORE_DATABASE_URL`, `RESTORE_R2_ENDPOINT`, `RESTORE_R2_BUCKET`, `RESTORE_R2_ACCESS_KEY_ID`, `RESTORE_R2_SECRET_ACCESS_KEY`, plus destination read credentials under `BACKUP_S3_*`. The local database URL must have no query/host/service overrides; remote and ordinary application database names are rejected. The restore bucket must differ from the manifest's source bucket. Source credentials need not be present for restore.
3. Download, verify and apply in one command, choosing a directory that does not exist:

   ```sh
   pnpm backup:restore latest /private/tmp/zenshin-restore-drill --apply
   # Or replace latest with an explicit snapshot UUID.
   ```

   Without `--apply`, the command only downloads/verifies artifacts. Applying later uses a fresh output directory. The script verifies each exact version/checksum, restores all file bytes under their original immutable keys into the separate R2 bucket, verifies downloaded destination bytes, and restores PostgreSQL transactionally into the empty database. It does not use `--clean`, replace an existing database or write a source bucket.
4. The restore script removes sessions, API keys, OAuth access/refresh/ID tokens, passwords, verification/rate-limit records, pending jobs and idempotency receipts. Agent credentials are revoked, exports expire, unfinished uploads fail, GitHub rules disable and installations become unavailable. No old job is allowed to delete files or trigger provider work after recovery. Stable owner/account bindings and domain/history records remain.
5. Automated checks compare every exported domain table count, ready-file identities/keys/sizes and hierarchy constraints. Review `restore-report.json` for snapshot, elapsed time and file count; it is written only after successful checks. Then use an isolated app configuration to verify projects, section trees, statuses, task references, dependencies, property values, notes/revisions and private file downloads. Reconnect staging GitHub explicitly; verify no historical automation replay.
6. Rotate application auth secrets, OAuth/App/webhook secrets and source/destination credentials as appropriate to the incident. Issue new scoped agent keys. Verify the immutable owner ID and fresh owner sign-in. Do not publish the restored app or point it at production resources during the drill. Record browser/provider results and measured end-to-end recovery time before clearing the release gate.

The command records machine execution time; manual validation and credential rotation are part of the end-to-end drill time. No successful database/R2 drill has been recorded yet.

## Portable export recovery

`pnpm export:recover <workspace.json.gz> <new output directory>` validates schema version, ownership, reviewed columns, note JSON and graph structure, then extracts `workspace.json`, per-table JSON and `.md` notes. Existing output directories are refused. `pnpm recovery:self-check` runs that actual CLI against a synthetic gzip export and checks references, parent relationships, properties, canonical notes and extracted Markdown without a database/provider.

With `--apply`, the script uses the same guarded `RESTORE_DATABASE_URL`, verifies the target is empty, applies committed schema migrations, and imports whitelisted domain rows. Fresh owner binding metadata replaces unavailable auth material. Historical agent attribution remains in the export files; imported activity/revision/attachment actors normalize to system because credential rows are intentionally absent. GitHub automation is disabled. No V1 import UI is added.

For ready attachments, also set `RECOVERY_ATTACHMENT_DIR` to an already checksum-verified full-backup download directory containing `manifest.json` and `files/`, and set the separate `RESTORE_R2_*` target credentials. Every exported ready file must match that backup's attachment ID/key/size and checksum. An export without matching bytes cannot produce a complete file restore; it fails rather than claiming success. Transient pending uploads restore as failed. Full database backups preserve more operational history than portable exports.

## Neon history and recurring drill gates

Using the actual paid Neon project, configure the history/restore window to **at least seven days**, verify the returned/visible setting, and perform an isolated point-in-time restore. Record the project/environment (no secret), configured window, evidence date and successful test. Plan names alone do not establish the window. See [Neon project history configuration](https://neon.com/docs/manage/projects#configure-your-restore-window). This gate is still open.

Before launch, record a successful full restore, measured end-to-end recovery time, actual owner alert delivery, complete backup age <=24 hours, destination retention/privacy/KMS evidence, and preview/production isolation. Repeat the full drill quarterly, targeting the last Friday of January, April, July and October; the next calendar target after this implementation is **29 January 2027**, with the first verified drill required before launch regardless of that date.

Current evidence: local unit checks and the portable extraction CLI self-check pass; the CLI extraction self-check measured approximately 0.36 seconds on this machine. PostgreSQL integration setup returned `connect EPERM` before any test database was created. No measured full database-plus-files recovery duration, cloud configuration, real alert delivery, provider retention behavior or workflow result is claimed.
