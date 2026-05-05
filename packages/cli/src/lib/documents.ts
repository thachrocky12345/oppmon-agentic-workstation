/**
 * Document Processing Utilities
 *
 * Utilities for reading, parsing, and chunking documents for RAG ingestion.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'

export interface DocumentInfo {
  path: string
  name: string
  extension: string
  size: number
  mimeType: string
}

export interface DocumentChunk {
  content: string
  index: number
  startOffset: number
  endOffset: number
  metadata: {
    filename: string
    extension: string
    chunkIndex: number
    totalChunks: number
  }
}

export interface ChunkOptions {
  maxChunkSize?: number // Max characters per chunk (default: 2000)
  chunkOverlap?: number // Overlap between chunks (default: 200)
  separators?: string[] // Separators to split on (default: ['\n\n', '\n', '. ', ' '])
}

// Supported file extensions and their MIME types
const MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.jsx': 'text/javascript',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.hpp': 'text/x-c++',
  '.cs': 'text/x-csharp',
  '.php': 'text/x-php',
  '.sql': 'text/x-sql',
  '.sh': 'text/x-shellscript',
  '.bash': 'text/x-shellscript',
  '.zsh': 'text/x-shellscript',
  '.ps1': 'text/x-powershell',
  '.csv': 'text/csv',
  '.log': 'text/plain',
  '.env': 'text/plain',
  '.gitignore': 'text/plain',
  '.dockerignore': 'text/plain',
}

// File extensions to skip during directory ingestion
const SKIP_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.wav', '.ogg',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.lock', '.lockb',
])

// Directories to skip during ingestion
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  'coverage',
  '.cache',
  '.turbo',
])

/**
 * Get file information
 */
export async function getDocumentInfo(filePath: string): Promise<DocumentInfo> {
  const stats = await fs.stat(filePath)
  const ext = path.extname(filePath).toLowerCase()

  return {
    path: filePath,
    name: path.basename(filePath),
    extension: ext,
    size: stats.size,
    mimeType: MIME_TYPES[ext] || 'text/plain',
  }
}

/**
 * Check if a file is supported for ingestion
 */
export function isSupported(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return !SKIP_EXTENSIONS.has(ext)
}

/**
 * Read a text file
 */
export async function readDocument(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

/**
 * Generate a unique source ID for a document
 */
export function generateSourceId(filePath: string, projectRoot?: string): string {
  const relativePath = projectRoot
    ? path.relative(projectRoot, filePath)
    : path.basename(filePath)

  // Use normalized path as source ID (replace backslashes with forward slashes)
  return relativePath.replace(/\\/g, '/')
}

/**
 * Generate content hash for deduplication
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Chunk text using recursive character splitting
 */
export function chunkText(text: string, options: ChunkOptions = {}): DocumentChunk[] {
  const {
    maxChunkSize = 2000,
    chunkOverlap = 200,
    separators = ['\n\n', '\n', '. ', ' '],
  } = options

  const chunks: DocumentChunk[] = []
  const filename = 'document'
  const extension = ''

  // Recursive split function
  function split(text: string, separatorIdx: number): string[] {
    if (text.length <= maxChunkSize) {
      return [text]
    }

    if (separatorIdx >= separators.length) {
      // No more separators, hard split
      const result: string[] = []
      for (let i = 0; i < text.length; i += maxChunkSize - chunkOverlap) {
        result.push(text.slice(i, i + maxChunkSize))
      }
      return result
    }

    const separator = separators[separatorIdx]
    const parts = text.split(separator)

    if (parts.length === 1) {
      // Separator not found, try next
      return split(text, separatorIdx + 1)
    }

    const result: string[] = []
    let current = ''

    for (const part of parts) {
      const combined = current ? current + separator + part : part

      if (combined.length <= maxChunkSize) {
        current = combined
      } else {
        if (current) {
          result.push(current)
        }

        if (part.length > maxChunkSize) {
          // Part is too large, recursively split
          result.push(...split(part, separatorIdx + 1))
          current = ''
        } else {
          current = part
        }
      }
    }

    if (current) {
      result.push(current)
    }

    return result
  }

  const textChunks = split(text, 0)

  // Add overlap between chunks
  let offset = 0
  for (let i = 0; i < textChunks.length; i++) {
    const chunk = textChunks[i]
    chunks.push({
      content: chunk,
      index: i,
      startOffset: offset,
      endOffset: offset + chunk.length,
      metadata: {
        filename,
        extension,
        chunkIndex: i,
        totalChunks: textChunks.length,
      },
    })
    offset += chunk.length
  }

  return chunks
}

/**
 * Chunk a document with metadata
 */
export function chunkDocument(
  content: string,
  info: DocumentInfo,
  options: ChunkOptions = {}
): DocumentChunk[] {
  const chunks = chunkText(content, options)

  // Update metadata with actual file info
  for (const chunk of chunks) {
    chunk.metadata.filename = info.name
    chunk.metadata.extension = info.extension
  }

  return chunks
}

/**
 * List all supported files in a directory
 */
export async function listDocuments(
  dirPath: string,
  recursive = true
): Promise<DocumentInfo[]> {
  const documents: DocumentInfo[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (recursive && !SKIP_DIRECTORIES.has(entry.name)) {
          await walk(fullPath)
        }
      } else if (entry.isFile()) {
        if (isSupported(fullPath)) {
          try {
            const info = await getDocumentInfo(fullPath)
            // Skip very large files (> 1MB)
            if (info.size <= 1024 * 1024) {
              documents.push(info)
            }
          } catch {
            // Skip files that can't be read
          }
        }
      }
    }
  }

  await walk(dirPath)
  return documents.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Prepare document for ingestion
 */
export interface PreparedDocument {
  sourceId: string
  content: string
  contentHash: string
  metadata: {
    filename: string
    extension: string
    mimeType: string
    size: number
    path: string
  }
  chunks: DocumentChunk[]
}

export async function prepareDocument(
  filePath: string,
  projectRoot?: string,
  chunkOptions?: ChunkOptions
): Promise<PreparedDocument> {
  const info = await getDocumentInfo(filePath)
  const content = await readDocument(filePath)
  const sourceId = generateSourceId(filePath, projectRoot)
  const contentHash = hashContent(content)
  const chunks = chunkDocument(content, info, chunkOptions)

  return {
    sourceId,
    content,
    contentHash,
    metadata: {
      filename: info.name,
      extension: info.extension,
      mimeType: info.mimeType,
      size: info.size,
      path: filePath,
    },
    chunks,
  }
}

/**
 * Format file size for display
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
