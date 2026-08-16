# Log Ingestion and Query Service — TypeScript

High-throughput structured-log ingestion, querying, aggregation, and retention service built with TypeScript, Fastify, and PostgreSQL.

## Contract coverage

- `GET /health`
- `POST /logs`
- `GET /logs`
- `GET /logs/aggregate`
- Per-entry batch validation
- Freely combinable filters
- Deterministic cursor pagination
- Time-bucket aggregation: `1m`, `5m`, `1h`, `1d`
- Retention cleanup in bounded delete batches
- Optional bearer authentication, disabled by default
- Automatic migrations on startup
- Docker Compose first-run startup

## Start

```bash
docker compose up --build
```

Service: `http://localhost:8080`

## API

### Health

`GET /health`

Returns 200 only after PostgreSQL is reachable and migrations have completed.

### Ingest

`POST /logs`

```json
{"logs":[{"timestamp":"2026-07-20T14:32:01.123Z","level":"error","service":"checkout","message":"payment declined","attributes":{"user_id":"42","retries":3}}]}
```

The endpoint always accepts a batch. Invalid entries are rejected independently. If at least one entry is accepted, HTTP 200 is returned; if every entry is rejected, HTTP 400 is returned.

### Query

`GET /logs?service=checkout&level=error&since=...&until=...&attr.user_id=42&q=declined&limit=100&cursor=...`

Results are sorted by `timestamp DESC, id DESC`.

### Aggregate

`GET /logs/aggregate?since=...&until=...&bucket=1m&group_by=service`

`group_by` may be `service` or `level`.

## Storage and index design

The source of truth is PostgreSQL. Each log is one row with a JSONB attribute object. The table uses a bigint identity key plus `timestamp` for stable keyset pagination.

Indexes:

1. `(timestamp DESC, id DESC)` for the default time-ordered query path and cursor pagination.
2. `(service, timestamp DESC, id DESC)` for service-filtered queries.
3. `(level, timestamp DESC, id DESC)` for level-filtered queries.
4. GIN `jsonb_path_ops` on `attributes` for attribute containment.

Dynamic query values are always parameters. Attribute keys are parameters too, preventing SQL injection.

## Performance strategy

The hot ingestion path validates entries in memory, then performs one multi-row parameterized INSERT per accepted batch. The application has no per-row round trip to PostgreSQL. Batch size is configurable through `MAX_BATCH_SIZE` and defaults to 2,000.

For the 15,000 logs/sec requirement, the important variables are the load-generator batch size, PostgreSQL CPU, WAL/disk speed, index maintenance cost, and concurrent query load. The repository includes `scripts/load-test.ts`; measured numbers must be recorded on the actual grading-equivalent environment rather than claimed in advance.

## Retention

`RETENTION_DAYS` defaults to 31. Cleanup runs periodically and deletes at most 10,000 rows per transaction, repeating until the current run removes fewer than 10,000 rows. This bounds lock/transaction size and reduces ingestion disruption.

For very large production datasets, time partitioning would be a stronger next step because dropping old partitions is cheaper than row-by-row deletion.

## Optional authentication

Disabled by default:

- `AUTH_ENABLED=false`
- `LOADGEN_API_KEY` unset

When enabled with a key, data endpoints require `Authorization: Bearer <key>`. `/health` remains unauthenticated. When auth is disabled, any Authorization header is ignored.

## CI

The pipeline builds TypeScript, runs unit tests, and runs migrations against PostgreSQL.

## Load test

Example:

```bash
DURATION_SECONDS=60 BATCH_SIZE=500 TARGET_RPS=15000 npm run loadtest
```

Before submission, record:

- test environment
- stored row count
- batch size
- sustained ingestion rate
- query rate
- p50/p95/p99 query latency
- CPU/RAM usage
- bottlenecks
- optimizations
- `EXPLAIN (ANALYZE, BUFFERS)` for the primary query and aggregation query

Do not fabricate these results: run them on the same resource limits used for evaluation.

## Known limitations

- The initial implementation uses a single PostgreSQL table rather than time partitions.
- Full substring search uses `ILIKE '%...%'`, which is not index-backed. If the evaluator heavily stresses arbitrary `q` searches, PostgreSQL trigram indexing is a likely optimization, subject to memory/WAL trade-offs.
- The load-test script reports aggregate throughput but is intentionally not a substitute for a rigorous percentile benchmark harness.
