const URL = process.env.URL ?? 'http://localhost:3000/api/analyze';

const cases = [
  [
    'NEUTRAL / FACTUAL',
    'The Federal Reserve announced on Wednesday that it would hold interest rates steady at a range of 4.25 to 4.5 percent, citing mixed economic indicators. Chair Jerome Powell said the committee would continue to monitor inflation data before making further decisions. The decision was unanimous among voting members.',
  ],
  [
    'LEFT-LEANING FRAMING',
    'Greedy corporate landlords are once again squeezing working families dry, hiking rents to obscene levels while CEOs pocket record bonuses. The runaway housing crisis is the predictable result of decades of unchecked corporate greed and a rigged system that prioritizes Wall Street profits over basic human dignity. It is long past time we stopped coddling these billionaire predators.',
  ],
  [
    'RIGHT-LEANING FRAMING',
    'Radical activists and out-of-touch bureaucrats are once again pushing a reckless open-borders agenda that puts hard-working American families at risk. While ordinary citizens struggle to make ends meet, the political elite continue to lavish taxpayer dollars on illegal entrants. It is time to restore law, order, and common sense to a country that desperately needs it.',
  ],
];

for (const [label, text] of cases) {
  console.log('\n' + '='.repeat(68));
  console.log('  ' + label);
  console.log('='.repeat(68));
  const t0 = Date.now();
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const ms = Date.now() - t0;
  const body = await res.json();
  console.log(`HTTP ${res.status}  request-id=${res.headers.get('x-request-id')}  (${ms}ms)`);
  if (!res.ok) { console.log(JSON.stringify(body, null, 2)); continue; }
  const llm = body.llm;
  console.log(`leaning   : ${llm.leaning}`);
  console.log(`biasScore : ${llm.biasScore}`);
  console.log(`framing   : ${llm.framing}`);
  console.log(`loaded (${llm.loadedLanguage.length} phrases):`);
  for (const p of llm.loadedLanguage) {
    console.log(`   - "${p.phrase}" — ${p.reason}`);
  }
  console.log('explanation:');
  console.log('  ' + llm.explanation);
}
