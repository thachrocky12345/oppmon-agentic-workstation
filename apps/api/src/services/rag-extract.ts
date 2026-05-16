/**
 * RAG Text Extraction
 *
 * Single dispatch point for "buffer + mime → plain text". Used by both
 * the live ingest path (processDocumentExtraction in routes/rag-admin.ts)
 * and the backfill CLI (scripts/backfill-rag-context.ts) so they can never
 * drift on which file types are supported or how they're decoded.
 */

export class UnsupportedMimeTypeError extends Error {
  constructor(public readonly mime: string) {
    super(`Unsupported file type: ${mime}`);
    this.name = 'UnsupportedMimeTypeError';
  }
}

/**
 * Extract plain text from a file buffer based on its MIME type.
 *
 * Throws UnsupportedMimeTypeError on unrecognised types; the caller is
 * responsible for marking the document FAILED with a useful message.
 */
export async function extractText(
  mime: string,
  buffer: Buffer,
): Promise<string> {
  switch (mime) {
    case 'text/plain':
    case 'text/markdown':
      return buffer.toString('utf-8');

    case 'text/html':
      // Simple HTML to text (strip tags). Not robust against script/style
      // content but matches the original ingest behavior — improving it is
      // a separate concern.
      return buffer
        .toString('utf-8')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    case 'application/pdf': {
      // pdf-parse v2.x is class-based ESM: `new PDFParse({data}).getText()`.
      // The v1.x callable-default shape is gone — referencing the module as
      // a function raises "pdfParseFn is not a function" at runtime.
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    default:
      throw new UnsupportedMimeTypeError(mime);
  }
}
