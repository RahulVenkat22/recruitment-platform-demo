# TalentOS: production release and operations on AWS

**Updated: 2 October 2026.** This is the operational runbook for the code in `main`. The earlier [AWS architecture and readiness review](AWS_PRODUCTION_DEPLOYMENT.md) records the original findings and the reasoning behind the architecture; its proposed filenames and example commands are superseded by this runbook.

The application now has durable background jobs, private remote media, strict production configuration, CSRF protection for cookie authentication, expiring media links, a complete password-reset flow, authenticated and deduplicated voice webhooks, bounded streaming, and a repeatable release pipeline. **This repository has not been deployed to an AWS account as part of this change.** Local tests and CloudFormation schema validation cannot prove AWS service permissions, provider delivery, DNS, availability, recovery objectives, or performance. Complete the staging acceptance checks before directing production users here.

## 1. What is deployed

| Component | Production service | Implementation |
|---|---|---|
| React/Vite SPA | Private S3 bucket behind CloudFront OAC | `frontend/`; no secrets in `VITE_*` variables |
| Django/DRF API | At least two ECS Fargate tasks in two private application subnets | `backend/Dockerfile`, `backend/gunicorn.conf.py` |
| Background processing | Separate Fargate worker service, initially two tasks | `python manage.py run_worker` |
| Job state and application data | Encrypted Multi-AZ RDS PostgreSQL 16 with pgvector and pg_trgm | `workqueue.WorkItem`; normal Django models |
| Wake-up notifications | Encrypted SQS queue and transport DLQ | Database remains authoritative if SQS is unavailable |
| Shared cache/throttles | Encrypted, authenticated, Multi-AZ ElastiCache Redis | `CACHE_URL=rediss://...` |
| Resume inputs, originals, photos, support media | Private, versioned, encrypted S3 media bucket | Django storage backend and IAM task role |
| Runtime credentials | Secrets Manager, injected by ECS execution role | No AWS access keys in the application |
| HTTPS and edge protection | CloudFront, regional ALB, WAF, ACM, Route 53 | `infra/aws/stack.json` |
| Delivery | GitHub Actions OIDC, ECR immutable tags and digest references | `.github/workflows/ci.yml`, `deploy.yml` |
| Infrastructure | CloudFormation, with retained data resources | `infra/aws/stack.json` |

CloudFormation is the supplied infrastructure implementation. The previous design suggested Terraform; there is no Terraform configuration to apply. Use one owner for these resources; do not manage this stack's resources with two tools.

The initial stack deliberately has **zero API and worker tasks**. Configure database roles, secrets, email, and the first image before enabling the services. A production release sets both services to two tasks. API CPU target tracking scales from two to six tasks. Workers stay at a bounded configured count to avoid uncontrolled LLM spend; change their capacity only after measuring queue age and provider quotas.

This remains an application for **one organization**. Role-based permissions are not tenant isolation. Use separate deployments/databases for separate organizations until tenant isolation is explicitly designed and tested.

## 2. Code and behavior changes

### Durable work

API transactions create durable `WorkItem` records alongside their business records. Resume and job-description input files are written to shared storage before acknowledging acceptance. A worker claims a due record using PostgreSQL row locking and a unique lease token. It renews its lease, retries execution failures with bounded backoff, and prevents an expired worker from committing guarded final writes.

Jobs cover resume ingestion, candidate search, job-description extraction, password-reset delivery, and voice-webhook processing. Queue payloads contain identifiers; resumes, passwords, access tokens, and transcripts are not placed on SQS. Voice payloads are retained in the restricted application database inbox.

Important semantics:

- Delivery is **at least once**. PostgreSQL's outbox and leases are authoritative; SQS is a notification channel, so an SQS outage adds polling latency and does not lose accepted jobs.
- One worker processes one job at a time. Large backlogs can delay password-reset emails; monitor age and add capacity within provider quotas. Split worker pools by kind before substantially increasing volume.
- `WORK_LEASE_SECONDS=120`, `WORK_MAX_ATTEMPTS=3`, and `WORK_MAX_SECONDS=1800` are defaults. Expired claims can be recovered by another worker. Failed input validation and explicit business failures can remain terminal in the business record, even if the worker completed successfully.
- Final database changes are fenced; external effects cannot generally provide exactly-once delivery. A reset email can be delivered again after a crash, using the same expiring link. Candidate outreach email and call placement remain synchronous external operations; never blindly retry an ambiguous SMTP/provider timeout.
- SIGTERM stops intake and drains the current work. ECS allows 120 seconds before forced termination. Work exceeding that drain time is recovered through the lease after the process dies.
- SQS's DLQ covers transport failures. **Application failures are `WorkItem.status=dead` in PostgreSQL**, not necessarily messages in the SQS DLQ.

### Security and runtime

- Production refuses weak signing keys, wildcard/local allowed hosts, insecure cookies, unverified database TLS, a local cache, missing shared storage, missing queue configuration, unapproved model providers, missing origin verification, and an enabled voice provider without a strong webhook secret.
- `config.settings.prod` does not read a developer's repository `.env`. `config.settings.demo` supports local Compose; `config.settings.build` is for static collection only.
- The browser fetches a CSRF token before cookie-authenticated login, refresh, logout, and password reset requests. Keep the API and SPA on one origin.
- Refresh rotation is serialized. Password resets are expiring, single-use, validate the new password, revoke refresh sessions, and invalidate outstanding access tokens when production password-revocation checks are active.
- Original resumes are restricted to HR staff because they contain contact details that other roles see masked in the application.
- Candidate-photo and support-attachment links expire after five minutes. Refresh the parent page to obtain new links. API/media responses are private and not cached by CloudFront.
- Voice webhooks require constant-time secret verification, persist before acknowledgement, and deduplicate identical events. Real calling is disabled in the supplied stack until configured and tested.
- Only the internal candidate source is enabled in production. The referral/Naukri/LinkedIn providers in this repository are demonstrations, not live integrations.
- Seed commands are disabled in production. Never copy demo users/passwords into production.
- SSE sends heartbeats, bounds its output queue and producer concurrency, and cancels cooperatively on disconnect or deadline. The stream deadline is 180 seconds; model calls use bounded timeouts. Validate actual provider cancellation in staging.
- Containers run as UID/GID 10001 with a read-only root filesystem and an ephemeral `/tmp` volume. Only S3 and PostgreSQL hold durable application state.
- Structured application logs redact configured credentials, token-like strings, email addresses, and URLs. This is defense in depth, not a substitute for reviewing new logging statements for personal data. Gunicorn access logs omit query strings.

## 3. Prerequisites and environment separation

Create separate AWS accounts or equivalent isolated stacks and secrets for staging and production. Do not connect CI or a developer workstation's tests to the production database.

Provision or identify:

1. An AWS account and deployment region, initially `ap-south-1`; at least two usable Availability Zones.
2. A public Route 53 hosted zone and hostname such as `talent.example.com`.
3. An issued ACM certificate for `talent.example.com` **in `us-east-1`** for CloudFront.
4. An issued ACM certificate for `origin.talent.example.com` **in the application region** for the ALB. Create DNS-validation records before deploying the application stack.
5. A confirmed SNS operations topic in the application region. Subscribe the responsible on-call team through your normal process.
6. SES production sending access, a verified sender identity, DKIM records, SPF/custom MAIL FROM as appropriate, DMARC, and a monitored reply mailbox. The supplied sender is `talent@<DomainName>`; change the template if your verified sender differs. SES SMTP credentials are region-specific and are distinct from AWS console credentials.
7. Approved LLM provider account, models, data-processing terms, retention settings, and spend/rate limits. The supplied stack approves OpenAI only. Chat and embedding provider changes require explicit configuration; changing the embedding provider/model requires re-embedding existing resumes.
8. An IAM OIDC provider for `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`, and the repository identifier `owner/repository`.
9. A platform-operated CloudFormation service role able to manage this stack's resources. Restrict its trust to CloudFormation and restrict which operators can pass it. The release role relies on the role attached during initial stack creation; the release script refuses stacks without it.
10. AWS CLI v2, Docker, Python 3.12, Node 24, PostgreSQL client tools, and a private administrative path to RDS (for example, a temporary SSM-managed administrative host or an existing VPN). RDS is never made public for setup.

Configure the GitHub `production` environment with allowed deployment branches restricted to `main` and your organization's required reviewer policy. Protect `main` with required CI and review. Those repository settings are external to the YAML files; creating the files does not enable the protections.

Use AWS IAM Identity Center/SSO and MFA for human AWS access. Application SSO/MFA is not implemented by this change; if required by your organization, implement or place an approved identity access layer in front of the application before launch.

## 4. Secrets: create before the stack, complete after bootstrap

Create one Secrets Manager **JSON** secret for this environment. Use the AWS console or a controlled secret-management workflow. Do not place values in shell arguments, `.tfvars`, source control, GitHub repository variables, Docker build arguments, screenshots, or support tickets.

| JSON key | Value and timing |
|---|---|
| `DJANGO_SECRET_KEY` | Cryptographically random, at least 50 characters; generate before stack creation |
| `ORIGIN_VERIFY_SECRET` | Cryptographically random, at least 32 characters; same value is resolved into CloudFront, ALB, and API |
| `CACHE_AUTH` | Random 64-character **alphanumeric** Redis token; needed during stack creation |
| `DATABASE_URL` | Runtime role's PostgreSQL URL; fill after database bootstrap |
| `MIGRATION_DATABASE_URL` | Separate migration role URL; used only by the one-off migration task |
| `CACHE_URL` | `rediss://:<CACHE_AUTH>@<CacheEndpoint>:6379/0`; fill after stack creation |
| `OPENAI_API_KEY` | Approved provider key; use a dedicated project with spend limits |
| `EMAIL_HOST_USER` | SES SMTP username for the application region |
| `EMAIL_HOST_PASSWORD` | SES SMTP password |
| `COMPANY_PROFILE` | Accurate approved company information; replace the demo claims |

An example database URL shape, with every reserved character in the username/password URL-encoded:

```text
postgres://talentos_runtime:URL_ENCODED_PASSWORD@RDS_ENDPOINT:5432/talentos?sslmode=verify-full&sslrootcert=/app/certs/rds-global-bundle.pem
```

Use `talentos_migrator` in `MIGRATION_DATABASE_URL`. The image includes the public Amazon RDS CA bundle; see `backend/certs/README.md` for provenance and hash. Never disable certificate verification to get past a connection error.

`python manage.py check_production` rejects Django deployment warnings except `security.W005` and `security.W021`: subdomain-wide HSTS and browser preloading require a deliberate domain-owner decision. HTTPS, one-year HSTS, and secure cookies are enabled; set `DJANGO_HSTS_INCLUDE_SUBDOMAINS=true` only after all affected subdomains are HTTPS-ready.

At zero tasks, the URL fields may be placeholders while endpoints are created. Replace them before the first release. ECS injects secrets at task startup, so rotating a secret requires a fresh deployment of **both** services. CloudFormation resolves the origin/cache dynamic references on the relevant resource updates; changing a secret alone does not update CloudFront or ElastiCache. Plan origin/cache rotation as coordinated infrastructure changes and test it in staging.

Use a customer-managed KMS key where organizational policy requires it, adding the necessary grants to execution/application/backup roles. The supplied template uses AWS-managed/default service encryption; it does not create custom KMS keys or grant wildcard KMS decryption.

## 5. Bootstrap infrastructure

Review [the template](../infra/aws/stack.json) in a staging account first. It creates two NAT gateways, Multi-AZ RDS, two cache nodes, an ALB, and other continuously billed resources even when ECS desired counts are zero. Use AWS Pricing Calculator for your region and workload; configure account budgets before deployment.

Confirm an available PostgreSQL 16 minor and the regional CloudFront origin-facing prefix list:

```bash
export AWS_REGION=ap-south-1
aws rds describe-db-engine-versions --engine postgres --engine-version 16.14 \
  --query 'DBEngineVersions[].EngineVersion'
aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[].PrefixListId'
```

The default PostgreSQL version is `16.14`; confirm availability rather than assuming all regions have identical releases. Supply a supported 16.x version if necessary. Never silently change the major version.

Validate the template locally:

```bash
python3 -m venv /tmp/talentos-infra-tools
/tmp/talentos-infra-tools/bin/pip install cfn-lint==1.57.1
/tmp/talentos-infra-tools/bin/cfn-lint infra/aws/stack.json
```

Deploy using your infrastructure operator credentials and approved CloudFormation service role. The following values are identifiers, not secret contents:

```bash
aws cloudformation deploy \
  --stack-name talentos-staging \
  --template-file infra/aws/stack.json \
  --s3-bucket YOUR_PRIVATE_INFRA_ARTIFACT_BUCKET \
  --role-arn YOUR_CLOUDFORMATION_SERVICE_ROLE_ARN \
  --capabilities CAPABILITY_IAM \
  --tags Environment=staging Application=TalentOS \
  --parameter-overrides \
    DomainName=talent-staging.example.com \
    HostedZoneId=YOUR_ZONE_ID \
    ViewerCertificateArn=YOUR_US_EAST_1_CERT_ARN \
    OriginCertificateArn=YOUR_REGIONAL_ORIGIN_CERT_ARN \
    CloudFrontPrefixListId=YOUR_REGIONAL_PREFIX_LIST_ID \
    AppSecretArn=YOUR_SECRET_ARN \
    AlarmTopicArn=YOUR_CONFIRMED_SNS_TOPIC_ARN \
    GitHubOidcProviderArn=YOUR_OIDC_PROVIDER_ARN \
    GitHubRepository=YOUR_ORG/YOUR_REPOSITORY \
    DatabaseEngineVersion=16.14 DesiredCount=0 WorkerCount=0
```

The template exceeds CloudFormation's inline template size limit, which is why an existing private artifact bucket is specified. Require TLS, encryption, and restricted operator/CloudFormation access on that bucket.

Record stack outputs without dumping secret values:

```bash
aws cloudformation describe-stacks --stack-name talentos-staging \
  --query 'Stacks[0].Outputs' --output table
```

Verify the resulting network:

- ALB HTTPS accepts only the AWS CloudFront origin-facing prefix list, and its listener additionally requires `X-Origin-Verify`.
- CloudFront overwrites `X-Talent-Client-IP` using the real viewer IP; the API verifies the origin secret before trusting it. Do not substitute the first `X-Forwarded-For` hop.
- API port 8200 accepts traffic only from the ALB security group.
- RDS 5432 and cache 6379 accept traffic only from application tasks. For bootstrap, temporarily allow the administrative host's security group, then remove that rule.
- App subnets have a NAT gateway in their own AZ for approved external APIs. Data subnets have no internet route. S3 traffic uses the gateway endpoint.
- All S3 buckets block public access; only CloudFront OAC can read the web bucket. There is no public `/media/` mount.
- WAF protects the ALB, rate-limits the trusted viewer IP, and disables body-size blocking in the common rule set so legitimate uploads work. Django enforces a 32 MiB aggregate request cap; the browser limits resume batches to 10 files/30 MiB. WAF does not inspect every byte of a large upload. Test representative PDFs and support files for false positives.

The template does not expose Django admin through CloudFront. Manage users through the authorized application workflow and one-off administrative tasks; do not add an unprotected ALB bypass for convenience.

## 6. Initialize database roles and extensions

Connect to the RDS endpoint from the approved private administrative path with `sslmode=verify-full`. Obtain the managed master credentials using the `MasterSecretArn` output through the approved secret-access workflow. Never put passwords directly in a `psql` command line.

Run [`infra/aws/bootstrap.sql`](../infra/aws/bootstrap.sql) once against the `talentos` database. It creates `vector` and `pg_trgm`, separates migration and runtime roles, revokes public schema creation, and defines default grants for application tables and sequences.

In the interactive `psql` session, set strong distinct passwords without writing plaintext SQL/history:

```text
\password talentos_migrator
\password talentos_runtime
```

Store the resulting URLs in the appropriate secret fields. The runtime role must have **no** superuser, database-creation, role-creation, or schema-creation privileges. The migration role owns application objects and is used only in migration tasks. Do not use the RDS master role as `DATABASE_URL`.

For an existing database:

1. Take and verify a backup.
2. Inventory table/sequence owners and extensions.
3. Restore into staging first and transfer application object ownership to the migration role using reviewed, narrowly scoped SQL.
4. Apply grants to existing objects as well as default privileges for future objects.
5. Run the application's permission and mutation tests with the runtime role.

Do not blindly apply `REASSIGN OWNED` to the RDS master role; it can affect objects beyond this application.

## 7. Migrate existing uploaded files

The new schema is additive: old source paths remain supported while new uploads use `input_file`. ECS tasks cannot read files on your developer workstation or previous host.

Before production cutover, back up both the database and local media, mount the old directories on a controlled migration machine, and configure the target S3 default storage. Use the migration role for this administrative command:

```bash
python manage.py migrate_media \
  --resume-root /mounted/old/resumes --media-root /mounted/old/backend/media
python manage.py migrate_media \
  --resume-root /mounted/old/resumes --media-root /mounted/old/backend/media --apply
```

The first invocation inventories without copying. The second copies resume inputs, candidate photos, and support attachments, then updates database pointers. It retains source files and exits nonzero when referenced bytes are missing. Resolve missing files from backups or the original S3 objects before cutover. Verify representative PDF checksums, attachment downloads, photo links, and role restrictions. Preserve the source backup until restore testing and the retention window are complete.

Old in-process work from the pre-hardening version has no durable job record. At cutover, inventory pending resume documents, pending/running searches, and uploading/processing JD uploads. Cancel/restart orphaned searches and JD uploads through their owner workflows. For pending resumes, first migrate the bytes and then enqueue the document once from a controlled management session:

```python
from resumes.models import ResumeDocument, ResumeStatus
from workqueue.services import enqueue
for document in ResumeDocument.objects.filter(status=ResumeStatus.PENDING).iterator():
    if not document.input_file:
        raise RuntimeError(f"Migrate the input file before queuing {document.pk}")
    enqueue("resume", f"resume:{document.pk}", {"id": str(document.pk)}, reschedule=True)
```

Run this while workers are still at zero desired count; start them with the first release. Re-running the script preserves active work records. An ordinary duplicate upload is not a substitute for migrating orphaned pending rows. Interrupted JD uploads without a complete file must be cancelled and uploaded again.

## 8. CI and release process

CI runs backend lint/format/import contracts, migration drift detection, all backend tests on a disposable PostgreSQL/pgvector service, frontend lint/tests/build, dependency audits, and CloudFormation validation. GitHub Actions are pinned to commit SHAs. Maintain those pins through reviewed updates.

Runtime Python dependencies and hashes are in `backend/requirements.lock`; the image installs with `--require-hashes`. The lock targets Linux and Python 3.12 and is derived from the validated runtime environment by `scripts/lock_runtime.py`. To update it, use a clean Linux/Python 3.12 environment, install the reviewed `requirements.txt`, run `pip check`, regenerate the lock, audit, and rerun the image build and tests. Do not regenerate from an unrelated global Python installation.

Set these variables on the GitHub `production` environment:

| Variable | Value |
|---|---|
| `AWS_REGION` | Deployment region |
| `AWS_STACK_NAME` | Existing production stack name |
| `AWS_DEPLOY_ROLE_ARN` | Stack's `DeployRoleArn` output |

For staging, create an equivalent environment and OIDC trust restricted to its name; the shipped role/workflow explicitly names `production`. Do not weaken its trust to `repo:ORG/REPO:*` to get a staging run through.

After CI succeeds for the exact `main` commit, manually dispatch **Deploy production**. It:

1. Requires successful CI for the same SHA.
2. Assumes the limited release role via OIDC.
3. Resolves the Python base image to a digest, builds the API/worker image, labels it with the commit, and pushes an immutable ECR tag.
4. Waits for the ECR image scan and rejects high/critical findings.
5. Builds the same-origin frontend with `VITE_API_BASE_URL` empty.
6. Registers and runs a separate migration task with `MIGRATION_DATABASE_URL`; `release_migrate` runs production checks and obtains a PostgreSQL advisory deployment lock.
7. Waits for the task to stop and requires exit code zero for every container. A failure stops the release before serving tasks change.
8. Archives frontend artifacts and a release manifest in the private releases bucket.
9. Updates only image and desired-count parameters through a CloudFormation change set, preserving other parameters and using the existing template/service role.
10. Waits for stack completion, confirms both services have running tasks using the requested image, and smoke-tests the API.
11. Uploads hashed assets before `index.html`, retains previous assets, invalidates CloudFront, and runs API smoke checks again.

The underlying command is:

```bash
python scripts/release/deploy.py \
  --stack talentos-prod \
  --image ACCOUNT.dkr.ecr.REGION.amazonaws.com/REPOSITORY@sha256:EXACT_IMAGE_DIGEST \
  --frontend frontend/dist \
  --release FULL_40_CHARACTER_GIT_COMMIT_SHA
```

The script validates the image belongs to this stack's repository and is digest-addressed. Do not substitute `latest`. Production deployment concurrency is serialized in GitHub and database migrations take an advisory lock. Infrastructure edits go through a separate reviewed operator change set; this release script deliberately reuses the existing template.

After initial deployment, create the first real HR administrator through a one-off `createsuperuser --noinput` task. Inject `DJANGO_SUPERUSER_EMAIL`, `DJANGO_SUPERUSER_FIRST_NAME`, `DJANGO_SUPERUSER_LAST_NAME`, and `DJANGO_SUPERUSER_PASSWORD` from a temporary Secrets Manager secret into that task definition, rather than plaintext ECS environment overrides. Deliver the initial credential through your approved channel, change it immediately, and remove the bootstrap secret/task definition. Never use `seed_demo` in production.

## 9. Acceptance checks before inviting production users

Run these against a staging stack with production settings and realistic, non-sensitive test fixtures. Record the image digest, browser, timestamps, and observed results.

| Area | Required evidence |
|---|---|
| Routing | Deep links load the SPA; a missing `.js` returns an error, not `index.html`; unknown API paths return API errors |
| HTTPS/origin | HTTP redirects; TLS certificates match; direct ALB access fails; spoofed origin/IP headers do not bypass protection |
| Authentication | Login, refresh, logout, expired token, disabled user, role checks, password change; cross-origin cookie requests fail CSRF |
| Password reset | Mail reaches the verified test recipient; link expires and works once; old sessions are rejected |
| Resume ingestion | Upload, immediately stop the API task, and verify the worker still completes; stop a worker during processing and verify safe recovery |
| Shared storage | Upload through one API task, read through another, replace both, and verify files remain accessible |
| JD extraction/search | Completion, cancellation, duplicate delivery, worker replacement, invalid input, provider timeout, and terminal failure are visible in the UI |
| Streaming | A slow model response emits heartbeats beyond 60 seconds; disconnect stops work; deadline returns a useful error; capacity remains bounded |
| Authorization | Non-HR roles cannot retrieve original resumes; private links expire; ticket attachment visibility follows ticket permissions |
| Email/calls | SES identity/sandbox/replies work; ambiguous sends are reconciled before retry; real voice remains disabled until its full webhook/call tests pass |
| Failure recovery | Database/cache failover, blocked SQS, unavailable LLM, deployment failure, and exhausted jobs produce observable failures without losing accepted uploads |
| Recovery | Restore RDS to a new instance and restore a selected S3 version; reconnect staging and run business smoke tests |
| Performance | Test agreed concurrent users, maximum legal upload, busy stream concurrency, database connections, queue delay, CPU/memory, and error rates |

Define business SLOs and recovery targets before launch. Suggested starting targets for discussion are API availability 99.9%, RPO 15 minutes, and RTO four hours, but **these are not measured guarantees**. RDS PITR and S3 versioning alone do not establish a verified application recovery time.

Upload validation checks file type/size and PDF signatures; it is not malware scanning. For organizations that require malware screening or accept files from untrusted public submitters, add an S3 quarantine/scanning workflow and block processing/downloads until a clean verdict. This deployment currently exposes uploads to authenticated staff.

## 10. Observability and routine operations

The template enables ECS Container Insights, 90-day application logs, ALB access logs, and alarms for target 5xx, latency, database CPU/storage, SQS transport DLQ depth, database-backed dead jobs, queue age, and worker heartbeat. Worker metrics are emitted as CloudWatch Embedded Metric Format under `TalentOS/Workers` with `Service=workqueue` and `Deployment=<stack-name>` so different stacks in one account do not share heartbeat signals.

Treat alarms as a starting point: tune thresholds from staging results and verify notification delivery. ALB access logs can include signed URL query parameters; keep their bucket private, restrict log readers, and respect their 90-day lifecycle. Do not export raw access logs into broadly accessible analytics.

Inspect work from an approved one-off management task or private admin connection:

```python
from workqueue.models import WorkItem
WorkItem.objects.filter(status="dead").values("id", "kind", "attempts", "error", "updated_at")
WorkItem.objects.filter(status="pending").order_by("available_at").values("id", "kind", "available_at")[:20]
```

After fixing the underlying cause, retry **one** dead work item:

```bash
python manage.py retry_work UUID_OF_DEAD_WORK_ITEM
```

Inspect the business record before retrying. A JD upload already marked failed/cancelled is terminal and requires a new upload; retrying its queue record does not override user cancellation. Likewise, a terminal search is not silently run again. Resumes with recoverable failure can be re-submitted; successfully parsed file hashes are deduplicated.

Operational schedule:

- Daily: review failed/dead work, notification delivery, provider quotas/spend, database storage/connections, and backup completion.
- Daily: run `python manage.py flushexpiredtokens` as a scheduled one-off ECS task using the runtime role. Add that schedule in your operations account before high-volume use; it is not included in this stack.
- Weekly: review dependency/image advisories and deploy tested updates; review WAF false positives and unexplained authentication failures.
- Monthly: restore a backup, review access, test alarm delivery, review S3 noncurrent versions and orphaned uploads, and tune capacity.
- On provider/model change: review data destinations and run extraction/search quality tests. Re-embed when the embedding space changes; never mix incompatible embeddings in the same index.

Define retention for resumes, transcripts, support attachments, audit records, completed work, password-reset requests, and releases with the application's owner. Do not delete S3 objects solely because they are old; reconcile database references and active retention obligations. Lifecycle rules abort incomplete multipart uploads and expire old object versions but intentionally do not delete active resume originals.

## 11. Rollback and disaster recovery

### Application rollback

Keep the previous release manifest and frontend archive. A rollback changes the application image and SPA together; it does **not** automatically reverse database migrations.

1. Stop additional releases and identify the last known healthy digest and full commit SHA.
2. Confirm the old application is compatible with the current schema. Prefer expand/contract migrations and postpone destructive changes until older releases no longer run.
3. Download the archived frontend for that release from `ReleasesBucket/releases/<SHA>/frontend/` into a clean directory.
4. Re-run `scripts/release/deploy.py` with the old image, old SHA, and restored frontend **only when the old code's migration set is safe against the current schema**. Alternatively, use a reviewed image-only CloudFormation change set that intentionally skips migration execution and restore the frontend assets/index. Do not run `migrate <app> <old-number>` as an automatic rollback step.
5. Verify actual ECS task definitions/digests, restore the matching entry point, invalidate CloudFront, and repeat authentication/upload/search checks.

If migrations succeeded but application deployment failed, the release script leaves the new schema in place. Diagnose compatibility before retrying; restoring the old schema can lose newly written business data.

### Data recovery

RDS has 35-day automated backups/PITR, encryption, deletion protection, and snapshot retention on stack deletion/replacement. S3 data buckets are retained, encrypted, versioned, and deny non-TLS access. These controls do not substitute for a separate recovery copy against account compromise.

Use your organization's AWS Backup/cross-account backup policy, backup vault controls, and S3 replication where required by the agreed RPO/RTO. The supplied stack does not configure cross-region or cross-account disaster recovery. Restore RDS to a **new** instance, verify extensions/roles/data, update secrets, restart services, validate S3 references, and then switch traffic. Record a timed restore exercise before committing to a recovery objective.

## 12. Important limits and planned capacity work

- Real cloud deployment, multi-AZ failover, provider calls, browser-to-CloudFront streaming, rollback, and restore drills must still be exercised in your account.
- SSO/MFA, tenant isolation, a malware quarantine workflow, and organization-specific retention/backup automation are separate capabilities, not implied by secure container hosting.
- Background workers share one PostgreSQL work table and notification queue. Use measured queue delay to decide when to isolate job types; do not scale blindly against model rate limits.
- Outreach SMTP and call placement run synchronously and can have ambiguous delivery on external timeouts. Keep initial batch sizes and concurrency small; reconcile provider evidence before retries. Build an explicit user-visible outbound delivery outbox before promising high-volume exactly-once outreach.
- The API includes 3D landing-page and chart dependencies that produce large frontend chunks. They are code-split, but validate real device/network performance. This is a performance concern rather than an infrastructure availability guarantee.
- The repository stores recruiting data and sends selected material to configured AI providers. Obtain the required operational and data-processing approvals for your organization; do not enable extra providers through fallback without approval.

## Local verification of this implementation

These checks were run against this change on 2 October 2026:

| Check | Result |
|---|---|
| Backend regression tests, isolated PostgreSQL 16/pgvector | 1,159 passed |
| Frontend tests | 201 passed across 38 files |
| Backend Ruff, formatting, import contracts, migration drift | Passed |
| Frontend ESLint, TypeScript, production build | Passed; existing large-chunk warnings remain |
| OpenAPI generation with `--validate --fail-on-warn` | Passed |
| Complete locked Python dependency audit | No known vulnerabilities reported |
| npm dependency audit | No known vulnerabilities reported |
| CloudFormation validation | 85-resource template passes cfn-lint |
| GitHub workflow YAML and embedded shell syntax | Validated locally; hosted workflow execution still requires the repository/environment setup |
| Docker image build from hash-locked dependencies | Passed |
| Read-only container, UID 10001, temporary volume, liveness, origin rejection | Passed |
| Migrations and worker startup inside the image, isolated database | Passed |
| Production deployment checks inside the image | Passed with the documented HSTS subdomain/preload exceptions |
| Actual AWS provisioning, end-to-end cloud release, provider delivery and recovery drills | Not performed; complete staging acceptance before launch |

## 13. References

- [Django deployment checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/) — HTTPS, secret handling, environment settings, and deployment checks.
- [Django CSRF guidance](https://docs.djangoproject.com/en/5.2/ref/csrf/) — cookie-authenticated requests and trusted origins.
- [Amazon S3 storage backend](https://django-storages.readthedocs.io/en/latest/backends/amazon-S3.html) — IAM credential discovery and private storage options.
- [RDS certificate verification](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html) — CA bundles and server identity verification.
- [ECS bind mounts](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/bind-mounts.html) — ephemeral volume lifetime and Dockerfile ownership.
- [CloudFront origin request policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html) — the API policy forwards cookies, authorization and query strings while using the origin host.
- [RDS PostgreSQL release calendar](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-release-calendar.html) — version support and upgrade planning.
