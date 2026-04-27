import 'server-only';
import winkNLP, { type WinkMethods } from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

let instance: WinkMethods | null = null;

export function getWinkNlp(): WinkMethods {
  if (instance === null) {
    instance = winkNLP(model);
  }
  return instance;
}
