/// <reference path="../.astro/types.d.ts" />

// wink-lemmatizer ships no TypeScript types — declare the surface we use.
declare module 'wink-lemmatizer' {
  export function noun(word: string): string;
  export function verb(word: string): string;
  export function adjective(word: string): string;
  const _default: {
    noun: (word: string) => string;
    verb: (word: string) => string;
    adjective: (word: string) => string;
  };
  export default _default;
}
