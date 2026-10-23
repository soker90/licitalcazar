import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertDocumentSyncComplete } = require('./sync-documentos.js');

describe('sync-documentos complete mode', () => {
  it('fails when complete mode has network errors', () => {
    expect(() => assertDocumentSyncComplete({ allMode: true, networkErrors: 2 }))
      .toThrow(/Document sync incomplete: 2 contract\(s\) failed/);
  });

  it('allows incremental mode to finish with retryable network errors', () => {
    expect(() => assertDocumentSyncComplete({ allMode: false, networkErrors: 2 }))
      .not.toThrow();
  });

  it('allows complete mode when every contract was fetched', () => {
    expect(() => assertDocumentSyncComplete({ allMode: true, networkErrors: 0 }))
      .not.toThrow();
  });
  it('fails when complete mode has suspicious empty pages', () => {
    expect(() => assertDocumentSyncComplete({ allMode: true, networkErrors: 0, suspiciousEmptyPages: 2 }))
      .toThrow(/Document sync incomplete: 2 contract\(s\) returned an invalid or incomplete document page/);
  });

  it('allows complete mode with explicit empty snapshots awaiting confirmation', () => {
    expect(() => assertDocumentSyncComplete({ allMode: true, networkErrors: 0, suspiciousEmptyPages: 0 }))
      .not.toThrow();
  });

});
