// Offline smoke test for the compromise + wink NER pipeline. No HTTP / no LLM call.
// Mirrors the merge/dedup logic in lib/nlp/ner.ts so we can validate offsets
// and entity-type coverage without booting Next.js.
// Run: node scripts/smoke-ner.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const nlp = require('compromise');
const winkNLP = require('wink-nlp');
const model = require('wink-eng-lite-web-model');

const wink = winkNLP(model);
const its = wink.its;

const WINK_TYPE_MAP = {
  MONEY: 'MONEY',
  DATE: 'DATE',
  TIME: 'TIME',
  PERCENT: 'PERCENT',
  CARDINAL: 'CARDINAL',
};
const TRAILING_PUNCT_RE = /[\s.,;:!?'"\-)\]]+$/;
const LEADING_PUNCT_RE = /^[\s.,;:!?'"\-(\[]+/;

function pushFromCompromise(out, text, matches, type) {
  if (!Array.isArray(matches)) return;
  for (const m of matches) {
    const rawStart = m?.offset?.start;
    const length = m?.offset?.length;
    if (typeof rawStart !== 'number' || typeof length !== 'number' || length <= 0) continue;
    const rawEnd = rawStart + length;
    if (rawStart < 0 || rawEnd > text.length) continue;
    const slice = text.slice(rawStart, rawEnd);
    const lead = slice.match(LEADING_PUNCT_RE)?.[0].length ?? 0;
    const trail = slice.match(TRAILING_PUNCT_RE)?.[0].length ?? 0;
    const start = rawStart + lead;
    const end = rawEnd - trail;
    if (end <= start) continue;
    out.push({ text: text.slice(start, end), type, start, end });
  }
}

function pushFromWink(out, text) {
  const doc = wink.readDoc(text);
  const cursors = new Map();
  doc.entities().each((ent) => {
    const detail = ent.out(its.detail);
    if (!detail || typeof detail !== 'object') return;
    const mapped = WINK_TYPE_MAP[detail.type];
    if (!mapped) return;
    const value = detail.value;
    const fromIndex = cursors.get(value) ?? 0;
    const start = text.indexOf(value, fromIndex);
    if (start === -1) return;
    const end = start + value.length;
    cursors.set(value, end);
    out.push({ text: value, type: mapped, start, end });
  });
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function dedupeAndSort(entities) {
  const sorted = [...entities].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end;
  });
  const kept = [];
  for (const ent of sorted) {
    if (kept.some((k) => overlaps(k, ent))) continue;
    kept.push(ent);
  }
  return kept;
}

function extractEntities(text) {
  if (text.trim().length === 0) return [];
  const out = [];
  const cdoc = nlp(text);
  pushFromCompromise(out, text, cdoc.people().json({ offset: true }), 'PERSON');
  pushFromCompromise(out, text, cdoc.organizations().json({ offset: true }), 'ORG');
  pushFromCompromise(out, text, cdoc.places().json({ offset: true }), 'GPE');
  pushFromWink(out, text);
  return dedupeAndSort(out);
}

const samples = [
  [
    'NEUTRAL',
    'The Federal Reserve announced on Wednesday that it would hold interest rates steady at a range of 4.25 to 4.5 percent. Chair Jerome Powell said in Washington that the decision was unanimous.',
  ],
  [
    'LEFT',
    'Greedy corporate landlords like BlackRock are squeezing working families dry, hiking rents by 30% in New York and Los Angeles. Senator Bernie Sanders called the trend a national disgrace on Tuesday.',
  ],
  [
    'RIGHT',
    'Radical activists and out-of-touch bureaucrats in Washington are pushing a reckless open-borders agenda. President Donald Trump promised on March 5, 2025 to commit $2 billion to restore order at the southern border.',
  ],
];

for (const [label, text] of samples) {
  console.log(`\n========== ${label} ==========`);
  console.log(text);
  const ents = extractEntities(text);
  console.log(`\nentities: ${ents.length}`);
  for (const e of ents) {
    const slice = text.slice(e.start, e.end);
    const ok = slice === e.text ? 'OK' : 'MISMATCH';
    console.log(`  [${e.type.padEnd(8)}] (${String(e.start).padStart(3)}, ${String(e.end).padStart(3)})  ${JSON.stringify(e.text)}  -> ${ok}`);
  }
}
