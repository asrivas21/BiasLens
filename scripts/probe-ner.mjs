// Probe what entity types wink-eng-lite-web-model emits for political/news text.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const winkNLP = require('wink-nlp');
const model = require('wink-eng-lite-web-model');

const nlp = winkNLP(model);
const its = nlp.its;

const text = [
  'President Joe Biden met with Vladimir Putin in Geneva on Wednesday to discuss',
  'tensions between Russia and Ukraine. The Federal Reserve, led by Chair Jerome',
  'Powell, announced that interest rates would remain at 4.5 percent. Apple Inc.',
  'and Microsoft both reported record earnings in California, with revenues',
  'exceeding $100 billion in 2024. The European Union and NATO have expressed',
  'concern about the situation in Eastern Europe.',
].join(' ');

const doc = nlp.readDoc(text);
const ents = doc.entities().out(its.detail);
console.log('total entities:', ents.length);
console.log(JSON.stringify(ents, null, 2));
console.log('---');
const types = new Set(ents.map((e) => e.type));
console.log('unique types:', [...types]);
console.log('---');
console.log('per-entity span (start/end via tokens):');
doc.entities().each((ent) => {
  const span = ent.tokens();
  const first = span.itemAt(0);
  const last = span.itemAt(span.length() - 1);
  console.log(`  type=${ent.out(its.type)} value="${ent.out()}"  firstTokenIdx=${first.index()} lastTokenIdx=${last.index()}`);
});
