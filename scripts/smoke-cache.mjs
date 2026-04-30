// Smoke test for the two-tier cache. Runs three requests against /api/analyze:
//   1. Initial submission of a sample (expected: cache miss, full pipeline)
//   2. Identical resubmission (expected: exact-cache hit, same id)
//   3. Paraphrased resubmission (expected: semantic-cache hit, same id)
// A per-run nonce is prepended to both samples so the test exercises a fresh
// cache state on every invocation (otherwise a prior run's writes would mask
// the semantic-lookup code path with exact-cache hits).
// Start the dev server first.
// Run: node scripts/smoke-cache.mjs

const URL = process.env.URL ?? 'http://localhost:3000/api/analyze';

const RUN_ID = crypto.randomUUID();
const NONCE = `[smoke run ${RUN_ID}] `;

const ORIGINAL = NONCE + 'Greedy corporate landlords like BlackRock are once again squeezing working families dry, hiking rents in New York and Los Angeles to obscene levels while CEOs pocket record bonuses. Senator Bernie Sanders called the runaway housing crisis the predictable result of decades of unchecked corporate greed and a rigged system that prioritizes Wall Street profits over basic human dignity. It is long past time we stopped coddling these billionaire predators.';

const PARAPHRASE = NONCE + 'Avaricious corporate property owners such as BlackRock are yet again wringing working-class households dry, raising rents in NYC and LA to outrageous levels while chief executives collect record-breaking bonuses. Senator Bernie Sanders described the out-of-control housing emergency as the foreseeable outcome of decades of unrestrained corporate avarice and a manipulated system that puts Wall Street earnings ahead of fundamental human worth. The era of indulging these billionaire profiteers must come to an end.';

async function submit(label, text) {
  const t0 = Date.now();
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const ms = Date.now() - t0;
  const body = await res.json();
  console.log('\n' + '='.repeat(72));
  console.log('  ' + label);
  console.log('='.repeat(72));
  console.log(`HTTP ${res.status}  request-id=${res.headers.get('x-request-id')}  (${ms}ms)`);
  if (!res.ok) {
    console.log(JSON.stringify(body, null, 2));
    return null;
  }
  console.log(`id        : ${body.id}`);
  console.log(`cached    : ${body.cached}`);
  console.log(`leaning   : ${body.llm.leaning}  (biasScore ${body.llm.biasScore})`);
  console.log(`createdAt : ${body.createdAt}`);
  return body;
}

console.log(`run id: ${RUN_ID}`);
const a = await submit('1. INITIAL SUBMISSION (expect cached=false, slow)', ORIGINAL);
const b = await submit('2. EXACT RESUBMISSION (expect cached=true, fast, same id)', ORIGINAL);
const c = await submit('3. PARAPHRASE (expect cached=true via semantic, same id)', PARAPHRASE);

console.log('\n' + '='.repeat(72));
console.log('  VERIFICATION');
console.log('='.repeat(72));
if (!a || !b || !c) {
  console.log('one or more requests failed; aborting verification');
  process.exit(1);
}

const initialOk = a.cached === false;
const exactOk = b.cached === true && b.id === a.id;
const semanticOk = c.cached === true && c.id === a.id;

console.log(`initial miss       : ${initialOk  ? 'OK'  : 'FAIL'}  (cached=${a.cached})`);
console.log(`exact cache hit    : ${exactOk    ? 'OK'  : 'FAIL'}  (cached=${b.cached}, idMatch=${b.id === a.id})`);
console.log(`semantic cache hit : ${semanticOk ? 'OK'  : 'FAIL'}  (cached=${c.cached}, idMatch=${c.id === a.id})`);

if (!initialOk || !exactOk || !semanticOk) process.exit(2);
