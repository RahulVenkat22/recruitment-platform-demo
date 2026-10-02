# AWS production deployment guide — TalentOS recruitment platform

Reviewed on **2 October 2026**, against application commit **`0c2c7aa`**.

## 1. Recommendation and readiness

Deploy the React frontend to **private Amazon S3 behind CloudFront**, the Django API and background workers to **Amazon ECS on Fargate**, and the database to **Amazon RDS for PostgreSQL with pgvector**. Use **SQS for durable background work**, **ElastiCache for shared cache/throttle state**, **Secrets Manager for secrets**, and **private S3 for recruitment documents and media**. Keep the browser on one origin, such as `https://app.example.com`, with `/api/*` routed to the API.

**The current application is not ready for a production deployment that can safely scale or replace containers.** Its Docker setup is useful for development and demonstrations, but several application changes are prerequisites. In particular, background threads can lose work, some files exist only on a container's filesystem, and the resume S3 adapter rejects IAM task credentials unless static keys are configured.

This document is a deployment design, implementation checklist, and operational runbook. It does not provision AWS resources or implement the prerequisite changes. Code/configuration examples marked **proposed** must be implemented, reviewed, and tested before the deployment commands are used. Existing and proposed capabilities are distinguished throughout.

### Assumptions

| Decision | Baseline used in this guide |
|---|---|
| Workload | One organisation's recruitment platform; moderate initial traffic, with AI processing bursts |
| AWS Region | `ap-south-1`, matching the repository's AWS default; confirm residency and latency requirements before provisioning |
| Environments | Separate staging and production AWS accounts; development remains local |
| Public hostname | `app.example.com`; replace with an owned domain |
| Origin hostname | `origin.example.com`, resolving to the ALB and restricted to CloudFront |
| Availability | At least two Availability Zones for API, database, cache, and outbound connectivity |
| Compute | Linux/x86_64 initially, matching a single tested image architecture |
| Infrastructure | Terraform with reviewed plans, encrypted remote state, and state locking |
| Delivery | CI builds immutable artifacts; staging validation precedes production promotion |
| Recovery targets | Proposed RPO ≤15 minutes for database state and RTO ≤2 hours; validate through a restore drill |
| Deployment scope | The whole repository, including resumes, search, assistant streaming, attachments, exports, email, and optional calls |

These are starting decisions, not measured capacity guarantees. This repository does not implement tenant isolation for an unrelated multi-customer SaaS service. AWS account isolation does not add application-level tenancy.

### Reading order

1. [Application inventory](#2-application-inventory-and-deployment-implications).
2. [Production blockers](#3-production-blockers-and-required-code-changes).
3. [Target architecture](#4-target-aws-architecture).
4. [Application preparation](#5-prepare-the-application).
5. [Infrastructure provisioning](#6-provision-aws-infrastructure-in-order).
6. [Production configuration](#7-production-configuration-reference).
7. [Build and release](#8-build-and-publish-artifacts), [first deployment](#9-first-deployment-and-database-initialisation), and [CI/CD](#10-cicd-and-subsequent-releases).
8. [Acceptance tests](#11-production-acceptance-tests), [monitoring](#12-monitoring-alerts-and-operational-ownership), [recovery](#13-backup-restore-and-disaster-recovery), and [rollback](#14-rollback-runbooks).

## 2. Application inventory and deployment implications

The implementation was reviewed through its settings, containers, routes, models, migrations, service layer, storage adapters, authentication, frontend API clients, tests, and existing architecture documentation. Source code takes precedence where README descriptions lag behind implementation.

| Area | Current implementation | Deployment consequence |
|---|---|---|
| Frontend | React 19.3, TypeScript, Vite 8.3, Tailwind, React Router; `npm run build` creates `frontend/dist/` | Static hosting is sufficient; no Node server is needed at runtime |
| API | Python 3.12, Django 5.2.17, DRF; Gunicorn binds `0.0.0.0:8200` | Containerise the API; run `config.settings.prod` |
| Existing web image | Nginx serves the SPA and proxies `/api/` to Compose service `api:8200` | Do not deploy this configuration unchanged to ECS; Compose DNS names do not create ECS service discovery |
| Database | PostgreSQL 16 in local Compose; Django migrations; UUID records | Use managed PostgreSQL and a separate migration task |
| Semantic search | pgvector `VectorField`, 768 dimensions in the initial migration, HNSW cosine index | RDS engine must support the `vector` extension; database sizing must include vectors and indexes |
| Authentication | Access JWT in browser memory; rotating refresh token in HttpOnly cookie, path `/api/v1/auth/`; token blacklist in PostgreSQL | Preserve cookies and Authorization through CloudFront; never cache authenticated responses |
| Roles | HR admin, HR, interviewer, employee, and support administrator permissions | Test role boundaries and candidate contact masking after deployment |
| Recruitment | Jobs, candidate sourcing/matching, applications, Kanban transitions, interviews, offers, onboarding, TAT and reports | Maintain database consistency and preserve historical activity during migration |
| Resume intake | PDFs saved to `RESUME_STORAGE_PATH/uploads/`; ingestion queue is in-process | Replace with durable object intake and durable jobs |
| Resume delivery | Custom boto3 S3 adapter issues presigned download links | Use IAM task roles after fixing the adapter; keep the bucket private |
| Candidate photos | JPEGs written to `RESUME_STORAGE_PATH/photos/`; API opens local files | Refactor photo reads/writes to object storage |
| Support files | Django `FileField` uses `FileSystemStorage`; files under `backend/media/` | Configure private object storage for default Django storage |
| Job-description upload | PDF/DOCX, 10 MiB; input bytes passed to a daemon thread | Persist source bytes before accepting work and move processing to a worker |
| Candidate searches | `sourcing/services.py` starts a daemon thread | Durable queued execution is required for safe deploys and retries |
| AI chat | Search chat and assistant use POST with `StreamingHttpResponse` / server-sent events (SSE) | Test incremental streaming, heartbeats, timeouts, cancellation, and concurrent connections |
| AI providers | OpenAI/Gemini calls; embeddings have their own provider/model settings | Private tasks need controlled internet egress; monitor vendor latency, spend, and data handling |
| Email | Django SMTP when `EMAIL_HOST` is set; otherwise console backend | Configure SES SMTP or another verified provider; avoid logging real candidate mail |
| Phone calls | Optional Vapi API and `/api/v1/calls/webhook/vapi/`; otherwise simulation | Public authenticated webhook, idempotency, durable processing, and vendor validation are required |
| Notifications/audit | Database-backed notifications, activity, and audit middleware | Retain business audit history separately from infrastructure logs |
| Cache | `CACHE_URL` defaults to local process memory | Use a shared cache before running multiple processes/tasks |
| Health | `/api/v1/health/` runs `SELECT 1`; returns 503 on DB failure | This is dependency readiness, not independent process liveness |
| Static files | WhiteNoise collects and serves Django assets | Keep `collectstatic` in the image build; use version-safe static delivery if exposing admin |
| Automation | Makefile and Compose; no production IaC, durable worker, or release pipeline found | These must be added; `make demo` is not a production deployment command |

The versions above are repository pins, not claims that these are the newest or vulnerability-free versions. Python direct dependencies are pinned, but transitive dependencies are not fully locked with hashes. `frontend/package-lock.json` exists; preserve `.npmrc` because `npm ci` uses its peer-dependency settings.

### Source locations to revisit during implementation

- [Production settings](../backend/config/settings/prod.py), [base settings](../backend/config/settings/base.py), and [API routes](../backend/config/api_router.py).
- [Backend Dockerfile](../backend/Dockerfile), [frontend Dockerfile](../frontend/Dockerfile), [Nginx configuration](../frontend/nginx.conf), and [Compose](../docker-compose.yml).
- [Resume intake](../backend/resumes/services/intake.py), [ingestion](../backend/resumes/services/ingestion.py), [storage](../backend/resumes/engines/storage.py), and [resume migrations](../backend/resumes/migrations/0001_initial.py).
- [Job upload processing](../backend/jobs/services.py), [candidate search](../backend/sourcing/services.py), and [provider registry](../backend/sourcing/registry.py).
- [Candidate photo delivery](../backend/candidates/views.py), [photo filesystem paths](../backend/resumes/engines/photo.py), and [support attachment delivery](../backend/support/views.py).
- [Auth views](../backend/accounts/views.py), [auth services](../backend/accounts/services.py), [throttles](../backend/common/throttles.py), and [audit request metadata](../backend/audit/dtos.py).
- [Voice adapter](../backend/pipeline/services/voice.py), [call handling](../backend/pipeline/services/calls.py), and [assistant](../backend/assistant/services/agent.py).
- [Browser API client](../frontend/src/lib/api.ts), [SSE client](../frontend/src/lib/sse.ts), and [auth store](../frontend/src/lib/auth-store.ts).

## 3. Production blockers and required code changes

**P0** means required before a production launch using the architecture in this guide. **P1** means required before broad use of the affected feature, or explicitly disable that feature server-side until implemented.

| Priority | Finding from this repository | Required outcome |
|---|---|---|
| P0 | Resume, search, and JD processing use daemon threads inside API processes | Durable jobs, dedicated workers, retries, leases, cancellation, and restart recovery |
| P0 | Resume batch status inspects a process-local queue | Store job ownership, progress, heartbeat, and state centrally; polling must work through any API task |
| P0 | Resume PDFs and candidate photos depend on local paths; support files use local Django storage | Persist accepted files in S3; all tasks must see the same objects |
| P0 | `StorageConfig.missing` requires `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`; boto3 receives them explicitly | Use boto3's default credential chain and ECS task roles; no long-lived AWS keys |
| P0 | `CACHE_URL` falls back to local memory; Redis client is not explicitly declared in runtime requirements | Add/pin the required client and configure TLS/authenticated shared cache |
| P0 | Secure refresh cookies, HTTPS redirect, and HSTS are not enabled by default | Apply production settings and verify actual HTTPS/cookie behaviour |
| P0 | Health checks encounter ALB IP Host headers and HTTP redirect behaviour | Implement dedicated liveness/readiness paths before security redirect/Host validation, as described below |
| P0 | Three synchronous Gunicorn workers are the image default | Size a tested threaded/async serving model; prevent a handful of streams from exhausting API capacity |
| P0 | Model calls can wait 120 seconds per attempt and chain fallbacks; proxy defaults are shorter | Bound interactive calls, add actual SSE heartbeats, and move long work to jobs |
| P0 | Audit IP uses the first forwarded IP; DRF throttle identity is not configured for the AWS proxy chain | Canonicalise client identity from a trusted edge header; test spoof attempts |
| P0 | Refresh/logout endpoints accept ambient cookies; there is no explicit CSRF/origin enforcement in these DRF views | Add and test CSRF protection for cookie-authenticated operations; CORS and SameSite alone are not the complete control |
| P0 | No reproducible production infrastructure or deployment/rollback pipeline | Implement and review IaC and release automation, with isolated migration permissions |
| P0 | Demo seeding creates public, shared-password accounts; configured external sources include mocks | Never seed production; use real accounts and `CANDIDATE_SOURCE_PROVIDERS=internal` until adapters exist |
| P0 when importing data | Existing `source_path` values point to local machines and S3 may still be pending | Migrate files and references, verify every required object, then switch application traffic |
| P1 | Photo and support URLs use non-expiring HMAC signatures and allow requests without session auth | Replace with expiring/revocable links issued after object-level authorisation |
| P1 | `VapiProvider.verify()` accepts requests when its secret is empty | Fail closed when calls are enabled; authenticate, deduplicate, persist and queue webhook events |
| P1 | Forgot-password only records a request; it does not deliver or consume a reset link | Implement a complete reset workflow, or provide a controlled staff recovery process and accurate UI |
| P1 | Bulk email and call placement can execute synchronously | Use durable delivery jobs and duplicate-prevention records; cap request fan-out |
| P1 | Upload limits are per file; Nginx accepts only 25 MiB for the complete request | Adopt direct S3 uploads or enforce consistent total request limits, size validation, and scanning |
| P1 | Audit records can contain business PII even though password/token keys are redacted | Minimise sensitive fields, define retention/access rules, and protect operational logs |
| P1 | No comprehensive provider budgets or global AI concurrency limits | Bound concurrency/retries and add per-user/organisation quotas and spend alerts |

These are deployment-focused findings, not a claim of a complete penetration test. Baseline automated validation is recorded in section 17.

## 4. Target AWS architecture

```text
Staff browser / approved voice webhook sender
                  |
             Route 53 + ACM
                  |
          CloudFront + AWS WAF
             /             \
       SPA/assets         /api/* (never cached)
           |                     |
   Private S3 frontend     HTTPS Application Load Balancer
     (OAC access)          (restricted CloudFront origin)
                                 |
                     ECS Fargate API service
                     private subnets, >= 2 tasks
                          /      |       \
                         /       |        \
                 RDS PostgreSQL  |      Shared cache
                  + pgvector     |      ElastiCache
                    Multi-AZ     |
                         Private S3 documents/media
                                 |
                 DB job/outbox -> SQS queues + DLQs
                                      |
                           ECS Fargate workers
                            private subnets
                                      |
                         OpenAI / Gemini / SES / Vapi
                         through controlled egress

Secrets Manager + KMS + IAM roles -> API / workers / migration task
CloudWatch + CloudTrail + backups -> logs, alerts, recovery evidence
CI with OIDC -> ECR image digest + release archive -> staged deployment
```

The API and worker may use the same image, with different entry commands, task roles, database roles, scaling rules, and resource allocations. A migration task uses the same release image but its own credentials and no HTTP health check.

### Initial service sizing — validate by load testing

| Component | Starting configuration | Scaling constraint |
|---|---|---|
| API | 2 tasks, each 1 vCPU / 2 GiB; spread across AZs | Scale on latency/concurrency plus CPU/memory; maintain room for a rolling deployment |
| Workers | 2 tasks, each 2 vCPU / 4 GiB; low per-task job concurrency | Scale from oldest message age/backlog and vendor quota; cap globally |
| RDS | PostgreSQL 16, supported current minor, Multi-AZ DB instance; start with a general-purpose 2-vCPU/8-GiB class and gp3 storage | Measure vector queries, index memory, connections, IOPS and ingestion throughput |
| Cache | Valkey or Redis OSS-compatible replication group, primary + replica, Multi-AZ automatic failover, cluster mode disabled initially | Use a TLS endpoint and supported authentication; test failover |
| S3 | Separate frontend, private media, and release-artifact buckets | Lifecycle/retention differs for each |
| SQS | Separate ingestion, search/JD, and outbound integration queues with DLQs | Fairness and cost caps matter more than unrestricted concurrency |

RDS Multi-AZ is an availability mechanism, not a replacement for backups or a read-scaling solution for the ordinary Multi-AZ DB instance deployment. A separate standby should not be counted as application read capacity.

### Why this deployment shape fits

- The frontend is a static SPA, so S3/CloudFront avoids running an extra web server fleet.
- The backend contains PostgreSQL-specific migrations and vector queries, so RDS PostgreSQL fits the existing data model.
- Containers support the current Python libraries, PDF/OpenCV processing, management commands, and SSE without introducing Kubernetes operations.
- Separate API/worker services prevent document processing from taking all interactive capacity.
- One browser origin preserves the current relative API/media URLs and refresh-cookie behaviour.

EKS is an option if your organisation already operates it; it is not necessary for this repository. Lambda would require a larger redesign of long processing, native dependencies, and streaming. A single EC2/Compose deployment is suitable for a controlled pilot, but it does not provide the availability and deployment safety specified here.

**Temporary filesystem compatibility:** EFS access points mounted consistently at the resume directory and `/app/media` can preserve existing paths while storage is refactored. EFS does not fix thread loss, process-local queue status, job retries, or JD bytes held only in memory. Treat it as a migration bridge with backups and encrypted mounts, not as a substitute for the P0 work.

## 5. Prepare the application

### 5.1 Make background work durable

Implement a worker command, for example `python manage.py run_worker --queue ingestion`. **That command does not exist today.** SQS alone does not cause the current application to consume jobs; add the producer, consumer, data model, and supervision. A mature queue framework is also acceptable, but its broker semantics and AWS permissions must be tested and its dependencies explicitly added.

Required processing contract:

1. Authorise the request and reserve a database job/document/upload record with a unique ID.
2. Persist input bytes in S3 before returning that the upload is accepted. Save the object key, version/checksum, size, owner, and processing configuration.
3. Commit the job and an outbox row in the same DB transaction. A durable dispatcher sends outbox rows to SQS and retries failures. `transaction.on_commit()` alone does not guarantee delivery if the process dies between commit and publish.
4. Send only identifiers and a message schema version to SQS. Do not place PDFs, transcripts, access tokens, or complete candidate profiles in messages.
5. A worker atomically claims a job with a lease. Commit the claim before making network/LLM calls; do not hold long database transactions open around vendor requests.
6. Fetch S3 input to a bounded temporary directory when a library requires a local pathname. Persist output objects and business results durably.
7. Update shared progress/heartbeat data. API polling reads this data, so any API task produces the same status.
8. Acknowledge/delete the message only after committing the durable result. Retry with backoff/jitter; route exhausted failures to a DLQ and expose a controlled retry action.
9. Check cancellation before expensive calls and before committing results. A cancelled JD upload must not later reappear as ready.
10. Reconcile stale leases and unsent outbox rows. Prevent a retry from creating duplicate candidates, sending duplicate mail, placing another call, or scheduling another interview.

Use separate job identities for document ingestion, JD extraction, and search runs. Preserve current hashes, `upload_batch`, job/upload IDs, status API shapes, and the user who initiated the action. Include provider/model/schema version in the idempotency key when reprocessing is intentional. Retain input objects for at least the full supported retry/DLQ recovery period; an expired JD input must not make a valid queued job impossible to recover.

Initial SQS settings: 20-second long polling; a visibility timeout above the measured job duration; extend visibility while a job is active; a bounded retry count such as 5; DLQ retention such as 14 days; alarm on any DLQ message. Set source retention and retry timing deliberately. Duplicate deliveries remain possible, so database idempotency is required. These behaviours are described in [SQS visibility timeout guidance](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html).

Do not use `SEARCH_RUN_ASYNC=false` or `RESUME_INGEST_ASYNC=false` as a production reliability fix: those settings move work into the HTTP request. Setting them to `true` today still means threads, not SQS.

### 5.2 Use IAM task credentials for resume storage

Change [the S3 adapter](../backend/resumes/engines/storage.py):

- `StorageConfig.missing` should require the bucket, not static AWS keys.
- Use boto3's credential provider chain so ECS obtains temporary credentials from the task role.
- Do not pass empty access/secret strings. Do not introduce static IAM user credentials as a workaround.
- Preserve the optional endpoint only for isolated development; leave it unset on AWS.
- Verify permission failures explicitly; successfully constructing a presigned URL does not prove the target object can be downloaded.

Proposed client construction inside `_require_client()`:

```python
self._client = boto3.client(
    "s3",
    region_name=self.config.region or None,
    endpoint_url=self.config.endpoint_url or None,
    config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
)
```

Also update configuration messages/tests that currently tell operators to supply keys. The key fields can be removed from the adapter; the SDK can still use a developer's authenticated profile outside production. ECS application access belongs on the **task role**, while image pulls and startup secret injection belong on the **execution role**. See [ECS task IAM roles](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html).

### 5.3 Move every persistent file to object storage

| File category | Current dependency | Required change |
|---|---|---|
| Original resumes | `ResumeDocument.source_path`, local ingestion, later S3 copy | S3 input must be durable before enqueue; retain an object reference usable for retries/re-indexing |
| Candidate photos | `photo_path()`, local writes in ingestion, local `open()` in the API | Store JPEGs in private S3 and return short-lived authorised download URLs |
| Support attachments | Default `FileSystemStorage` and `attachment.file.open()` | Add a pinned S3 Django storage implementation and configure `STORAGES['default']` |
| JD uploads | File bytes exist only in the receiving web process | Persist input object and store its key on the upload/job record |
| Generated exports | Django report generation and responses | Small bounded exports may remain synchronous; queue large exports and store expiring private results |

Changing Django `STORAGES` alone does **not** move resume paths or candidate photos: they use custom filesystem access. WhiteNoise should continue to serve collected static assets; it should not serve uploaded PII.

Suggested private prefixes: `incoming/`, `resumes/`, `photos/`, `support/`, `job-inputs/`, and `exports/`. Use opaque IDs instead of candidate names or email addresses in keys. Add malware/content validation and a quarantine state before processing. Verify file content, not only filename or browser-supplied MIME type.

For large uploads, implement a presigned S3 POST flow with a size policy, exact object key, ownership check, and completion endpoint. Validate the final object, checksum, and scan status before enqueueing. Configure bucket CORS only for the exact application origin if the browser uploads directly. This flow is **new application work**, not an existing endpoint.

Until that work is done, set a tested total multipart request cap in the application/proxy and a lower batch count. Today resumes allow 200 ×20 MiB, support allows 5 ×25 MiB, and the Compose Nginx limit is just 25 MiB for the whole request. Increasing that limit to accept multi-gigabyte requests is not the recommended solution.

### 5.4 Shared cache and trusted client identity

Add an explicitly pinned `redis` client dependency if using Django's built-in Redis backend. Configure a TLS URL, for example `rediss://<user>:<encoded-password>@<primary-endpoint>:6379/0`, in Secrets Manager. Test authentication and certificate verification using the exact client version; do not disable TLS certificate verification. Set connection/read timeouts and environment-specific key prefixes in the cache configuration. A cache connection failure needs a documented login/throttle failure policy, not an unlimited fallback to local memory.

Use cluster mode disabled initially unless you add and test a cluster-aware backend. Use the primary endpoint for rate-limit consistency; an asynchronously replicated read endpoint can return stale counters. Validate failover using [ElastiCache TLS guidance](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/in-transit-encryption.html).

DRF cache throttles are best-effort and are not a precise security quota. Supplement them with WAF rate limits and server-side per-user limits on expensive actions.

At CloudFront, overwrite a custom request header such as `X-Talent-Client-IP` using `event.viewer.ip` in a viewer-request function on the API behaviour. In application middleware, accept this value only on the protected CloudFront → ALB → task path, validate it, and use it consistently for audit and throttling. Configure DRF/custom throttles accordingly. Also handle direct internal operational requests explicitly. Test that supplying this header or fake `X-Forwarded-For` from the internet cannot choose another identity.

### 5.5 Health endpoints and HTTPS handling

Add separate endpoints:

- `/health/live`: process can answer; no database, cache, or provider access.
- `/health/ready`: bounded DB query and essential dependency checks; 200 or 503 with no sensitive details.

Place an exact-path health middleware before `SecurityMiddleware` that answers these two paths without calling `request.get_host()` and without redirecting HTTP to HTTPS. Limit this exception to GET/HEAD on those exact paths. Do not bypass normal Host validation or authentication on other URLs. Protect access through security groups and ALB listener routing; the public listener need not forward `/health/*` at all. The ALB probes the target directly, independently of listener routes.

This avoids two predictable failures: the ALB sends the target's private IP in the health-check Host header, and backend probes use HTTP while public traffic uses HTTPS. Do not solve this with `DJANGO_ALLOWED_HOSTS=*`, a broad security bypass, or accepting 301 as healthy. See [ALB health-check troubleshooting](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-troubleshooting.html).

Use liveness for the ECS container health check and readiness for the target group. The existing `/api/v1/health/` remains useful as an external DB/API check. Avoid using third-party AI availability as readiness: a provider outage should degrade AI features rather than remove every API target. Note that ECS may replace targets that remain unhealthy; use appropriate grace periods and retries to avoid restart storms during a short DB failover.

### 5.6 Secure authentication and private links

- Set `JWT_COOKIE_SECURE=true`, `JWT_COOKIE_SAMESITE=Lax`, and HTTPS-only access. Retain HttpOnly and the existing auth cookie path.
- Add explicit CSRF validation for browser cookie refresh/logout and protect login against login CSRF. Standard Django middleware does not automatically enforce CSRF on all DRF JWT views. Preserve separately authenticated non-browser use deliberately.
- Keep a strict same-origin policy, exact CORS origins if required, and tests for hostile origins, missing CSRF tokens, sibling subdomains, and expired refresh cookies.
- `CSRF_TRUSTED_ORIGINS` is not currently read from the environment. If configuring it by environment, add that setting explicitly; it allows trusted origins and does not enable CSRF checks by itself.
- Expire and, where needed, revoke photo/support URLs. An HMAC without an expiry remains a bearer capability as long as the signing key remains valid. Set private/no-store caching for particularly sensitive files and never cache them at CloudFront.
- Verify that permission to view a masked candidate record does not unintentionally grant access to the original resume, which may reveal email/phone. Apply the intended role policy to download-link issuance too.
- Restrict Django admin and API documentation. Prefer a separate protected operational route/domain or VPN access. The default public deployment below does not expose `/admin/`, `/api/docs/`, or `/api/schema/`.
- Use organisational SSO/MFA if required for staff access. That is additional application integration; attaching Cognito/ALB authentication does not transparently replace the current JWT/session flow and would also affect webhooks.

### 5.7 Timeouts, streams, and Gunicorn capacity

The current image starts three synchronous Gunicorn workers with a 300-second timeout. SSE connections occupy workers, and a chain of 120-second model attempts can exceed several proxy timeouts.

For an initial WSGI deployment, load-test `gthread`, for example two workers × four threads per API task, while processing jobs separately. Set `--worker-tmp-dir /tmp`, use a writable temporary volume, and cap concurrency. Do not preload shared provider clients without verifying thread/process safety. Switching to ASGI is an alternative that requires adapting and testing streaming generators and blocking ORM/vendor work.

Proposed starting timeout budget:

| Boundary | Proposed starting value/behaviour |
|---|---|
| Ordinary CRUD | Target p95 below 500 ms under the agreed load |
| Synchronous AI endpoints | Whole-request deadline around 45 seconds; return a controlled error or a job ID when exceeded |
| Provider call | Configure around 20 seconds initially for interactive calls; apply one total deadline across retries/fallbacks |
| CloudFront API origin read timeout | 60 seconds; verify available account limits before changing |
| ALB idle timeout | 120 seconds |
| SSE | Immediate first frame; heartbeat every 10–15 seconds, including while awaiting a tool/provider |
| SSE total duration | Bound each turn, for example 90 seconds, or implement durable reconnect/resume semantics |
| Gunicorn | Timeout 120 seconds, graceful timeout 100 seconds as a starting point; also enforce application deadlines |
| Target deregistration / container stop | Start with 120 seconds each, then test the actual deployment/draining sequence |

The global `LLM_TIMEOUT_SECONDS` currently also affects non-interactive parsing. Introduce separate worker and interactive budgets if longer PDF parsing is needed; simply reducing the global value may lower ingestion success. A threaded Gunicorn timeout is not a per-request deadline.

Heartbeats must be emitted while blocking work is underway; adding a yield before a blocking call is insufficient. Preserve `Content-Type: text/event-stream` and disable proxy buffering if an Nginx hop is retained. Use `Cache-Control: no-store` for authenticated streams. Test first-token latency and cancellation through the real CloudFront endpoint with browser tools or `curl -N`.

CloudFront's read timeout measures inactivity between response packets; its response completion timeout can cap the entire response. Configure both deliberately. A 300-second Gunicorn setting does not override either CloudFront or ALB. See [CloudFront origin timeout settings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html).

### 5.8 Harden the image and configuration

- Keep Python 3.12 and Node 24 initially; update patch releases through tested rebuilds. Pin base-image digests for reproducibility and refresh them regularly.
- Keep the API non-root; give the application a fixed UID/GID, for example `10001:10001`, when defining writable mounts.
- Build a locked, hash-verified Python dependency set, including transitive libraries. Generate an SBOM and scan OS/Python/npm dependencies and the final image.
- Build only from the intended `backend/` context. Exclude secrets, local PDFs, exports, and caches from all build contexts and artifacts.
- Include `resumes/engines/yunet.onnx` and test PyMuPDF/OpenCV imports in the final image. Do not assume native wheels work on a different architecture.
- Keep `collectstatic` at build time. Its placeholder signing key is a build-only value, never the runtime secret.
- Reject missing/placeholder production secrets, wildcard hosts, and incomplete enabled integration configuration at runtime. Separate build-time validation from runtime validation so `collectstatic` does not require production secrets or a database.
- Use a read-only root filesystem after storage changes; mount a writable `/tmp` and verify its ownership. Fargate bind-volume permissions need to be configured/tested for the fixed non-root user. An image-owned `VOLUME /tmp` directory is one supported pattern; do not assume a root-owned empty mount will be writable. See [ECS bind-mount ownership](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/bind-mounts.html).
- Cap scratch disk use and delete per-job temporary data. Fargate scratch storage is not a backup.
- Generate structured JSON logs with request ID, job ID, release SHA, duration, and error category, excluding tokens, candidate text, and signed query strings.

Follow the [Django deployment checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/) and [Fargate security guidance](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-fargate.html) while implementing these changes.

## 6. Provision AWS infrastructure in order

### 6.1 Accounts, access, and infrastructure as code

1. Establish separate staging/production accounts and IAM Identity Center access for engineers. Require MFA and keep root credentials out of application operations.
2. Enable account audit logging, budget alerts, and named ownership/escalation contacts.
3. Tag resources with `Application=talentos`, environment, owner, cost centre, and data classification.
4. Create an encrypted, versioned, private Terraform state bucket with tightly limited access; state/plans can contain secrets. Enable S3 state locking with `use_lockfile=true` on a supported pinned Terraform version. Bootstrap this backend separately and retain its recovery instructions.
5. Commit provider/version locks, modules, environment configuration, and policy tests. Store secret **ARNs**, not secret values, in normal configuration. Provision secret containers through IaC and populate values through an audited secret workflow.
6. Run formatting, validation, policy/security checks, and a reviewed plan. Apply the reviewed plan artifact to its intended environment. Restrict destructive changes and enable deletion protection for data resources.
7. Check service quotas before launch: Fargate On-Demand vCPU capacity for maximum tasks plus deployment overlap, subnet IPs/ENIs, NAT/EIP capacity, security-group rule capacity for the CloudFront managed prefix list, RDS/cache availability, CloudFront timeouts, and provider/SES request or sending quotas. Request increases before the rollout rather than discovering limits during scaling.

Proposed repository structure — these files do not exist yet:

```text
infra/
  bootstrap/                 # state bucket, CI identity, state permissions
  modules/
    network/
    database/
    cache/
    storage/
    queues/
    services/
    edge/
    observability/
  environments/
    staging/
    production/
deploy/
  api-task.template.json
  worker-task.template.json
  migration-task.template.json
  smoke-test.sh
.github/workflows/            # if using GitHub Actions
```

Native S3 locking and its required permissions are documented in [Terraform's S3 backend reference](https://developer.hashicorp.com/terraform/language/backend/s3). Do not copy an old DynamoDB-locking tutorial without checking the Terraform version and current guidance.

### 6.2 Network

Create a VPC with DNS support/hostnames and non-overlapping address space. Example layout across two AZs:

| Subnet tier | AZ A | AZ B | Routing |
|---|---|---|---|
| Public | `10.40.0.0/24` | `10.40.1.0/24` | Internet gateway; ALB and NAT gateways |
| Private application | `10.40.10.0/24` | `10.40.11.0/24` | Same-AZ NAT for vendor APIs; VPC endpoints for AWS traffic |
| Isolated data | `10.40.20.0/24` | `10.40.21.0/24` | Local/VPC routes only; RDS/cache |

The CIDRs are examples; coordinate with VPN/peering and existing AWS networks. Use one NAT gateway per active AZ for the baseline. A single NAT gateway reduces cost but introduces a cross-AZ dependency and potential transfer costs.

Add an S3 gateway endpoint; consider interface endpoints for ECR API/Docker, CloudWatch Logs, Secrets Manager, SQS, and the services actually used. Restrict their security groups and endpoint policies. Endpoints do not provide internet access to OpenAI/Gemini/Vapi. Security groups do not filter HTTPS destinations by domain; use an egress proxy/firewall if domain allowlisting is a requirement.

| Security group | Allowed inbound |
|---|---|
| ALB | TCP 443 from the AWS-managed CloudFront origin-facing prefix list for the chosen public-origin design |
| API tasks | TCP 8200 only from the ALB security group |
| Worker tasks | No inbound application port |
| Migration/ops tasks | No inbound application port; controlled task/SSM access if needed |
| RDS | TCP 5432 only from approved API, worker, migration, and operational security groups |
| Cache | TCP 6379 only from API/worker security groups that need it |
| Interface endpoints | TCP 443 only from permitted task security groups |

Set `assignPublicIp=DISABLED` on API, worker, and migration tasks. Do not expose PostgreSQL or cache publicly. Allow the required return/ephemeral traffic if using restrictive network ACLs.

### 6.3 KMS, secrets, and IAM roles

Create encryption keys and policies for the required RDS, media, secret, and logging resources. Keep key administrators distinct from normal application principals. Prevent accidental key deletion from making backups unusable.

| Role | Required access | Must not receive |
|---|---|---|
| CI build | Push to the application ECR repository; write immutable release artifacts | Production database credentials |
| CI deploy | Register approved task definitions; update named services; run migration tasks; publish frontend; invalidate named distribution | Unrestricted `iam:PassRole` or arbitrary production secret reads |
| Task execution | Pull ECR image; write its log stream; read exact startup secret ARNs and decrypt applicable secret keys | Application-wide S3/SQS privileges by default |
| API task | Required media prefixes; send required queue messages; approved runtime AWS APIs | ECR push, infrastructure administration, broad IAM or database DDL |
| Worker task | Read/write its object prefixes; receive/delete/change visibility for its queues; required integrations | Unrelated application buckets or all queues |
| Migration execution/task | Only needed startup secrets/logs; migration DB credential has schema privileges | General production administrator privileges |
| Backup/restore operator | Managed backup/restore resources and scoped decryption | Routine use as application identity |

Use separate execution roles or equivalent exact secret policies for migration and web services, so an ordinary API deployment cannot substitute the migration DB secret. Restrict `iam:PassRole` to these named roles and `iam:PassedToService=ecs-tasks.amazonaws.com`; restrict who can register or run tasks with elevated migration roles.

For S3 media, grant only needed object actions on exact prefixes: `GetObject`, `PutObject`, and multipart actions if used. Grant `ListBucket` only with prefix conditions where needed. Put deletion in a dedicated retention workflow if the normal application does not need it. Add `kms:Decrypt`/`GenerateDataKey` as required by SSE-KMS, constrained to the intended keys/services. Give an SQS consumer only its queue actions, plus encryption permissions if a customer-managed SQS key requires them.

Suggested secret names:

```text
/talentos/production/django-secret-key
/talentos/production/database-app-url
/talentos/production/database-migration-url
/talentos/production/cache-url
/talentos/production/openai-api-key
/talentos/production/gemini-api-key
/talentos/production/smtp-user
/talentos/production/smtp-password
/talentos/production/vapi-api-key
/talentos/production/vapi-webhook-secret
```

Secrets injected as ECS environment values are read when a task starts. Rotation requires a controlled replacement of existing tasks; updating Secrets Manager does not update their environment in place. Coordinate database credential rotation with active connections and rollback. See [ECS secret injection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html).

The Django key signs JWTs and current media signatures. Changing it can invalidate sessions and links. Django `SECRET_KEY_FALLBACKS` alone does not make SimpleJWT's HS256 signing key support a rotation key ring; plan explicit forced reauthentication or implement token-key rotation deliberately.

### 6.4 RDS PostgreSQL and pgvector

Provision RDS PostgreSQL 16 on a tested supported minor version with:

- Multi-AZ enabled; DB subnet group using isolated subnets; public access disabled.
- Storage encryption, deletion protection, a final-snapshot policy, and 35-day automated backup retention as the initial baseline.
- gp3 storage with a monitored autoscaling ceiling; do not allow unbounded storage growth.
- A managed master credential for bootstrap operations; separate migrator and runtime users.
- A parameter group enforcing TLS (`rds.force_ssl=1`), tested connection/time limits, and useful database performance telemetry. Keep SQL parameter logging from exposing candidate data.
- Separate backup and maintenance windows outside normal recruitment activity, with patch testing in staging.

Verify extension availability before application migration:

```sql
SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE name = 'vector';
```

Using an authorised bootstrap connection, create the database/roles and preinstall the extension. Illustrative `psql` session:

```sql
CREATE ROLE talentos_migrator LOGIN;
CREATE ROLE talentos_app LOGIN;
\password talentos_migrator
\password talentos_app
CREATE DATABASE talentos OWNER talentos_migrator;
\connect talentos
CREATE EXTENSION IF NOT EXISTS vector;
REVOKE CONNECT ON DATABASE talentos FROM PUBLIC;
GRANT CONNECT ON DATABASE talentos TO talentos_migrator, talentos_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO talentos_migrator;
GRANT USAGE ON SCHEMA public TO talentos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE talentos_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO talentos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE talentos_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO talentos_app;
```

Use a protected operational connection or automation with redacted secret handling. Do not paste real passwords into SQL checked into Git. Run application migrations as `talentos_migrator`, not the RDS master and not `talentos_app`. If tables already exist, also grant the runtime user the required access on existing tables/sequences; default privileges affect only future objects created by the specified owner.

The initial resume migration executes `VectorExtension()`. Preinstalling it avoids granting privileged extension-management rights to the normal application role. Confirm supported extension versions and required privileges in [RDS PostgreSQL extension documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.Extensions.html).

Bake the current AWS RDS CA bundle into the image, validate its provenance during the build, and plan CA rotation. Use the actual RDS hostname and a connection URL such as:

```text
postgresql://talentos_app:<URL-ENCODED-PASSWORD>@<RDS-ENDPOINT>:5432/talentos?sslmode=verify-full&sslrootcert=/app/certs/rds-global-bundle.pem&connect_timeout=5
```

`sslmode=verify-full` validates the server certificate and hostname; `require` alone does not provide the same identity check. See [RDS PostgreSQL TLS configuration](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html).

Budget connections across **maximum**, not minimum, task counts: `API tasks × worker processes × threads`, plus worker connections, migrations, probes, and operational headroom. Rolling deployment overlap can approximately double the service's task count. Monitor before adding RDS Proxy; introduce it only after compatibility/transaction behaviour is tested. Do not use a static IAM DB token in `DATABASE_URL` if adopting IAM DB authentication; tokens expire and require connection-time refresh logic.

Keep `EMBEDDING_DIMENSIONS=768` unless making a schema/index migration. Changing embedding provider/model requires a controlled re-index into a consistent vector space even when the dimensions are equal. Prefer a staged versioned index/corpus and switch after verification; avoid serving a partially mixed embedding library.

### 6.5 S3 buckets and lifecycle

Create distinct buckets, with globally unique names:

| Bucket | Access and encryption | Retention |
|---|---|---|
| `talentos-prod-web-<account>-<region>` | Private; Block Public Access; Object Ownership enforced; CloudFront OAC; SSE-S3 or an explicitly configured KMS key | Versioning; retain assets needed for supported rollback releases |
| `talentos-prod-media-<account>-<region>` | Private; Block Public Access; SSE-KMS; only application/retention roles | Versioning and approved PII retention, including noncurrent versions |
| `talentos-prod-artifacts-<account>-<region>` | Private; encrypted; CI/restore roles only | Immutable release archives, manifests, SBOMs, and rollback history |
| Log/archive bucket(s) | Service-specific delivery policies and supported encryption | Defined security/audit retention and restricted retrieval |

Add a deny for non-TLS object access, block public ACLs/policies, and monitor public-access findings. The web bucket uses the **S3 REST endpoint**, not S3 website hosting. Configure OAC to always sign requests and scope its read policy to the exact CloudFront distribution ARN. See [CloudFront origin access control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

For media, do not apply a blanket `aws:SourceVpce` deny without evaluating browser downloads: presigned links are fetched from the user's browser, outside your VPC, and would be blocked. Keep access private through signatures/IAM, or deliberately implement an authenticated proxy/CloudFront private delivery path.

Set lifecycle rules for incomplete multipart uploads, temporary exports, quarantined objects, and approved noncurrent-version expiration. Do not expire active original resumes needed for reprocessing. A delete marker does not erase old versions: apply the organisation's retention/deletion policy to versions, database extracts, backups, and vendor copies as well.

### 6.6 SQS and shared cache

Provision queues/DLQs and the cache configuration described in sections 5.1 and 5.4. Enable encryption and scoped policies; keep cache network access private. Establish queue age/DLQ/cache failover alarms before enabling production producers. Test worker termination and message redelivery in staging.

Choose queue and cache resources independently. The cache is disposable acceleration/throttle state; job state must survive cache loss. SQS is not a long-term business audit log; durable job/outbox records remain in PostgreSQL.

### 6.7 ECR and ECS services

Create an ECR repository with immutable release tags, image scanning, encryption, and a lifecycle policy that preserves running and rollback digests. Deploy by `repository@sha256:...`, not by `latest`.

Create an ECS cluster and:

- API service: at least two On-Demand Fargate tasks, `awsvpc`, private app subnets, API security group, ALB IP target group on port 8200.
- Worker services: no load balancer; separate task definitions/roles; consume only their queues. Use On-Demand for baseline capacity. Add Spot only after retries/idempotency/interruption handling are proven.
- One-off migration task definition: same image digest, migration DB secret, no web health check or load balancer.
- Log groups with explicit retention, encryption/access controls, and alarms.
- Rolling deployments with minimum healthy percentage 100 and maximum 200; ensure quota/IP/DB capacity for temporary overlap.
- Deployment circuit breaker with rollback and alarms for unhealthy targets and regressions. A first deployment has no previous completed revision to roll back to.
- Health-check grace period such as 90 seconds; target readiness path `/health/ready`, success code exactly 200, interval 15 seconds, timeout 5 seconds, and initially 2 healthy / 3 unhealthy thresholds.
- Container health check on `/health/live`, 30-second interval, 5-second timeout, 3 retries, and a startup grace period.

Starting health and scaling values are to be validated under actual load and RDS failover. See [ECS deployment circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html) and [ECS service scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html).

### 6.8 DNS, TLS, ALB, and CloudFront

1. Validate the domain in Route 53 or the existing DNS provider.
2. Request a CloudFront viewer ACM certificate in **`us-east-1`** for `app.example.com`, following [CloudFront certificate requirements](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html).
3. Request an ALB certificate in **`ap-south-1`** covering `origin.example.com` and `app.example.com`, because the recommended API policy forwards the viewer Host header.
4. Create `origin.example.com` as an alias to the internet-facing ALB. The ALB remains restricted by its CloudFront prefix-list security group and an origin header.
5. Configure the CloudFront API origin as `origin.example.com`, HTTPS only. Do not point the API origin back to `app.example.com`, which would create a routing loop.
6. Add a high-entropy custom origin header, e.g. `X-Origin-Verify`, to the CloudFront API origin. Restrict read access to distribution/listener configuration and rotate it through a coordinated change.
7. Create ALB listener rules that forward only the correct header + allowed Host + permitted API paths; default action is fixed 403. Put explicit denies for `/api/docs*` and `/api/schema*` ahead of the `/api/*` forward rule. Keep `/admin*` and `/health/*` out of the public forwarding rules.
8. Use HTTPS-only viewer policy for API requests; frontend GET traffic can redirect HTTP to HTTPS. Keep ALB origin traffic HTTPS. Apply a current TLS 1.2-or-newer policy supported by your clients.
9. Create CloudFront behaviours as below, then point `app.example.com` to the distribution only after validation.

The secret header distinguishes your distribution from other CloudFront customers; a CloudFront prefix list alone does not. A private CloudFront VPC origin is a possible alternative after checking current feature/Region support and streaming compatibility. The public ALB with restricted ingress is the baseline specified here. See [restricting CloudFront access to an ALB](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancer.html).

| Path / order | Origin | Methods | Cache / forwarding |
|---|---|---|---|
| `/api` and `/api/*` (separate exact/prefix behaviours) | ALB | All API methods including OPTIONS/POST/PATCH/DELETE | Managed `CachingDisabled`; forward all viewer headers, cookies, and query strings with `AllViewer` or an equivalent reviewed policy |
| `/assets/*` | Web S3 | GET, HEAD | Long TTL for content-hashed files; no viewer auth/cookies |
| `/brand/*` and other public files | Web S3 | GET, HEAD | Shorter TTL unless filenames are versioned |
| Default `*` | Web S3 | GET, HEAD | Minimum TTL 0; HTML must revalidate; viewer-request SPA rewrite |

Explicitly verify `Authorization`, `Cookie`, `Set-Cookie`, `Content-Type`, `Origin`, CSRF headers, `X-Vapi-Secret`, signed query parameters, filters, and pagination. A zero-TTL cache policy alone does not automatically forward Authorization. Keep API error responses uncached too; set applicable error caching minimum TTLs to 0 and do not configure a global API error-to-HTML replacement.

Do not use distribution-wide `403/404 → /index.html → 200`: that can turn API failures into successful HTML. Instead attach a SPA rewrite function only to the default S3 behaviour. A proposed function:

```javascript
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var reserved = /^\/(api|admin|static|media|health|assets|brand)(\/|$)/;
  if ((request.method === 'GET' || request.method === 'HEAD') &&
      !reserved.test(uri) && uri.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
```

This supports paths such as `/jobs/<uuid>` while leaving missing assets and reserved server paths as errors. The CloudFront API behaviour's client-IP function is a separate association. Test missing JS files, unknown UI routes, and API 401/403/404 responses independently.

If Django admin is later enabled, explicitly add its restricted ALB/CloudFront routing, CSRF configuration, and static asset strategy; do not let the SPA rewrite swallow it. WhiteNoise assets must remain compatible with rolling releases, or publish versioned backend static files separately.

### 6.9 WAF and browser security headers

Attach a CloudFront-scope Web ACL managed in `us-east-1`. Begin managed rules in count mode against staging traffic, then enforce validated rules. Add rate-based controls for login/password reset, upload initiation, expensive AI actions, and webhook abuse. Do not rely on IP rate limits alone for staff behind a shared corporate NAT.

Large multipart uploads and DOCX/PDF bodies can trigger managed body-size rules. WAF inspects only a limited portion of bodies; an upload accepted by WAF has not been malware-scanned. Define narrow upload-specific exceptions and oversize handling, preserving other rules. Prefer the direct-S3 upload flow rather than broadly disabling body inspection. See [AWS WAF oversize request handling](https://docs.aws.amazon.com/waf/latest/developerguide/waf-oversize-request-components.html).

Set frontend response headers at CloudFront and API headers consistently: HSTS after staged validation, `X-Content-Type-Options: nosniff`, restrictive framing, and a privacy-appropriate referrer policy. Start Content Security Policy in report-only mode, then enforce a policy verified against this app's inline styles, WebGL/Three.js views, fonts, images, blob URLs, and media downloads. Avoid an untested policy that breaks login or reports. Never insert API keys into `VITE_*` configuration.

### 6.10 Email and optional voice integration

For SES SMTP:

1. Verify the sending domain in the chosen SES Region; publish DKIM and your approved SPF/DMARC configuration.
2. Request production access in that Region and establish sending-rate limits.
3. Generate SES SMTP credentials, store them in Secrets Manager, and use port 587 with STARTTLS. SMTP credentials are not the same as ordinary AWS access keys or task-role credentials.
4. Set a real monitored reply-to mailbox. SES outbound delivery does not create an inbox.
5. Keep `EMAIL_SAFE_RECIPIENT` set in staging; test delivery, bounce/complaint processing, suppression, and duplicate prevention.
6. Add delivery-event handling and a durable outbox before broad bulk-email use. The repository does not implement SES bounce/complaint processing merely by setting SMTP values.

The SES sandbox is Region-specific; see [SES production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

For real Vapi calls, configure `VOICE_PROVIDER=vapi`, a provisioned number ID, provider key, a nonempty webhook secret, and `PUBLIC_BASE_URL=https://app.example.com`. The callback is `/api/v1/calls/webhook/vapi/`. Verify the current vendor payload/authentication contract in staging; the code itself notes that this integration is not covered by live-provider tests. Persist valid events and acknowledge quickly, then process them asynchronously. Deduplicate repeated/out-of-order events and use constant-time secret comparison. Keep `VOICE_SAFE_NUMBER` set until controlled acceptance testing is complete. If calls are disabled, deny this webhook path and reject real-call operations server-side.

Set accurate `EMAIL_COMPANY_NAME` and `COMPANY_PROFILE`; otherwise the default AI company description can make incorrect claims about the organisation. Review consent, recording retention, and approved provider data handling with the relevant business owner before enabling real outreach.

## 7. Production configuration reference

Keep normal configuration in version-controlled environment definitions and secrets in Secrets Manager. Do not copy the developer `.env` wholesale into AWS. Settings only take effect if the Python code reads them; new storage/worker options need corresponding implementation.

### 7.1 Existing backend settings

| Setting | Production value or rule |
|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.prod` |
| `DJANGO_DEBUG` | `false`; production settings also force `DEBUG=False` |
| `DJANGO_SECRET_KEY` | Independent high-entropy secret, at least 50 characters; same across API/workers of one environment |
| `DJANGO_ALLOWED_HOSTS` | `app.example.com`; add only intentionally supported operational hosts |
| `DJANGO_SECURE_SSL_REDIRECT` | `true`, after exact health-path handling is implemented |
| `DJANGO_SECURE_HSTS_SECONDS` | Begin at `300`, then increase after HTTPS validation; production target commonly `31536000` |
| `JWT_COOKIE_SECURE` | `true` |
| `JWT_COOKIE_SAMESITE` | `Lax` for this same-origin design |
| `JWT_ACCESS_MINUTES` | `15` initially; choose with security/session requirements |
| `JWT_REFRESH_HOURS` / `JWT_REFRESH_REMEMBER_DAYS` | `12` / `14` initially; review staff session policy |
| `CORS_ALLOWED_ORIGINS` | `https://app.example.com` if needed; no wildcard or development origins |
| `DATABASE_URL` | Secret using runtime DB role, TLS `verify-full`, bundled RDS CA, and connection timeout |
| `DATABASE_CONN_MAX_AGE` | Start at `60` for WSGI; validate connection use under thread/task scaling |
| `CACHE_URL` | Secret `rediss://...`; requires tested Redis client/backend |
| `AWS_REGION` | `ap-south-1` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | **Omit in ECS**, after the adapter change; use the task role |
| `AWS_S3_ENDPOINT_URL` | Omit/empty on AWS |
| `RESUME_S3_BUCKET` | Private media bucket name |
| `RESUME_S3_PREFIX` | `resumes/` |
| `RESUME_S3_URL_EXPIRY_SECONDS` | Start at `300` for sensitive downloads; role credential expiry can shorten validity |
| `RESUME_STORAGE_PATH` | Existing code needs a durable path; after S3 refactor, use only bounded worker scratch such as `/tmp/resumes` |
| `RESUME_UPLOAD_MAX_MB` | `20`, subject to upload workflow and business limits |
| `RESUME_UPLOAD_MAX_FILES` | Lower the default `200` for HTTP batches; direct S3 flow must enforce explicit batch and spend limits |
| `RESUME_LLM_PDF_MAX_PAGES` / `RESUME_LLM_PDF_MAX_MB` | Existing `12` / `14`; validate against chosen provider limits and expected documents |
| `RESUME_INGEST_ASYNC` / `SEARCH_RUN_ASYNC` | Existing flags do not configure SQS; refactor their implementation/replace with explicit execution configuration |
| `CANDIDATE_SOURCE_PROVIDERS` | `internal`; `resume` is not a registered provider key, and the other current adapters are mocks |
| `MATCH_ENGINE` | `rule_based` is the existing registered baseline; semantic augmentation is separate |
| `AI_SHORTLIST_THRESHOLD` | `80` initially; business decision, not an infrastructure default to tune blindly |
| `LLM_PROVIDER` | Explicitly select `openai` or `gemini` based on approved provider configuration |
| `OPENAI_API_KEY`, `GEMINI_API_KEY` | Separate environment secrets for approved providers only |
| `OPENAI_MODEL`, `OPENAI_SEARCH_MODEL`, `OPENAI_FALLBACK_MODEL` | Explicit, tested model IDs; pin deployment configuration and regression-test changes |
| `GEMINI_MODEL`, `GEMINI_SEARCH_MODEL`, `GEMINI_FALLBACK_MODEL` | Explicit if using Gemini; verify provider account access and current availability |
| `OPENAI_BASE_URL` | Empty unless an approved gateway is deliberately configured |
| `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL` | Explicit and consistent with the stored vector corpus; do not inherit them accidentally from chat-provider changes |
| `EMBEDDING_DIMENSIONS` | `768` until an intentional schema/index migration |
| `EMBEDDING_BATCH_SIZE` | Existing `32`; tune within provider request/token limits |
| `LLM_TIMEOUT_SECONDS`, `LLM_MAX_RETRIES` | Bound the entire call chain; see section 5.7. Existing defaults are `120` and `0` |
| `SEMANTIC_JD_ANALYSIS_ENABLED`, `SEMANTIC_RERANK_ENABLED` | `true` only when provider configuration and spend limits are ready |
| `VECTOR_SEARCH_LIMIT`, `CANDIDATE_RESULT_LIMIT`, `SEMANTIC_RERANK_LIMIT` | Start with existing `60`, `10`, `4`; measure accuracy, latency, and cost |
| `SEARCH_CHAT_MODEL`, `ASSISTANT_MODEL`, `VOICE_MODEL` | Explicit if differing from resolved defaults; test assistant tool permissions/confirmations |
| `EMAIL_HOST` | SES SMTP endpoint for the selected Region, or another approved SMTP provider |
| `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_USE_SSL` | `587`, `true`, `false` for SES STARTTLS |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | SMTP secrets |
| `EMAIL_TIMEOUT` | Existing `20`; include it in delivery job deadlines |
| `DEFAULT_FROM_EMAIL`, `EMAIL_REPLY_TO` | Verified sender and monitored reply mailbox |
| `EMAIL_SAFE_RECIPIENT` | Required in staging; remove in production only after approved real-send acceptance |
| `EMAIL_COMPANY_NAME`, `COMPANY_PROFILE` | Real approved organisational details |
| `VOICE_PROVIDER` | Empty to disable real calls; `vapi` only after integration acceptance |
| `PUBLIC_BASE_URL` | `https://app.example.com`, with no API suffix |
| `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `VAPI_WEBHOOK_SECRET` | Required when enabling real Vapi calls |
| `VOICE_SAFE_NUMBER`, `VOICE_DEFAULT_REGION` | Controlled test destination until go-live; explicit number-parsing region |
| `VAPI_MODEL_PROVIDER`, `VAPI_MODEL`, `VAPI_VOICE_PROVIDER`, `VAPI_VOICE_ID` | Account-supported, tested vendor settings |
| `DJANGO_LOG_LEVEL` | `INFO` normally; never emit secrets when enabling temporary debug logs |

The current production settings automatically enable `SECURE_HSTS_INCLUDE_SUBDOMAINS` whenever HSTS duration is positive and leave preload disabled. Review subdomain ownership before enabling HSTS. Do not enable preload only to remove a warning; preload has a separate domain-wide operational commitment.

The current chat fallback may send the same resume or candidate context to another provider. If only one provider is approved, change the fallback policy in code and test it; omitting a key should not be your only data-routing control. Embedding calls do not follow the chat fallback chain.

### 7.2 Frontend build configuration

```dotenv
VITE_API_BASE_URL=
VITE_SHOW_DEMO_ACCOUNTS=false
```

These are **build-time public values**. With an empty base URL, the SPA uses `/api/v1/...` on the CloudFront hostname. Every `VITE_*` value can be included in browser assets; secrets must never be put there. Changing ECS environment variables cannot alter a frontend bundle already built and uploaded to S3.

Keep staging and production both same-origin so the same frontend artifact can be promoted unchanged. If using separate API hostnames instead, update relative photo/support links, CORS, CSRF, cookie behaviour, and CSP; this is not a drop-in DNS-only change.

### 7.3 New settings required by the proposed implementation

Define and document names for queue URLs, worker concurrency/lease durations, storage prefixes, outbox dispatch, interactive/worker AI budgets, cache timeouts, trusted proxy identity, and health handling. None should be assumed to work by merely exporting `SQS_QUEUE_URL`, `CELERY_BROKER_URL`, `MEDIA_S3_BUCKET`, or similar invented variables.

Add `CSRF_TRUSTED_ORIGINS` parsing if required by the selected CSRF implementation. Add a deliberate system-check warning policy: fix the existing OpenAPI enum collisions and, if intentionally deferring HSTS preload, allow only `security.W021` with a documented reason. Do not silence all deployment checks.

## 8. Build and publish artifacts

### 8.1 Prerequisites and release inputs

Use a clean CI checkout with Node 24, Python 3.12, Docker Buildx, AWS CLI v2, `jq`, a pinned Terraform version, and temporary AWS credentials from SSO/OIDC. The examples below assume Bash, execution from the repository root, and that section 5 changes have been completed. Keep release variables in the same shell; persist non-secret outputs explicitly between CI jobs. Command-substitution assignments are separate from `export` so command failures are not masked by the export builtin.

Create the network/ECR/data resources first, build the initial image, then create ECS task definitions/services with **desired count 0** until migration succeeds. This avoids starting an application against an empty schema.

Example non-secret shell variables; replace resource names/IDs with IaC outputs:

```bash
set -euo pipefail
export AWS_REGION=ap-south-1
export AWS_DEFAULT_REGION="$AWS_REGION"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
RELEASE_SHA=$(git rev-parse HEAD)
export ECR_REPOSITORY=talentos-api
export ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY"
export CLUSTER=talentos-production
export API_SERVICE=talentos-api
export WORKER_SERVICE=talentos-worker
export WEB_BUCKET="talentos-prod-web-$AWS_ACCOUNT_ID-$AWS_REGION"
export ARTIFACT_BUCKET="talentos-prod-artifacts-$AWS_ACCOUNT_ID-$AWS_REGION"
export CF_DISTRIBUTION_ID=REPLACE_WITH_DISTRIBUTION_ID
export APP_SUBNET_IDS=subnet-REPLACE_A,subnet-REPLACE_B
export MIGRATION_SG_ID=sg-REPLACE_MIGRATION
```

Verify the returned AWS account against the intended environment before publishing. Do not reuse a production deployment role for untrusted pull-request code. Do not print the full environment or secret values into logs.

### 8.2 Quality gates in an isolated environment

Backend CI requires a disposable PostgreSQL 16 + pgvector service and a test role able to create the test database. Set `DATABASE_URL` to that service, never production. The existing test settings disable LLM keys but CI should also have no real AWS, email, or voice credentials available.

```bash
cd backend
python -m pip install --requirement requirements-dev.txt
python -m pip check
ruff check .
ruff format --check .
lint-imports
DJANGO_SETTINGS_MODULE=config.settings.test python -m pytest
DJANGO_SETTINGS_MODULE=config.settings.test python manage.py makemigrations --check --dry-run
cd ../frontend
npm ci --no-audit --no-fund
npm run lint
npx prettier --check src
npm test -- --maxWorkers=2
npm run typecheck
VITE_API_BASE_URL= VITE_SHOW_DEMO_ACCOUNTS=false npm run build
cd ..
```

Use the new hash-locked requirements once implemented, rather than the existing direct-pin file shown above. Add dependency/container scanning, secret scanning, and IaC checks as separate gates. Reject unresolved critical/high findings according to an owned exception policy. Archive the SBOM and test results with the release.

Run production `manage.py check --deploy` with the actual task configuration in staging. After fixing enum warnings and explicitly accepting only intentional preload behaviour, enforce `--fail-level WARNING`. Do not claim a deploy check validates IAM, network reachability, cookies, media persistence, or live integrations: those require functional tests.

### 8.3 Build the backend once

```bash
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin \
  "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

docker buildx build \
  --platform linux/amd64 \
  --tag "$ECR_URI:$RELEASE_SHA" \
  --push \
  backend

IMAGE_DIGEST=$(aws ecr describe-images \
  --repository-name "$ECR_REPOSITORY" \
  --image-ids "imageTag=$RELEASE_SHA" \
  --query 'imageDetails[0].imageDigest' --output text)
test "$IMAGE_DIGEST" != None
export IMAGE_URI="$ECR_URI@$IMAGE_DIGEST"
```

Wait for the image scan and apply the vulnerability gate. Test the **final image**, including imports, non-root temporary-file access, CA bundle, static files, and signal handling. Do not pass real secrets using build arguments or bake a `.env` into the image. Promote this digest to production; rebuilding the same Git SHA can resolve different unpinned base/transitive dependencies.

### 8.4 Archive the frontend and release manifest

The `frontend/dist/` directory from section 8.2 is the deployable artifact. No frontend Docker container is needed in the selected architecture.

```bash
test -f frontend/dist/index.html
aws s3 cp frontend/dist/ \
  "s3://$ARTIFACT_BUCKET/releases/$RELEASE_SHA/frontend/" \
  --recursive --only-show-errors

jq -n \
  --arg commit "$RELEASE_SHA" \
  --arg image "$IMAGE_URI" \
  --arg frontend "s3://$ARTIFACT_BUCKET/releases/$RELEASE_SHA/frontend/" \
  '{commit: $commit, backendImage: $image, frontendArtifact: $frontend}' \
  > release-manifest.json
aws s3 cp release-manifest.json \
  "s3://$ARTIFACT_BUCKET/releases/$RELEASE_SHA/release-manifest.json" \
  --only-show-errors
```

Add task-definition ARNs, migration IDs, build provenance, test/scanner results, frontend checksums, configuration version/secret version references, and the previous release identifier before marking the release complete. Keep secret values out of this manifest. Enforce write-once release prefixes through CI policy/versioning controls; do not overwrite an accepted release archive.

### 8.5 Proposed API task-definition shape

The following is a **template**, not a file already present in the repository. Replace every `REPLACE_*` value using IaC or a structured JSON rendering step. Merge the complete non-secret configuration and required secret ARNs from section 7. Register only the rendered JSON.

```json
{
  "family": "talentos-production-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "runtimePlatform": {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX"
  },
  "executionRoleArn": "REPLACE_API_EXECUTION_ROLE_ARN",
  "taskRoleArn": "REPLACE_API_TASK_ROLE_ARN",
  "volumes": [{"name": "scratch"}],
  "containerDefinitions": [{
    "name": "api",
    "image": "REPLACE_ECR_URI_WITH_DIGEST",
    "essential": true,
    "user": "10001:10001",
    "readonlyRootFilesystem": true,
    "linuxParameters": {"initProcessEnabled": true},
    "stopTimeout": 120,
    "mountPoints": [{
      "sourceVolume": "scratch",
      "containerPath": "/tmp",
      "readOnly": false
    }],
    "portMappings": [{"containerPort": 8200, "protocol": "tcp"}],
    "command": [
      "gunicorn", "config.wsgi:application",
      "--bind", "0.0.0.0:8200",
      "--worker-class", "gthread", "--workers", "2", "--threads", "4",
      "--timeout", "120", "--graceful-timeout", "100",
      "--worker-tmp-dir", "/tmp",
      "--access-logfile", "-", "--error-logfile", "-",
      "--access-logformat", "%(t)s %(m)s %(U)s %(s)s %(L)s"
    ],
    "environment": [
      {"name": "DJANGO_SETTINGS_MODULE", "value": "config.settings.prod"},
      {"name": "DJANGO_DEBUG", "value": "false"},
      {"name": "DJANGO_ALLOWED_HOSTS", "value": "app.example.com"},
      {"name": "DJANGO_SECURE_SSL_REDIRECT", "value": "true"},
      {"name": "DJANGO_SECURE_HSTS_SECONDS", "value": "300"},
      {"name": "JWT_COOKIE_SECURE", "value": "true"},
      {"name": "JWT_COOKIE_SAMESITE", "value": "Lax"},
      {"name": "AWS_REGION", "value": "ap-south-1"},
      {"name": "CANDIDATE_SOURCE_PROVIDERS", "value": "internal"}
    ],
    "secrets": [
      {"name": "DJANGO_SECRET_KEY", "valueFrom": "REPLACE_DJANGO_SECRET_ARN"},
      {"name": "DATABASE_URL", "valueFrom": "REPLACE_APP_DATABASE_URL_SECRET_ARN"},
      {"name": "CACHE_URL", "valueFrom": "REPLACE_CACHE_URL_SECRET_ARN"}
    ],
    "healthCheck": {
      "command": [
        "CMD", "python", "-c",
        "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8200/health/live', timeout=3)"
      ],
      "interval": 30,
      "timeout": 5,
      "retries": 3,
      "startPeriod": 30
    },
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/talentos/production/api",
        "awslogs-region": "ap-south-1",
        "awslogs-stream-prefix": "ecs",
        "mode": "non-blocking",
        "max-buffer-size": "10m"
      }
    }
  }]
}
```

This template requires the new health paths, fixed UID, writable `/tmp` mount ownership, runtime CA bundle, S3 storage changes, and complete environment settings. It is deliberately not compatible with the unmodified filesystem/thread design. The log format avoids query strings; replace/augment it with structured request logging as implemented. Non-blocking infrastructure logs can lose entries if buffers fill; monitor that condition, and keep required business audit records durable in the database.

For workers, use the same image digest with the **newly implemented** worker entry command, separate IAM role, queue settings, 2-vCPU/4-GiB sizing, and a worker-specific health signal. Do not copy the API HTTP health check to workers. For migration, use a separate family/execution role and migration DB secret, remove port mappings and health checks, and run only the migration command.

Validate fields against [Fargate task-definition parameters](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html). Keep ECS Exec disabled on normal tasks unless required. Its writable filesystem/agent and IAM requirements must be considered separately; use a dedicated audited operational task instead of weakening every read-only application task.

## 9. First deployment and database initialisation

### 9.1 Render and register task definitions

Have IaC/rendering produce `deploy/api-task.json`, `deploy/worker-task.json`, and `deploy/migration-task.json` with real resource ARNs and the exact `IMAGE_URI`. These are files you must create from the reviewed templates; this documentation change has not created them.

The migration task uses a container named `migration` and this command, after the warning policy in section 7.3 is implemented:

```json
["sh", "-ec", "python manage.py check --deploy --fail-level WARNING && python manage.py migrate --noinput && python manage.py migrate --check"]
```

Register each task definition:

```bash
API_TASK_ARN=$(aws ecs register-task-definition \
  --cli-input-json file://deploy/api-task.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)
WORKER_TASK_ARN=$(aws ecs register-task-definition \
  --cli-input-json file://deploy/worker-task.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)
MIGRATION_TASK_ARN=$(aws ecs register-task-definition \
  --cli-input-json file://deploy/migration-task.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)
```

For multiple worker queues, create/update each worker service using its corresponding definition. Record all ARNs in the release manifest.

### 9.2 Run one migration task and require a successful exit

Only one pipeline may migrate an environment at a time. Use CI environment concurrency control and a migration lock if jobs can be launched elsewhere. Do not put `migrate` in the API's startup command.

```bash
jq -n \
  --arg subnets "$APP_SUBNET_IDS" \
  --arg sg "$MIGRATION_SG_ID" \
  '{awsvpcConfiguration: {
    subnets: ($subnets | split(",")),
    securityGroups: [$sg],
    assignPublicIp: "DISABLED"
  }}' > migration-network.json

aws ecs run-task \
  --cluster "$CLUSTER" \
  --launch-type FARGATE \
  --task-definition "$MIGRATION_TASK_ARN" \
  --count 1 \
  --network-configuration file://migration-network.json \
  > migration-run.json

jq -e '(.failures | length) == 0 and (.tasks | length) == 1' migration-run.json
MIGRATION_RUN_ARN=$(jq -r '.tasks[0].taskArn' migration-run.json)
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$MIGRATION_RUN_ARN"

aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$MIGRATION_RUN_ARN" \
  > migration-result.json
jq -e '(.failures | length) == 0 and
  ([.tasks[0].containers[] | select(.name == "migration") | .exitCode] == [0])' \
  migration-result.json
```

`run-task` can return an API success with placement failures; inspect `failures`. A task reaching `STOPPED` does not mean its migration succeeded; inspect the named container's exit code and logs. If an AWS waiter times out, inspect the task before retrying. Do not launch a second migration just because the first is slow.

If a migration fails, keep the services at their prior revision/desired count. Review locks, migration atomicity, DDL permissions, and pgvector compatibility before retrying. A migration can be partly applied if it is explicitly non-atomic.

### 9.3 Bootstrap real users

Use an audited one-off management task to run Django `createsuperuser`, with a unique real email and an independently generated initial password supplied through a short-lived bootstrap secret. The custom manager sets the superuser role to `hr_admin`. Do not put the password in CLI command overrides, source files, tickets, or logs. Remove the bootstrap secret/access afterward and create ordinary staff with the minimum business role.

Do **not** run `make demo`, `make seed`, or `manage.py seed_demo` in production. Hiding demo accounts in the browser does not disable accounts already in the database. If importing a demo database, remove/deactivate public demo accounts and revoke their sessions before exposure; prefer starting with clean production data.

### 9.4 If moving existing recruitment data

1. Inventory databases, original resume directories, photos, `backend/media`, S3 keys/versions, pending uploads, and in-flight jobs. Establish counts/checksums and the approved scope of real data.
2. Rehearse a restore into staging using appropriately protected/sanitised data. Test the application against the migrated schema and object layout.
3. Freeze writes and stop producers/consumers for the final cutover. Record the exact cutover timestamp and deployment version.
4. Take a consistent PostgreSQL backup and copy all required files/objects. Use encrypted transport and storage. Restore using compatible PostgreSQL tools; reconcile ownership/privileges with the migrator/runtime roles.
5. Run required schema/data migrations once. Rewrite local `source_path` dependencies to durable object references using a reviewed migration tool. Setting `RESUME_S3_BUCKET` does not rewrite historical records.
6. Verify record counts, attachment/resume checksums, profile-to-document relations, vector counts/model versions, timeline/TAT results, and role visibility.
7. Reconcile pending jobs explicitly. Do not replay outbound emails/calls automatically from copied state.
8. Retain the old system read-only through the rollback window; do not allow both systems to accept writes without a designed reconciliation strategy.

The existing `upload_resumes` command can copy pending originals while their source paths still exist, but it does not migrate photos, support attachments, durable queues, or missing files. `ingest_resumes --reprocess` calls external providers and can incur cost; it is not a generic data migration command.

### 9.5 Start the services

On the **first** deployment, after migration/bootstrap:

```bash
aws ecs update-service \
  --cluster "$CLUSTER" --service "$API_SERVICE" \
  --task-definition "$API_TASK_ARN" --desired-count 2
aws ecs update-service \
  --cluster "$CLUSTER" --service "$WORKER_SERVICE" \
  --task-definition "$WORKER_TASK_ARN" --desired-count 2
aws ecs wait services-stable \
  --cluster "$CLUSTER" --services "$API_SERVICE" "$WORKER_SERVICE"

aws ecs describe-services \
  --cluster "$CLUSTER" --services "$API_SERVICE" \
  > api-service-result.json
jq -e --arg expected "$API_TASK_ARN" \
  '(.failures | length) == 0 and
   ([.services[0].deployments[] |
     select(.status == "PRIMARY" and .taskDefinition == $expected and
            .rolloutState == "COMPLETED")] | length) == 1' \
  api-service-result.json
```

Perform the equivalent expected-revision check for each worker service, inspect running task image digests and target health, and execute functional smoke tests. `services-stable` can succeed after ECS has rolled back to an old revision; checking the intended revision prevents a false success report.

For subsequent releases, omit `--desired-count` so the deployment does not override autoscaling's current desired count. Ensure IaC and CI agree on ownership of task revisions and service desired count; avoid drift fighting the autoscaler.

### 9.6 Publish the frontend, HTML last

The API must remain compatible with both the current and previous frontend release. Upload hashed assets first, other files next, and `index.html` last. Do not delete previous hashed assets on each deploy: users may still have an older tab open and rollback may need them.

```bash
aws s3 cp frontend/dist/assets/ "s3://$WEB_BUCKET/assets/" \
  --recursive --cache-control 'public,max-age=31536000,immutable' \
  --only-show-errors

aws s3 cp frontend/dist/ "s3://$WEB_BUCKET/" \
  --recursive --exclude 'assets/*' --exclude 'index.html' \
  --cache-control 'public,max-age=300' --only-show-errors

aws s3 cp frontend/dist/index.html "s3://$WEB_BUCKET/index.html" \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'public,max-age=0,must-revalidate' \
  --only-show-errors

INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$CF_DISTRIBUTION_ID" --paths '/*' \
  --query 'Invalidation.Id' --output text)
aws cloudfront wait invalidation-completed \
  --distribution-id "$CF_DISTRIBUTION_ID" --id "$INVALIDATION_ID"
```

A distribution-wide invalidation is a simple baseline that also covers mutable `/brand/` files and previously cached route rewrites. Optimise it only after verifying actual cache keys and asset versioning. Invalidation is not a mechanism for making cached authenticated API responses safe: API caching must be disabled from the outset.

In a separate deployment job, first download the immutable frontend artifact for `RELEASE_SHA` to the local publish directory; do not rebuild it. Verify hashes before upload. Test MIME types, compression, deep links, and API routing through CloudFront before enabling real staff traffic.

## 10. CI/CD and subsequent releases

### 10.1 Pipeline stages

1. **Pull request:** lint, format checks, typecheck, unit/integration tests, migration drift check, dependency/secret scans, and infrastructure plan. Do not expose production credentials to forks or untrusted code.
2. **Build:** create one backend image digest, frontend artifact, SBOM and release manifest from a clean commit. Pin third-party CI actions to reviewed commit SHAs.
3. **Staging:** apply approved infrastructure changes; run one migration task; deploy workers/API in a schema-compatible order; publish frontend; run browser/API/queue acceptance tests and a controlled provider integration test.
4. **Release gate:** verify backups, remaining blockers, compatible migration plan, rollback artifacts, alarms, and operational ownership. Use a protected production environment and separation of deploy permissions where required by the team.
5. **Production:** serialise deployment; record the prior API/worker/manifest revisions; run migrations once; update services; verify the intended revision; publish frontend last; run smoke tests.
6. **Observe:** compare error rate, latency, queue age, email/call outcomes, DB connections, and AI spend against baseline for an agreed observation window. Automatically halt/rollback eligible application regressions.
7. **Record:** append the deployment event, artifact digests, configuration references, migration state and test results to the release record.

If GitHub Actions is used, authenticate to AWS via OIDC with `aud=sts.amazonaws.com` and an exact `sub`, such as `repo:ORG/REPOSITORY:environment:production`. Protect that GitHub environment's deployment branches and reviewers. An environment-based subject does not itself encode the Git branch. Use separate staging/production roles and short sessions. See [GitHub OIDC for AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

Example IAM trust **condition** to adapt, not a complete role policy:

```json
{
  "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
    "token.actions.githubusercontent.com:sub": "repo:ORG/REPOSITORY:environment:production"
  }
}
```

Do not give CI `AdministratorAccess`. Avoid letting the same untrusted workflow edit its own production trust policy, migration privileges, or approval controls. Use environment-scoped concurrency with cancellation disabled once production migration/deployment has started.

### 10.2 Schema and message compatibility

Use expand/contract releases:

1. Add nullable/defaulted fields and new indexes in a backward-compatible migration.
2. Deploy code that can read old/new data and messages. Backfill in bounded, resumable jobs.
3. Switch consumers to the new shape after verification.
4. Remove old fields/message support in a later release after the rollback window and old queued jobs expire.

Measure lock duration on realistic data. Build large indexes with an appropriate non-blocking PostgreSQL strategy and migration atomicity; do not assume an initial migration tested on an empty database is safe on a large production table.

Queue payloads need a version so old workers and new workers can coexist during rollout. If a release cannot tolerate mixed workers, deliberately pause producers, drain or quarantine old jobs, deploy compatible consumers, then resume. A task restart is not a safe substitute for this protocol.

### 10.3 Scheduled maintenance

Use EventBridge Scheduler to start narrowly scoped management tasks, with concurrency/idempotency controls and failure alerts, for:

- `python manage.py flushexpiredtokens` daily to clean SimpleJWT blacklist/outstanding-token records.
- Implemented outbox/lease reconciliation and lifecycle cleanup as appropriate; continuous dispatchers may be more suitable than scheduled tasks.
- Approved PII/temporary-export retention jobs.
- Backup verification, synthetic user journeys, and routine restore exercises.

The only existing command named above is `flushexpiredtokens` from SimpleJWT. Reconciliation/retention commands must be implemented. Do not schedule destructive demo seed/reset commands in any production account.

## 11. Production acceptance tests

Run these in staging before first production release and repeat the critical smoke tests after every release. Use synthetic candidates and controlled email/phone destinations. A green unit-test suite does not verify AWS routing, storage permissions, or failure recovery.

### 11.1 Basic external checks

```bash
export APP_URL=https://app.example.com
curl --fail --silent --show-error "$APP_URL/api/v1/health/"
curl --silent --show-error --head "$APP_URL/"
curl --silent --show-error --head "$APP_URL/jobs"
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  "$APP_URL/api/v1/auth/me/"
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  "$APP_URL/api/v1/definitely-not-a-real-endpoint/"
```

Expected: health is 200 JSON with database OK; `/` and `/jobs` serve HTML with the intended security/cache headers; unauthenticated `auth/me` returns 401; unknown API paths return 404 JSON. The last two responses must not be SPA HTML with status 200. Verify direct S3 object access and direct-origin bypass attempts are denied.

### 11.2 Functional and failure matrix

| Test | Required result |
|---|---|
| Deep-link refresh | `/jobs/<id>`, `/candidates/<id>`, and `/support/<id>` load the SPA and restore login correctly |
| Login / remember-me / reload / logout | Correct secure HttpOnly cookie path/attributes, one refresh rotation, session revocation and no cached credentials |
| CSRF and origin attacks | Cookie-authenticated changes reject forged origins/missing tokens according to the implemented policy |
| Multiple API tasks | Session, throttling, job status, photos, attachments and search results are consistent regardless of target |
| Role boundaries | HR, interviewer, employee, and support roles see only intended data/actions; original resumes do not bypass contact-masking policy |
| Job lifecycle | Create/publish/edit/close, participants and activity history remain consistent |
| JD upload | PDF and DOCX validate; cancel wins races; source survives worker restart; no job is created before user review/save |
| Resume ingestion | Native-text and scanned PDF, duplicate, oversize, corrupt, malicious/quarantined, and provider-failure paths behave correctly |
| Resume persistence | Accepted input remains recoverable after stopping the receiving API task and the processing worker |
| Search | Internal source, vector retrieval, match explanation, shortlist, search progress, failure/retry and cancellation work |
| Assistant | SSE streams incrementally; tool access follows user permissions; confirmation remains required for configured consequential actions |
| Streaming under load | Several simultaneous chats do not starve health/login/CRUD; heartbeats survive a slow tool call |
| Media | Photo/support/resume links expire as intended; permissions prevent guessing IDs; no public bucket or unbounded signed access |
| Candidate pipeline | Contact/interview/offer/onboarding transitions, timeline, notifications, dashboard/TAT, CSV/Excel/PDF exports agree |
| Email | Safe recipient works; real approved send, bounce/complaint handling, retry and duplicate prevention work |
| Calls, if enabled | Safe number, valid/invalid secret, repeat/out-of-order webhook, transcript processing and interview booking work |
| Worker termination | Job retries after lease/visibility expiry without duplicate business effects |
| RDS failover | API reconnects; writes are consistent; service returns to normal without manual container replacement |
| Cache failover | Throttle/cache behaviour meets the documented failure policy; no insecure unlimited fallback |
| Vendor outage | Controlled errors/queued retry, finite retries, spend limits, and useful status instead of endless loading |
| Deployment while busy | API drains safely; jobs recover; streams end/reconnect cleanly; mixed revisions remain compatible |
| Rollback | Previous API/worker/frontend artifacts work with the expanded schema and queued message versions |
| Restore drill | Restored DB and matching private objects support a real end-to-end synthetic recruitment journey |

Load tests should include concurrent SSE connections, maximum supported uploads, resume/face extraction memory, vector-query latency, report generation, and AI rate limiting. Record tested concurrency and latency instead of treating the sizing table as a promise.

## 12. Monitoring, alerts, and operational ownership

### 12.1 Logs and tracing

- Send API/worker/migration logs to separate CloudWatch log groups. Start with an explicit retention period such as 30 days for operational logs and a separately approved policy for business audit history.
- Include timestamp, severity, service, environment, release, request/job ID, operation, latency, and sanitised error category. Propagate a correlation ID through API → outbox → worker → provider call metadata.
- Capture ALB/CloudFront/WAF access and security logs with appropriately restricted delivery buckets/log groups. Minimise fields where supported. Access logs can contain signed media query tokens and business URLs; control access and retention accordingly.
- Never record Authorization, refresh cookies, provider keys, full resume PDFs/text, transcripts, or unredacted outreach content in routine operational logs. The existing console-email backend must not be used for real production mail.
- Existing audit middleware redacts named secrets but still stores other request-body fields. Review its payloads, permission controls, and retention. Add sensitive-document access audit events if required; current mutating-request audit coverage is not a complete read/download audit trail.
- Instrument errors and traces with an approved OpenTelemetry/error-monitoring integration. Redact request bodies and PII before export; do not enable automatic full-payload capture.

### 12.2 Initial alarm plan

Thresholds below are proposed starting points. Assign an owner, notification destination, and runbook to every actionable alarm.

| Signal | Initial trigger / response |
|---|---|
| External synthetic login/API journey | Repeated failure from independent probes; page the service owner |
| ALB healthy targets | Fewer than 2 sustained, or 0 immediately; inspect deployments/readiness |
| API 5xx | >1% for 5 minutes with a minimum request count, or a burst of absolute errors at low traffic |
| Ordinary API latency | p95 >1 second for 5 minutes; distinguish DB, concurrency and provider endpoints |
| API/worker memory | Sustained >80%, any OOM kill or repeated restart |
| API CPU | Sustained >70%; correlate with request latency and stream occupancy |
| Worker queue age | Above business processing SLO, e.g. 120 seconds for interactive searches; use a separate threshold for bulk ingestion |
| DLQ | Any visible message triggers investigation; do not auto-redrive endlessly |
| Worker heartbeat / stale DB jobs | Expired leases or heartbeat gaps; reconcile without duplicating side effects |
| RDS | Free storage below safety margin, rising connections approaching budget, low memory, high latency/locks, backup/failover failures |
| Cache | Low memory, unexpected evictions, connection errors and failover events |
| Provider calls | Elevated 429/5xx/timeouts, fallback rate, parsing failure rate or daily spend limit |
| SES / voice | Bounces, complaints, delivery failures, webhook auth failures and repeated callbacks |
| Audit / log delivery | Failed audit writes, missing log streams, full buffers or ingestion failures |
| Security/cost | Unexpected secret access, S3 exposure, denied IAM spikes, cost anomaly, budget thresholds |

SSE occupancy, job heartbeats, ingestion failure rate, provider spend and similar business metrics require application instrumentation; they are not automatically present in CloudWatch. CPU-only autoscaling is insufficient for an API waiting on AI responses.

Suggested service targets for agreement: 99.9% availability for core staff workflows, p95 below 500 ms for ordinary reads/writes under the tested load, and explicit separate SLOs for search/ingestion. Exclude legitimate 4xx responses from server-error calculations, but track unexpected 401/403 spikes because they can indicate broken auth or proxy configuration.

### 12.3 Routine ownership

| Cadence | Work |
|---|---|
| Daily | Review DLQs, failed processing, delivery issues, unusual spend, and backup status |
| Weekly | Review dependency/image scans, slow queries, rate limits, capacity and pending security findings |
| Monthly | Rebuild patched images; review IAM/secret access, retention behaviour and cost drivers |
| Quarterly or after major changes | Restore/rollback drills, RDS/cache failover tests, access review and incident runbook rehearsal |

Alert the on-call owner on a failed deployment or migration even if traffic recovered automatically. Record who can approve a restore, revoke access, disable outbound communications, and contact each external provider.

## 13. Backup, restore, and disaster recovery

### 13.1 Protect every state store

| State | Protection and recovery requirement |
|---|---|
| PostgreSQL | Automated backups/PITR, pre-risk-change snapshots, deletion protection, verified restore privileges and encryption keys |
| Original resumes/media | S3 versioning; backup/replication according to risk and residency; restore object versions and DB references together |
| Job state/outbox | PostgreSQL is authoritative; rebuild/reconcile queue messages from unfinished records |
| SQS messages | Retention and DLQs support short outages; do not depend on queues as the only record of accepted work |
| Cache | Recreate from IaC; accept loss of cache state according to documented throttle policy |
| Releases | ECR digests, immutable frontend archives, checksums, migration manifests and previous configuration references |
| Secrets/KMS | Recovery access, rotation history and protected keys; backups are unusable without valid decryption access |
| Infrastructure | Versioned IaC, protected remote-state versions and a tested bootstrap procedure |

RDS PITR restores to a **new DB instance**, with a new endpoint; it does not rewind the existing database in place. Measure the latest restorable timestamp and restore duration in your environment. See [RDS point-in-time recovery](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html).

RPO/RTO in section 1 are targets for the whole system, not AWS service guarantees. For media, a versioned object may be recoverable immediately, while a cross-Region replica may lag. Database restoration can also make an already-sent email/call look unsent; use external delivery identifiers and reconciliation to prevent replay.

### 13.2 Restore drill procedure

1. Select a known recovery point and matching application/image/schema version. Record the incident/recovery owner and target environment.
2. Create an isolated restore VPC/environment or isolated services with no outbound email/calls enabled.
3. Restore RDS to a new instance, enforcing private networking, encryption, the right parameter group, and intended Multi-AZ configuration. Confirm security groups and backup settings rather than assuming every source setting is copied.
4. Restore/copy matching S3 object versions; verify sample and aggregate checksums against database references.
5. Update the restored environment's DB secret with its real RDS hostname and TLS verification. Launch compatible API/workers using separate queues so they cannot consume production work accidentally.
6. Verify schema/version, counts, login/roles, resumes/photos/attachments, vectors/search, timeline/TAT, and reports. Keep outbound integrations in safe mode.
7. Measure achieved RPO/RTO, record gaps, and fix them before relying on the target.
8. For an actual cutover, freeze writes, reconcile outbound effects and jobs, redirect services to the restored data, and validate before resuming producers. Preserve the damaged source for investigation.

For Region-wide recovery, decide explicitly whether a second Region is required. That needs replicated/copyable data, available secrets/KMS access, deployed infrastructure, vendor egress/configuration, and a tested traffic switch. Two AZs in one Region do not cover a Region outage.

## 14. Rollback runbooks

### 14.1 API/worker application regression

1. Stop further deployments and identify whether the issue is code, configuration, schema, or an external dependency.
2. Confirm the last known good image/tasks are compatible with the current schema and queued payloads. Pause affected producers if needed.
3. Redeploy the recorded task-definition ARN(s), preserving the autoscaler's desired count:

```bash
export PREVIOUS_API_TASK_ARN=REPLACE_RECORDED_GOOD_API_ARN
export PREVIOUS_WORKER_TASK_ARN=REPLACE_RECORDED_GOOD_WORKER_ARN
aws ecs update-service \
  --cluster "$CLUSTER" --service "$API_SERVICE" \
  --task-definition "$PREVIOUS_API_TASK_ARN"
aws ecs update-service \
  --cluster "$CLUSTER" --service "$WORKER_SERVICE" \
  --task-definition "$PREVIOUS_WORKER_TASK_ARN"
aws ecs wait services-stable \
  --cluster "$CLUSTER" --services "$API_SERVICE" "$WORKER_SERVICE"
```

4. Verify the expected revisions, image digests, target health, functional smoke tests, and error/queue trends. Reconcile interrupted jobs before resuming normal concurrency.

Secret values can have changed since the previous task definition was deployed. A task-definition rollback that references `AWSCURRENT` is not automatically a secret rollback. Check configuration versions and coordinate credential validity.

### 14.2 Frontend regression

Retrieve the previous release artifact into a **new empty directory**, verify its manifest/checksums, and publish it using the same assets-first/HTML-last process as section 9.6:

```bash
export PREVIOUS_RELEASE_SHA=REPLACE_RECORDED_GOOD_RELEASE
RESTORE_DIR=$(mktemp -d)
aws s3 cp \
  "s3://$ARTIFACT_BUCKET/releases/$PREVIOUS_RELEASE_SHA/frontend/" \
  "$RESTORE_DIR/" --recursive --only-show-errors
test -f "$RESTORE_DIR/index.html"

aws s3 cp "$RESTORE_DIR/assets/" "s3://$WEB_BUCKET/assets/" \
  --recursive --cache-control 'public,max-age=31536000,immutable' \
  --only-show-errors
aws s3 cp "$RESTORE_DIR/" "s3://$WEB_BUCKET/" \
  --recursive --exclude 'assets/*' --exclude 'index.html' \
  --cache-control 'public,max-age=300' --only-show-errors
aws s3 cp "$RESTORE_DIR/index.html" "s3://$WEB_BUCKET/index.html" \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'public,max-age=0,must-revalidate' --only-show-errors

INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$CF_DISTRIBUTION_ID" --paths '/*' \
  --query 'Invalidation.Id' --output text)
aws cloudfront wait invalidation-completed \
  --distribution-id "$CF_DISTRIBUTION_ID" --id "$INVALIDATION_ID"
```

Verify the previous frontend still works with the current backend. Retaining old assets is essential for both this rollback and already-open tabs. Use a deliberate later lifecycle cleanup; do not `sync --delete` live assets during ordinary releases.

### 14.3 Database change failure

Prefer rolling forward with a compatible fix. Only reverse a migration if its reverse path was tested and preserves required data. Application rollback does not reverse schema changes. A destructive migration may require the full restore procedure and can lose changes since the recovery point; make that business decision explicitly and reconcile side effects.

Take a pre-change snapshot when warranted, but do not treat “snapshot exists” as an instant rollback plan. The restore creates another DB instance, consumes time, and requires endpoint/configuration and application verification.

### 14.4 Integration incident or runaway spend

Disable the affected producer/action server-side, pause its queue consumption, and preserve queued/job records for review. Reduce concurrency and revoke/rotate a compromised provider secret where appropriate. Do not purge all queues or delete candidate records to stop an integration. Review uncertain delivery outcomes before replaying email or phone jobs.

## 15. Cost and capacity planning

Obtain a Region-specific estimate in the [AWS Pricing Calculator](https://calculator.aws/) using the actual deployment shape. This guide intentionally does not present a fixed dollar figure: no traffic, document volume, provider usage, support plan, or contractual pricing was supplied.

| Cost driver | Inputs to estimate |
|---|---|
| API Fargate | 2 ×730 task-hours/month × chosen vCPU/memory rates, plus autoscaling and rollout overlap |
| Worker Fargate | Baseline task-hours, active concurrency, CPU/memory for PDF/OpenCV work, potential scale-to-zero tradeoffs |
| RDS | Multi-AZ compute, gp3 capacity/IOPS, backups/snapshots, monitoring and cross-Region copies if selected |
| ElastiCache | Primary + replica capacity/hours and transfer; compare provisioned versus serverless for real usage |
| ALB | Load-balancer hours, LCUs/processed traffic and active connections; SSE changes connection demand |
| NAT/endpoints | NAT hours per AZ, data processing, interface endpoint hours and cross-AZ traffic |
| S3/CloudFront | Stored current/noncurrent objects, requests, delivery traffic, logs, invalidations and replication |
| WAF | Web ACL, rule groups, requests and optional paid features |
| Security/operations | Secrets, KMS operations, CloudWatch logs/metrics/traces, scanning, backups and support |
| External providers | PDF pages/tokens, embedding tokens, reranking/chat calls, fallback attempts, voice minutes and SMTP sends |

Set budget/anomaly alerts before ingestion begins. The existing resume page cap multiplied by a 200-file batch can mean thousands of pages sent to model providers, with additional embedding/rerank costs. Global concurrency, batch quotas, controlled retries and a deliberate fallback policy are necessary cost controls.

Rough raw vector storage is `number_of_chunks × 768 × 4 bytes`, before graph indexes, row overhead, text, metadata, WAL and backups. For example, 100,000 float32 vectors alone are about 307 MB decimal; actual database capacity must be substantially higher and measured with representative records. Keep capacity for HNSW creation/rebuilds and temporarily duplicated corpora during embedding changes.

Optimise after measuring: retain production availability, right-size task memory and DB class, use S3 endpoints to avoid unnecessary NAT data processing, bound logs, schedule nonproduction shutdowns where useful, and evaluate Savings Plans only after a stable baseline. Do not cut the second API task or database availability merely to make a production estimate resemble a demo VM price.

## 16. Troubleshooting by symptom

| Symptom | Likely repository/deployment cause | First checks |
|---|---|---|
| ALB target unhealthy with 400 | Health probe Host is a private IP not in allowed hosts | Exact-path health middleware and ALB probe settings; do not wildcard all hosts |
| Health check returns 301 | HTTPS redirect catches internal HTTP probe | Health middleware order/exact paths; preserve public HTTPS enforcement |
| CloudFront 502 | Origin TLS/certificate/Host mismatch or no healthy origin | Both certificate names, forwarded Host, origin DNS, ALB TLS listener and targets |
| API returns SPA HTML | Wrong behaviour priority or global error-page rewrite | `/api` + `/api/*` behaviours and error handling |
| Login works, refresh loops | Cookie/header omitted or cached; bad CSRF/origin configuration | Cookie path/Secure, Host/proto, CloudFront forwarding, no-store, token blacklist and CSRF |
| Staff share or evade throttle limits | Cache local/stale, spoofable or inconsistent client IP | Shared primary cache and trusted identity middleware/function |
| S3 reported “not configured” despite task role | Current adapter still requires static keys | `StorageConfig.missing` and boto3 credential construction |
| Presigned URL gives AccessDenied | Object/key missing, role/KMS deny, credential expiry or VPC-only bucket policy | Actual object/version, task role/key policy, signed URL age and SourceVpce conditions |
| Photos/attachments intermittently 404 | Task-local file storage | All read/write paths, object migration completeness, expiring-link logic |
| Resume batch looks stalled only sometimes | Status uses a different process's in-memory queue | Replace process-local queue status with DB job/heartbeat state |
| Jobs disappear after deployment | Threads or JD input bytes existed only in the old process | Durable S3 intake, outbox, queues, worker leases and restart reconciliation |
| Upload 413 or WAF 403 | Total body cap or managed body-size rule | File/batch limits, multipart overhead, WAF oversize rules, direct-S3 workflow |
| SSE arrives all at once | Proxy buffering/compression middleware or wrong frontend client | Streaming headers, `curl -N`, proxy settings, fetch-based client |
| SSE/AI fails at a fixed duration | CloudFront/ALB inactivity or completion timeout; blocked workers | Heartbeats during tool calls, total deadlines, origin settings and concurrency |
| SMTP seems successful but no real email | `EMAIL_HOST` empty or safe recipient set | Runtime configuration and delivery records; never log the secret |
| Password reset never arrives | Existing feature only records the request | Implement the complete recovery workflow; SMTP alone does not fix it |
| Real calls receive forged events | Empty webhook secret currently accepts requests | Fail-closed verification, secret injection, edge routing and event deduplication |
| Worker cannot connect to provider | Private subnet lacks NAT/DNS/egress; AWS endpoint is insufficient | Same-AZ route, DNS resolution, firewall policy and vendor availability |
| Migration cannot create `vector` | Extension missing/unsupported or insufficient bootstrap rights | Available extension version; preinstall with authorised role |
| Search quality collapses after model change | Mixed embedding spaces or changed dimensions | Explicit provider/model/version, corpus migration and index compatibility |
| `CACHE_URL` causes import/connect error | Redis client absent, backend mismatch, TLS/auth failure | Declared dependencies, exact backend, endpoint and certificate validation |
| Tasks fail before application starts | ECR/secrets/logs permission or network failure | Execution role, KMS, endpoints/NAT, log group and ECS stopped reason |
| Disk/permission errors on Fargate | Read-only root, root-owned scratch mount, legacy local writes | Non-root UID, `/tmp` volume ownership, S3 refactor and scratch limits |
| Deployed service is stable but old code runs | Circuit breaker rolled back | Expected task ARN, actual running digest, deployment events and release manifest |

## 17. Validation performed during this review

Validation used the repository's already-installed local dependencies. A fresh clean-room dependency install, final hardened container build, AWS deployment, live provider test, penetration test, and load test were **not** performed.

| Check | Result |
|---|---|
| Frontend `npm run build` | Passed, including TypeScript compilation; Vite warned about chunks over 500 kB |
| Frontend `npm run lint` | Passed |
| Frontend test suite, initial parallel run | 196 passed, 1 timed out (`ApplicationsTable` email-selection test) |
| Timed-out test rerun in isolation | Both tests in that file passed |
| Full frontend rerun with `--maxWorkers=2` | **197 tests passed across 37 files**; React `act(...)` warnings remain |
| Backend `ruff check .` | Passed |
| Backend `python -m pip check` | Passed; this checks installed package consistency, not vulnerabilities |
| Backend pytest against a temporary isolated PostgreSQL 16/pgvector container | **1,132 tests passed**; temporary database container removed after the run |
| `manage.py check --deploy` with production settings and explicit placeholder review HTTPS/cookie/host values | Four warnings: three OpenAPI enum-name collisions and intentional HSTS preload disabled (`security.W021`) |
| AWS infrastructure / external providers | Not provisioned or exercised during this documentation task |

The deploy check used review-only configuration and no production database connection; it is not evidence that a real AWS configuration is correct. Resolve the enum warnings, document the deliberate preload decision, improve the flaky test/warnings, and repeat all release gates against the prepared production code and clean build artifacts.

The frontend build is about 7.3 MiB locally and includes large 3D/UI chunks. Measure cold login on the target devices/network and optimise expensive assets or splitting if necessary. Do not merely raise the bundle warning threshold and call it a performance fix.

## 18. Go-live checklist and implementation order

### Phase A — application readiness

- [ ] Durable job/outbox model, producer/consumer commands, retries, leases, cancellation and recovery implemented.
- [ ] Resume batch status works through any API task.
- [ ] Accepted resume/JD bytes, photos and support files persist in private S3.
- [ ] Task-role S3 credentials work without static keys.
- [ ] Shared cache, explicit client dependency, TLS and trusted proxy identity tested.
- [ ] Secure cookies, CSRF, expiring private links and download role policy tested.
- [ ] Liveness/readiness, serving concurrency, AI deadlines and SSE heartbeats implemented.
- [ ] Mock/demo features removed or clearly disabled; real staff accounts bootstrapped.
- [ ] Password recovery completed or a documented controlled alternative exists.
- [ ] Email/voice features disabled until their reliability/security acceptance passes.
- [ ] Runtime dependencies/images locked, scanned, and tested as final artifacts.

### Phase B — infrastructure readiness

- [ ] Separate staging/production accounts, MFA, ownership and budgets configured.
- [ ] Terraform state encrypted/versioned/locked; reviewed plan and resource deletion protections in place.
- [ ] Two-AZ VPC, private tasks/data, outbound routes and scoped security groups verified.
- [ ] RDS pgvector/TLS, separate DB roles, backup retention and connection budget verified.
- [ ] Private S3/OAC/KMS/lifecycle policies tested, including presigned browser downloads.
- [ ] Queues, DLQs, cache failover and alarms configured.
- [ ] Task/execution/migration/CI roles have reviewed least-privilege policies.
- [ ] CloudFront/ALB certificates, routing, headers, cache policies and origin restriction verified.
- [ ] WAF and browser security policies tested against uploads, streams and login.
- [ ] CloudWatch/audit/security log retention and alert ownership established.

### Phase C — release acceptance

- [ ] Clean build and tests pass; all approved artifacts/digests archived.
- [ ] Migration rehearsed against realistic data; compatibility and rollback plan recorded.
- [ ] Exactly one production migration completes successfully before service rollout.
- [ ] Data/file migration checksums, references and vector corpus verified if importing data.
- [ ] Intended API/worker task revisions are healthy; frontend deployed HTML last.
- [ ] Role, auth, upload/search, media, streaming, reports and integration acceptance tests pass.
- [ ] Worker termination, rolling deployment, cache/RDS failover and recovery tests pass.
- [ ] Restore and rollback drill demonstrates the agreed recovery objectives.
- [ ] Real outbound communication enabled only after controlled acceptance.
- [ ] On-call owner has access to dashboards, runbooks and scoped recovery tools.

**Launch criterion:** production traffic starts only after the P0 items and applicable feature gates are complete. A successful container start or a passing health endpoint is not sufficient.

## 19. Official references

AWS behaviour and recommendations were checked against primary documentation during this review. Recheck current service support, quotas, SDK/provider versions, regional availability and prices when implementing.

- [Django deployment checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/).
- [Fargate security best practices](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-fargate.html).
- [Fargate task-definition parameters](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html).
- [ECS task IAM roles](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html) and [Secrets Manager injection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html).
- [ECS deployment circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html) and [service autoscaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html).
- [CloudFront S3 origin access control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).
- [Restricting ALB origins to CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancer.html).
- [CloudFront origin settings and timeouts](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html) and [cache behaviours](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html).
- [ALB health-check troubleshooting](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-troubleshooting.html).
- [RDS PostgreSQL extensions](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.Extensions.html), [TLS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html), and [point-in-time restore](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html).
- [SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html).
- [ElastiCache TLS](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/in-transit-encryption.html).
- [WAF oversize request handling](https://docs.aws.amazon.com/waf/latest/developerguide/waf-oversize-request-components.html).
- [SES production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).
- [GitHub OIDC for AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).
- [Terraform S3 state backend and locking](https://developer.hashicorp.com/terraform/language/backend/s3).
- [AWS Pricing Calculator](https://calculator.aws/).
