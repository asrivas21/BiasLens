declare module 'wink-sentiment' {
  export interface WinkSentimentToken {
    value: string;
    tag: 'word' | 'hashtag' | 'emoji' | 'emoticon' | 'punctuation' | 'symbol' | string;
    score?: number;
    negation?: boolean;
    grouped?: number;
  }

  export interface WinkSentimentResult {
    score: number;
    normalizedScore: number;
    tokenizedPhrase?: WinkSentimentToken[];
  }

  export default function sentiment(phrase: string): WinkSentimentResult;
}
