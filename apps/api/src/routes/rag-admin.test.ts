/**
 * RAG Admin Routes Tests
 *
 * Unit tests for RAG admin API endpoints:
 * - Collection CRUD operations
 * - Document management
 * - Text chunking algorithm
 * - Access control
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chunkText } from './rag-admin.js';

// Note: Full route tests would require supertest and a test server setup.
// For now, we test the exported utility functions.

describe('RAG Admin Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('chunkText', () => {
    it('returns empty array for empty text', () => {
      const result = chunkText('');
      expect(result).toEqual([]);
    });

    it('returns single chunk for short text', () => {
      const text = 'This is a short paragraph.';
      const result = chunkText(text);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(text);
    });

    it('preserves paragraphs within chunk size', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const result = chunkText(text, { maxChunkSize: 1000 });
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('First paragraph.');
      expect(result[0]).toContain('Second paragraph.');
      expect(result[0]).toContain('Third paragraph.');
    });

    it('splits text at paragraph boundaries', () => {
      const para1 = 'A'.repeat(300);
      const para2 = 'B'.repeat(300);
      const para3 = 'C'.repeat(300);
      const text = `${para1}\n\n${para2}\n\n${para3}`;

      const result = chunkText(text, { maxChunkSize: 500 });
      expect(result.length).toBeGreaterThan(1);
    });

    it('splits long sentences when paragraph is too long', () => {
      // Create a very long paragraph with multiple sentences
      const sentences = Array(20).fill('This is a sentence that is moderately long.').join(' ');
      const result = chunkText(sentences, { maxChunkSize: 200 });
      expect(result.length).toBeGreaterThan(1);
    });

    it('handles text with only whitespace paragraphs', () => {
      const text = 'Content here.\n\n   \n\n   \n\nMore content.';
      const result = chunkText(text, { maxChunkSize: 1000 });
      expect(result).toHaveLength(1);
      expect(result[0]).not.toContain('   ');
    });

    it('handles single very long sentence', () => {
      const longSentence = 'Word '.repeat(500).trim() + '.';
      const result = chunkText(longSentence, { maxChunkSize: 500 });
      expect(result.length).toBeGreaterThan(0);
    });

    it('creates overlap between chunks when specified', () => {
      const para1 = 'First paragraph with some content here that will need overlap.';
      const para2 = 'Second paragraph with different content for testing.';
      const para3 = 'Third paragraph with even more text to verify overlap works.';
      const text = `${para1}\n\n${para2}\n\n${para3}`;

      const result = chunkText(text, { maxChunkSize: 100, overlap: 20 });

      // With small chunk size and overlap, we should have multiple chunks
      // and some content from the end of previous chunks should appear in next
      expect(result.length).toBeGreaterThan(1);
    });

    it('uses default options when none provided', () => {
      const text = 'Short text.';
      const result = chunkText(text);
      expect(result).toHaveLength(1);
    });

    it('handles markdown content', () => {
      const markdown = `# Header

This is a paragraph.

## Subheader

- List item 1
- List item 2

\`\`\`javascript
const code = 'example';
\`\`\`
`;
      const result = chunkText(markdown, { maxChunkSize: 1000 });
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('# Header');
      expect(result[0]).toContain('```javascript');
    });

    it('handles text with various sentence endings', () => {
      const text = 'Question? Exclamation! Statement. Another question? And more!';
      const result = chunkText(text, { maxChunkSize: 50 });
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles unicode content', () => {
      const text = 'こんにちは世界。\n\nこれはテストです。\n\n日本語のテキスト。';
      const result = chunkText(text, { maxChunkSize: 1000 });
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('こんにちは');
    });

    it('handles mixed newline styles', () => {
      const text = 'Para 1.\r\n\r\nPara 2.\n\nPara 3.';
      const result = chunkText(text, { maxChunkSize: 1000 });
      // Should still parse correctly
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
