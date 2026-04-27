// Live smoke test for the OpenAI embeddings integration. Hits the API once per
// sample, then sanity-checks dimensions and cosine similarity ordering.
// Run: node --env-file=.env.local scripts/smoke-embeddings.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const OpenAI = require('openai').default;

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Missing OPENAI_API_KEY. Run with: node --env-file=.env.local scripts/smoke-embeddings.mjs');
  process.exit(1);
}

const model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
const EXPECTED_DIMENSIONS = 1536;
const client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 2 });

async function embed(text) {
  const t0 = Date.now();
  const res = await client.embeddings.create({
    model,
    input: text,
    encoding_format: 'float',
  });
  const ms = Date.now() - t0;
  const vector = res.data[0]?.embedding;
  return { vector, ms, usage: res.usage };
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const samples = [
  ['POLITICS_A', 'The Federal Reserve raised interest rates by a quarter point, citing persistent inflation concerns.'],
  ['POLITICS_B', 'Citing ongoing inflation, the Fed lifted its benchmark rate by 25 basis points.'],
  ['SPORTS',     'The Lakers defeated the Celtics in overtime to clinch the conference championship.'],
];

console.log(`model: ${model}`);
console.log(`expected dims: ${EXPECTED_DIMENSIONS}\n`);

const results = [];
for (const [label, text] of samples) {
  const { vector, ms, usage } = await embed(text);
  const ok = Array.isArray(vector) && vector.length === EXPECTED_DIMENSIONS;
  console.log(`[${label.padEnd(10)}] dims=${vector?.length ?? 'n/a'}  ${ok ? 'OK' : 'MISMATCH'}  ${ms}ms  promptTokens=${usage?.prompt_tokens}`);
  results.push({ label, vector });
}

const [a, b, c] = results;
const simAB = cosine(a.vector, b.vector);
const simAC = cosine(a.vector, c.vector);
const simBC = cosine(b.vector, c.vector);

console.log('\ncosine similarities:');
console.log(`  POLITICS_A vs POLITICS_B : ${simAB.toFixed(4)}  (expect highest)`);
console.log(`  POLITICS_A vs SPORTS     : ${simAC.toFixed(4)}`);
console.log(`  POLITICS_B vs SPORTS     : ${simBC.toFixed(4)}`);

const semanticOrderingOk = simAB > simAC && simAB > simBC;
console.log(`\nsemantic ordering: ${semanticOrderingOk ? 'OK (related pair scored highest)' : 'UNEXPECTED'}`);

if (!semanticOrderingOk) process.exit(2);
