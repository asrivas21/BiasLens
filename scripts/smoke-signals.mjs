// Smoke test for the combined signals layer. Hits the live /api/analyze
// endpoint (start the dev server first) and pretty-prints the new `signals`
// block alongside the headline LLM verdict, so the heuristic weights for
// chargedLanguageScore can be eyeballed against neutral/left/right samples.
// Run: node scripts/smoke-signals.mjs

const URL = process.env.URL ?? 'http://localhost:3000/api/analyze';

const cases = [
  [
    'NEUTRAL / FACTUAL',
    'The Federal Reserve announced on Wednesday that it would hold interest rates steady at a range of 4.25 to 4.5 percent, citing mixed economic indicators. Chair Jerome Powell said the committee would continue to monitor inflation data before making further decisions. The decision was unanimous among voting members.',
  ],
  [
    'LEFT-LEANING FRAMING',
    'Greedy corporate landlords like BlackRock are once again squeezing working families dry, hiking rents in New York and Los Angeles to obscene levels while CEOs pocket record bonuses. Senator Bernie Sanders called the runaway housing crisis the predictable result of decades of unchecked corporate greed and a rigged system that prioritizes Wall Street profits over basic human dignity. It is long past time we stopped coddling these billionaire predators.',
  ],
  [
    'RIGHT-LEANING FRAMING',
    'Radical activists and out-of-touch bureaucrats in Washington are once again pushing a reckless open-borders agenda that puts hard-working American families at risk. President Donald Trump promised to commit $2 billion to restore order at the southern border. While ordinary citizens struggle to make ends meet, the political elite continue to lavish taxpayer dollars on illegal entrants. It is time to restore law, order, and common sense.',
  ],
];

function fmt(n) {
  return n >= 0 ? `+${n.toFixed(3)}` : n.toFixed(3);
}

for (const [label, text] of cases) {
  console.log('\n' + '='.repeat(72));
  console.log('  ' + label);
  console.log('='.repeat(72));
  const t0 = Date.now();
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const ms = Date.now() - t0;
  const body = await res.json();
  console.log(`HTTP ${res.status}  request-id=${res.headers.get('x-request-id')}  (${ms}ms)`);
  if (!res.ok) {
    console.log(JSON.stringify(body, null, 2));
    continue;
  }

  const { signals, llm, nlp } = body;
  console.log(`leaning              : ${signals.leaning}`);
  console.log(`biasScore            : ${fmt(signals.biasScore)}`);
  console.log(`chargedLanguageScore : ${signals.chargedLanguageScore.toFixed(4)}`);
  console.log(`agreement            : ${signals.agreement}`);
  console.log(`  components -> sentiment.overall=${fmt(nlp.sentiment.overall)}  loadedPhrases=${llm.loadedLanguage.length}  flaggedTerms=${nlp.sentiment.perSentence.reduce((s, p) => s + p.flaggedTerms.length, 0)}`);

  console.log(`\nentitySentiment (${signals.entitySentiment.length}):`);
  for (const e of signals.entitySentiment) {
    console.log(`  [${e.type.padEnd(8)}] ${e.entity.padEnd(28)} mentions=${e.mentions}  avgSent=${fmt(e.avgSentiment)}`);
    if (e.loadedPhrasesNearby.length > 0) {
      console.log(`     loaded   : ${e.loadedPhrasesNearby.map((p) => JSON.stringify(p)).join(', ')}`);
    }
    if (e.flaggedTermsNearby.length > 0) {
      console.log(`     flagged  : ${e.flaggedTermsNearby.map((t) => JSON.stringify(t)).join(', ')}`);
    }
  }
}
