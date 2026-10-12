declare module 'word-extractor' {
  export default class WordExtractor {
    extract(source: Uint8Array): Promise<{ getBody(): string }>;
  }
}
