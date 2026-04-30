// Diagnostic for tuning SEMANTIC_CACHE_THRESHOLD. Embeds the smoke-cache
// ORIGINAL/PARAPHRASE pair plus a same-topic-different-take control and an
// unrelated control, then prints all pairwise cosine similarities so we can
// pick a threshold that catches the paraphrase without catching the
// different-take.
// Run: node --env-file=.env.local scripts/probe-similarity.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const OpenAI = require('openai').default;

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Missing OPENAI_API_KEY. Run with: node --env-file=.env.local scripts/probe-similarity.mjs');
  process.exit(1);
}
const model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
const client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 2 });

const samples = {
  ORIGINAL:
    'Greedy corporate landlords like BlackRock are once again squeezing working families dry, hiking rents in New York and Los Angeles to obscene levels while CEOs pocket record bonuses. Senator Bernie Sanders called the runaway housing crisis the predictable result of decades of unchecked corporate greed and a rigged system that prioritizes Wall Street profits over basic human dignity. It is long past time we stopped coddling these billionaire predators.',
  PARAPHRASE:
    'Avaricious corporate property owners such as BlackRock are yet again wringing working-class households dry, raising rents in NYC and LA to outrageous levels while chief executives collect record-breaking bonuses. Senator Bernie Sanders described the out-of-control housing emergency as the foreseeable outcome of decades of unrestrained corporate avarice and a manipulated system that puts Wall Street earnings ahead of fundamental human worth. The era of indulging these billionaire profiteers must come to an end.',
  // Same topic (corporate landlords / housing), opposite political framing.
  // We do NOT want this to hit the cache.
  DIFFERENT_TAKE:
    'Institutional investors such as BlackRock have provided much-needed liquidity to the housing market, professionalizing rental management in cities like New York and Los Angeles. Critics like Senator Bernie Sanders mischaracterize this as predatory, but the data shows that corporate landlords offer better-maintained units and more responsive service than mom-and-pop owners. Demonizing private capital will only deepen the housing shortage.',
  UNRELATED:
    'The Lakers defeated the Celtics in overtime to clinch the conference championship.',
};

async function embed(text) {
  const res = await client.embeddings.create({ model, input: text, encoding_format: 'float' });
  return res.data[0].embedding;
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

const labels = Object.keys(samples);
const vectors = {};
for (const label of labels) {
  vectors[label] = await embed(samples[label]);
  console.log(`embedded ${label}`);
}

console.log('\npairwise cosine similarity:');
for (let i = 0; i < labels.length; i++) {
  for (let j = i + 1; j < labels.length; j++) {
    const sim = cosine(vectors[labels[i]], vectors[labels[j]]);
    console.log(`  ${labels[i].padEnd(15)} vs ${labels[j].padEnd(15)} : ${sim.toFixed(4)}`);
  }
}

console.log('\nthreshold tuning: pick a value above DIFFERENT_TAKE-vs-ORIGINAL but below PARAPHRASE-vs-ORIGINAL.');
