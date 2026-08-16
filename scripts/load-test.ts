import { performance } from 'node:perf_hooks';

const base = process.env.BASE_URL ?? 'http://localhost:8080';
const durationSeconds = Number(process.env.DURATION_SECONDS ?? 10);
const batchSize = Number(process.env.BATCH_SIZE ?? 500);
const targetRps = Number(process.env.TARGET_RPS ?? 15000);

function makeLog(i: number) {
  return {
    timestamp: new Date(Date.now() - (i % 2_592_000_000)).toISOString(),
    level: ['debug', 'info', 'warn', 'error'][i % 4],
    service: ['api', 'checkout', 'auth', 'worker'][i % 4],
    message: `load-test message ${i}`,
    attributes: { user_id: String(i % 10000), region: ['eu-west', 'us-east', 'ap-south'][i % 3], retries: i % 4 },
  };
}

async function main() {
  const start = performance.now();
  let sent = 0;
  let accepted = 0;
  let failed = 0;
  let nextId = 0;
  const end = start + durationSeconds * 1000;
  const requests: Promise<void>[] = [];
  const interval = 1000 / Math.max(1, Math.ceil(targetRps / batchSize));
  while (performance.now() < end) {
    const body = { logs: Array.from({ length: batchSize }, () => makeLog(nextId++)) };
    sent += body.logs.length;
    const t = performance.now();
    requests.push(fetch(`${base}/logs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(async (r) => { if (r.ok) accepted += Number((await r.json() as { accepted: number }).accepted); else failed++; })
      .catch(() => { failed++; })
      .finally(() => { void t; }));
    await new Promise((r) => setTimeout(r, interval));
  }
  await Promise.all(requests);
  const elapsed = (performance.now() - start) / 1000;
  console.log(JSON.stringify({ sent, accepted, failed, elapsed_seconds: elapsed, accepted_logs_per_second: accepted / elapsed }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
