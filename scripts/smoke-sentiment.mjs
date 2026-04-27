// Offline smoke test for the wink-sentiment integration. No HTTP / no LLM call.
// Run: node scripts/smoke-sentiment.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sentiment = require('wink-sentiment');
const winkNLP = require('wink-nlp');
const model = require('wink-eng-lite-web-model');

const nlp = winkNLP(model);
const AFINN_MAX_ABS = 5;
const clamp = (v) => Math.max(-1, Math.min(1, v));
const norm = (v) => Number(clamp(v / AFINN_MAX_ABS).toFixed(4));

const samples = [
  ['NEUTRAL', 'The Federal Reserve announced on Wednesday that it would hold interest rates steady at a range of 4.25 to 4.5 percent. The decision was unanimous among voting members.'],
  ['LEFT', 'Greedy corporate landlords are once again squeezing working families dry, hiking rents to obscene levels while CEOs pocket record bonuses. The runaway housing crisis is the predictable result of decades of unchecked corporate greed.'],
  ['RIGHT', 'Radical activists and out-of-touch bureaucrats are once again pushing a reckless open-borders agenda that puts hard-working American families at risk. It is time to restore law, order, and common sense.'],
];

for (const [label, text] of samples) {
  console.log(`\n========== ${label} ==========`);
  const overall = sentiment(text);
  console.log(`overall normalizedScore=${overall.normalizedScore.toFixed(3)}  -> normalized=${norm(overall.normalizedScore)}`);
  const sents = nlp.readDoc(text).sentences().out().filter((s) => s.trim().length > 0);
  console.log(`sentences: ${sents.length}`);
  for (const s of sents) {
    const r = sentiment(s);
    const flagged = (r.tokenizedPhrase ?? [])
      .filter((t) => t.tag === 'word' && typeof t.score === 'number' && t.score !== 0)
      .map((t) => t.value.toLowerCase());
    console.log(`  [${norm(r.normalizedScore).toString().padStart(7)}] ${s}`);
    if (flagged.length) console.log(`            flagged=${JSON.stringify(flagged)}`);
  }
}
