import { ocrPdfPages, type PdfOcrOptions } from "./pdf-ocr"

const ACCEPTED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/*",
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
  ".bat",
  ".c",
  ".cc",
  ".cjs",
  ".cmd",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".cts",
  ".dart",
  ".diff",
  ".docx",
  ".drawio",
  ".env",
  ".erl",
  ".ex",
  ".exs",
  ".fs",
  ".fsx",
  ".go",
  ".gql",
  ".graphql",
  ".h",
  ".har",
  ".hh",
  ".hcl",
  ".heic",
  ".heif",
  ".hpp",
  ".hrl",
  ".htm",
  ".html",
  ".ini",
  ".ipynb",
  ".java",
  ".jl",
  ".js",
  ".json",
  ".jsonl",
  ".jsx",
  ".kt",
  ".kts",
  ".log",
  ".lua",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".ndjson",
  ".odp",
  ".ods",
  ".odt",
  ".patch",
  ".php",
  ".proto",
  ".pptx",
  ".ps1",
  ".py",
  ".r",
  ".rb",
  ".rs",
  ".sass",
  ".scala",
  ".scss",
  ".sh",
  ".sol",
  ".sql",
  ".svelte",
  ".svg",
  ".swift",
  ".tf",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".xlsx",
  ".yaml",
  ".yml",
  ".zig",
  ".zsh",
] as const

export const ATTACHMENT_ACCEPT = ACCEPTED_ATTACHMENT_TYPES.join(",")

const PICKER_MIME_EXTENSIONS = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["application/vnd.oasis.opendocument.text", "odt"],
  ["application/vnd.oasis.opendocument.presentation", "odp"],
  ["application/vnd.oasis.opendocument.spreadsheet", "ods"],
  ["application/json", "json"],
  ["application/ld+json", "jsonld"],
  ["application/toml", "toml"],
  ["application/x-toml", "toml"],
  ["application/x-yaml", "yaml"],
  ["application/xml", "xml"],
  ["application/yaml", "yaml"],
])
const TEXT_ATTACHMENT_EXTENSIONS = ["txt", "text", "md", "markdown", "log", "csv"]

export const ACCEPTED_ATTACHMENT_EXTENSIONS = Array.from(new Set(
  ACCEPTED_ATTACHMENT_TYPES.flatMap((type) => {
    if (type.startsWith(".")) return [type.slice(1)]
    if (type === "text/*") return TEXT_ATTACHMENT_EXTENSIONS
    const extension = PICKER_MIME_EXTENSIONS.get(type)
    return extension ? [extension] : []
  })
)).sort()

type OpenCodeAttachmentMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "application/pdf"
  | "text/plain"

export type AttachmentInputModality = "text" | "image" | "pdf" | "audio" | "video"

export const getAttachmentInputModality = (mimeType: string): AttachmentInputModality | undefined => {
  const normalizedMimeType = mimeType.toLowerCase().split(";", 1)[0]?.trim() ?? ""
  if (normalizedMimeType.startsWith("image/")) return "image"
  if (normalizedMimeType.startsWith("audio/")) return "audio"
  if (normalizedMimeType.startsWith("video/")) return "video"
  if (normalizedMimeType === "application/pdf") return "pdf"
  if (normalizedMimeType.startsWith("text/")) return "text"
  return undefined
}

export const getUnsupportedAttachmentInputs = <T extends { mimeType: string }>(
  attachments: T[],
  supportedInputModalities: string[],
): Array<{ attachment: T; modality: AttachmentInputModality }> => {
  const supportedModalities = new Set(supportedInputModalities.map((modality) => modality.toLowerCase()))
  const unsupportedInputs: Array<{ attachment: T; modality: AttachmentInputModality }> = []
  for (const attachment of attachments) {
    const modality = getAttachmentInputModality(attachment.mimeType)
    if (modality && !supportedModalities.has(modality)) {
      unsupportedInputs.push({ attachment, modality })
    }
  }
  return unsupportedInputs
}

const SUPPORTED_BINARY_MIMES = new Map<string, OpenCodeAttachmentMimeType>([
  ["image/png", "image/png"],
  ["image/jpeg", "image/jpeg"],
  ["image/gif", "image/gif"],
  ["image/webp", "image/webp"],
  ["application/pdf", "application/pdf"],
])
const SUPPORTED_BINARY_EXTENSIONS = new Map<string, OpenCodeAttachmentMimeType>([
  ["gif", "image/gif"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["pdf", "application/pdf"],
  ["png", "image/png"],
  ["webp", "image/webp"],
])
const TEXT_MIMES = new Set([
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
  "image/svg+xml",
])
const ATTACHMENT_SAMPLE_BYTES = 4096
const DOCUMENT_EXTENSIONS = new Set(["docx", "pptx", "xlsx", "odt", "odp", "ods"])
// OpenCode/Muse accepts PDF input, but the provider parses the binary PDF on
// every turn. A transient parser/FaaS failure can therefore make an otherwise
// valid attachment unusable when the same conversation continues. Every PDF
// is normalized locally to a provider-safe Markdown/text sidecar (including
// OCR for scanned pages) while the original remains the visible attachment.
/** @deprecated Kept for callers that used the old extraction threshold. PDFs are now all normalized. */
export const PDF_TEXT_EXTRACTION_PAGE_THRESHOLD = 50
export const PDF_TEXT_MAX_CHARS = 2_000_000
export const PDF_MAX_PAGES = 1000
/** Maximum PDF context sent to a provider for one user turn. */
export const PDF_CONTEXT_MAX_CHARS = 96_000
const PDF_PREPARATION_CACHE_MAX_ENTRIES = 4
const PDF_PREPARATION_CACHE_MAX_BYTES = 8_000_000
const PDF_CONTEXT_NOTICE = "[OpenDeputy selected the most relevant PDF pages for this turn. Ask for a specific page or topic to search the document again.]"
const PDF_PAGE_SECTION_PATTERN = /\n--- Page (\d+) of (\d+) ---\n/g
const PDF_QUERY_STOP_WORDS = new Set([
  "about", "after", "also", "from", "have", "into", "more", "please", "read", "that", "the", "this", "with",
  "what", "when", "where", "which", "whole", "will", "would", "your", "document", "file", "pdf", "book",
  "این", "آن", "برای", "را", "در", "به", "از", "که", "با", "یک", "و", "یا", "می", "کن", "کنید", "بخوان",
  "فایل", "پی", "دی", "اف", "کتاب", "همه", "تمام", "خلاصه", "خلاصه‌ای", "خلاصهٔ",
])
const REDACTED = "[REDACTED]"
const OMITTED = "[OMITTED BY OPENCHAMBER]"
const SENSITIVE_NAMES = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[-_]?key|client[-_]?secret|password|secret|access[-_]?token|refresh[-_]?token|id[-_]?token|token)$/i

type PreparedAttachmentFile = {
  file: File
  mimeType: string
}

export type PdfAttachmentPreparationOptions = {
  /** Injectable OCR runner used by focused tests and alternate runtimes. */
  ocrPages?: typeof ocrPdfPages
}

type PdfCacheEntry = {
  promise: Promise<File>
  lastUsed: number
  bytes?: number
}

const pdfPreparationCache = new Map<string, PdfCacheEntry>()
let pdfCacheClock = 0

const extensionOf = (name: string): string => {
  const index = name.lastIndexOf(".")
  return index === -1 ? "" : name.slice(index + 1).toLowerCase()
}

const declaredMimeOf = (file: File): string => file.type.split(";", 1)[0]?.trim().toLowerCase() ?? ""

const inspectTextContent = async (file: File): Promise<"text/plain" | undefined> => {
  const bytes = new Uint8Array(await file.slice(0, ATTACHMENT_SAMPLE_BYTES).arrayBuffer())
  if (bytes.some((byte) => byte === 0)) return
  const controlBytes = bytes.filter((byte) => byte < 9 || (byte > 13 && byte < 32)).length
  if (bytes.length > 0 && controlBytes / bytes.length > 0.3) return
  return "text/plain"
}

const attachmentMime = (
  file: File,
): OpenCodeAttachmentMimeType | Promise<"text/plain" | undefined> | undefined => {
  const type = declaredMimeOf(file)
  const supportedMime = SUPPORTED_BINARY_MIMES.get(type)
  if (supportedMime) return supportedMime

  const extension = extensionOf(file.name)
  const fallback = SUPPORTED_BINARY_EXTENSIONS.get(extension)
  if ((!type || type === "application/octet-stream") && fallback) return fallback

  if (type.startsWith("text/") || TEXT_MIMES.has(type) || type.endsWith("+json") || type.endsWith("+xml")) {
    return "text/plain"
  }

  return inspectTextContent(file)
}

const sourceText = (source: unknown): string => {
  if (typeof source === "string") return source
  if (Array.isArray(source)) return source.filter((line): line is string => typeof line === "string").join("")
  return ""
}

const notebookText = (value: unknown, filename: string): string | undefined => {
  if (!value || typeof value !== "object") return
  const notebook = value as { cells?: unknown; metadata?: { kernelspec?: { language?: unknown } } }
  if (!Array.isArray(notebook.cells)) return
  const language = typeof notebook.metadata?.kernelspec?.language === "string"
    ? notebook.metadata.kernelspec.language
    : ""
  const sections = [`# Notebook: ${filename}`]

  notebook.cells.forEach((rawCell, index) => {
    if (!rawCell || typeof rawCell !== "object") return
    const cell = rawCell as { cell_type?: unknown; source?: unknown; outputs?: unknown }
    const content = sourceText(cell.source).trimEnd()
    if (cell.cell_type === "markdown") {
      sections.push(`## Markdown cell ${index + 1}\n\n${content}`)
      return
    }
    if (cell.cell_type !== "code") return

    sections.push(`## Code cell ${index + 1}\n\n\`\`\`${language}\n${content}\n\`\`\``)
    if (!Array.isArray(cell.outputs)) return
    const outputs: string[] = []
    for (const rawOutput of cell.outputs) {
      if (!rawOutput || typeof rawOutput !== "object") continue
      const output = rawOutput as { text?: unknown; traceback?: unknown; data?: unknown; ename?: unknown; evalue?: unknown }
      const text = sourceText(output.text) || sourceText(output.traceback)
      if (text) {
        outputs.push(text.trimEnd())
        continue
      }
      if (output.data && typeof output.data === "object") {
        const data = output.data as Record<string, unknown>
        const plain = sourceText(data["text/plain"])
        if (plain) outputs.push(plain.trimEnd())
        const omitted = Object.keys(data).filter((type) => type !== "text/plain")
        if (omitted.length > 0) outputs.push(`[Non-text output omitted: ${omitted.join(", ")}]`)
        continue
      }
      if (typeof output.ename === "string" || typeof output.evalue === "string") {
        outputs.push(`${String(output.ename ?? "Error")}: ${String(output.evalue ?? "")}`.trimEnd())
      }
    }
    if (outputs.length > 0) sections.push(`### Output\n\n${outputs.join("\n\n")}`)
  })

  return `${sections.join("\n\n")}\n`
}

const redactUrl = (value: string): string => {
  try {
    const url = new URL(value)
    for (const name of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_NAMES.test(name)) url.searchParams.set(name, REDACTED)
    }
    return url.toString()
  } catch {
    return value
  }
}

const sanitizeHarValue = (value: unknown, key?: string): unknown => {
  if (key && SENSITIVE_NAMES.test(key)) return REDACTED
  if (key === "cookies" && Array.isArray(value)) {
    return value.map((cookie) => {
      if (!cookie || typeof cookie !== "object") return cookie
      return { ...(cookie as Record<string, unknown>), value: REDACTED }
    })
  }
  if (key === "text" || key === "encoding") return OMITTED
  if (typeof value === "string") return key === "url" ? redactUrl(value) : value
  if (Array.isArray(value)) return value.map((item) => sanitizeHarValue(item))
  if (!value || typeof value !== "object") return value

  const record = value as Record<string, unknown>
  const sensitiveEntry = typeof record.name === "string" && SENSITIVE_NAMES.test(record.name)
  return Object.fromEntries(Object.entries(record).map(([entryKey, entryValue]) => [
    entryKey,
    sensitiveEntry && entryKey === "value" ? REDACTED : sanitizeHarValue(entryValue, entryKey),
  ]))
}

const prepareStructuredText = async (file: File, extension: string): Promise<File | undefined> => {
  const text = await file.text()
  if (extension === "har") {
    try {
      const sanitized = sanitizeHarValue(JSON.parse(text))
      return new File([`${JSON.stringify(sanitized, null, 2)}\n`], file.name, { type: "text/plain" })
    } catch {
      return
    }
  }
  if (extension === "ipynb") {
    try {
      const rendered = notebookText(JSON.parse(text), file.name)
      if (rendered) return new File([rendered], file.name, { type: "text/plain" })
    } catch {
      // Invalid notebooks can still be useful as plain text.
    }
  }
  return new File([text], file.name, { type: "text/plain" })
}

const isPdfFile = (file: File): boolean =>
  declaredMimeOf(file) === "application/pdf" || extensionOf(file.name) === "pdf"

const pdfMarkdownFilename = (filename: string): string => {
  const withoutExtension = filename.replace(/\.pdf$/i, "") || "document"
  return `${withoutExtension}.md`
}

const uniqueFilename = (filename: string, reservedFilenames: Iterable<string>): string => {
  const reserved = new Set(Array.from(reservedFilenames, (name) => name.toLowerCase()))
  if (!reserved.has(filename.toLowerCase())) return filename

  const extension = extensionOf(filename)
  const stem = extension ? filename.slice(0, -(extension.length + 1)) : filename
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${stem} (${index}).${extension}`
    if (!reserved.has(candidate.toLowerCase())) return candidate
  }
  return `${stem} (${Date.now()}).${extension}`
}

const fallbackPdfText = (file: File, reason: string, pageCount?: number): File => {
  const pages = pageCount ? `\nPages: ${pageCount}` : ""
  const text = [
    `# PDF: ${file.name}`,
    pages ? pages.trimStart() : "",
    "",
    "[OpenDeputy could not extract readable text from this PDF locally.]",
    reason,
    "The original PDF was not sent as binary because the provider PDF parser can fail on repeated requests.",
  ].filter(Boolean).join("\n") + "\n"
  return new File([text], pdfMarkdownFilename(file.name), { type: "text/plain" })
}

const hashFile = async (file: File): Promise<string> => {
  const bytes = await file.arrayBuffer()
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const digest = await subtle.digest("SHA-256", bytes)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  }
  // Electron builds without Web Crypto still get deterministic, bounded
  // reuse within the current process. The content length and modification
  // time make accidental collisions unlikely without adding a hash library.
  return `${file.size}:${file.lastModified}:${file.name}`
}

const pdfQueryTerms = (query: string): string[] => {
  const terms = query.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []
  return Array.from(new Set(terms.filter((term) => !PDF_QUERY_STOP_WORDS.has(term)))).slice(0, 16)
}

const countTermOccurrences = (text: string, term: string): number => {
  let count = 0
  let offset = 0
  while (offset < text.length) {
    const index = text.indexOf(term, offset)
    if (index === -1) break
    count += 1
    if (count >= 8) break
    offset = index + term.length
  }
  return count
}

type PdfContextPage = {
  number: number
  text: string
  score: number
}

/**
 * Keep the original PDF separate from the provider context. Long documents
 * are page-addressable, so a follow-up question sends only matching pages
 * instead of replaying the entire extracted book into the model context.
 */
export const selectPdfContext = (
  text: string,
  query: string,
  maxChars: number = PDF_CONTEXT_MAX_CHARS,
): string => {
  const normalized = text.trim()
  if (!normalized || normalized.length <= maxChars) return text

  const matches = Array.from(normalized.matchAll(PDF_PAGE_SECTION_PATTERN))
  if (matches.length === 0) {
    const notice = `\n\n${PDF_CONTEXT_NOTICE}`
    return `${normalized.slice(0, Math.max(0, maxChars - notice.length))}${notice}`
  }

  const terms = pdfQueryTerms(query)
  const pages: PdfContextPage[] = matches.map((match, index) => {
    const start = match.index ?? 0
    const end = matches[index + 1]?.index ?? normalized.length
    const pageText = normalized.slice(start, end).trim()
    const lowerPageText = pageText.toLocaleLowerCase()
    const score = terms.reduce((total, term) => total + countTermOccurrences(lowerPageText, term), 0)
    return { number: Number(match[1]), text: pageText, score }
  })

  const firstPageStart = matches[0]?.index ?? normalized.length
  const intro = normalized.slice(0, firstPageStart).trim().slice(0, 6000)
  const noticePrefix = `\n\n${PDF_CONTEXT_NOTICE} `
  const usableChars = Math.max(1000, maxChars - intro.length - noticePrefix.length - 80)
  const rankedPages = pages.some((page) => page.score > 0)
    ? [...pages].sort((left, right) => right.score - left.score || left.number - right.number)
    : (() => {
      const sampled: PdfContextPage[] = []
      const seen = new Set<number>()
      const stride = Math.max(1, Math.ceil(pages.length / 12))
      for (let index = 0; index < pages.length; index += stride) {
        const page = pages[index]
        if (page && !seen.has(page.number)) {
          sampled.push(page)
          seen.add(page.number)
        }
      }
      const last = pages[pages.length - 1]
      if (last && !seen.has(last.number)) sampled.push(last)
      return sampled
    })()

  const selected = new Map<number, PdfContextPage>()
  let selectedChars = 0
  for (const page of rankedPages) {
    if (selected.has(page.number) || selectedChars >= usableChars) continue
    const remaining = usableChars - selectedChars
    if (page.text.length > remaining) {
      selected.set(page.number, { ...page, text: page.text.slice(0, remaining) })
      selectedChars += remaining
      break
    }
    selected.set(page.number, page)
    selectedChars += page.text.length
  }

  const selectedPages = Array.from(selected.values()).sort((left, right) => left.number - right.number)
  const pageList = selectedPages.map((page) => page.number).join(", ")
  const notice = `${noticePrefix}pages ${pageList || "from the document"}.`
  const body = [intro, ...selectedPages.map((page) => page.text)].filter(Boolean).join("\n\n")
  return `${body.slice(0, Math.max(0, maxChars - notice.length))}${notice}`
}

/** Encode a bounded text sidecar without exposing the original PDF bytes. */
export const textToDataUrl = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return `data:text/plain;base64,${btoa(binary)}`
}

const getCachedPdf = (key: string): Promise<File> | undefined => {
  const entry = pdfPreparationCache.get(key)
  if (!entry) return
  entry.lastUsed = ++pdfCacheClock
  return entry.promise
}

const cachePdf = (key: string, factory: () => Promise<File>): Promise<File> => {
  const existing = getCachedPdf(key)
  if (existing) return existing

  while (pdfPreparationCache.size >= PDF_PREPARATION_CACHE_MAX_ENTRIES) {
    const oldest = Array.from(pdfPreparationCache.entries())
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed)[0]?.[0]
    if (!oldest) break
    pdfPreparationCache.delete(oldest)
  }

  const promise = factory()
    .then((file) => {
      const entry = pdfPreparationCache.get(key)
      if (entry) {
        entry.bytes = file.size
        if (entry.bytes > PDF_PREPARATION_CACHE_MAX_BYTES) pdfPreparationCache.delete(key)
      }
      return file
    })
    .catch((error) => {
      pdfPreparationCache.delete(key)
      throw error
    })
  const entry: PdfCacheEntry = { promise, lastUsed: ++pdfCacheClock }
  pdfPreparationCache.set(key, entry)
  return entry.promise
}

/**
 * Extract text from a PDF locally before it reaches the model provider.
 *
 * `pdfjs-dist` is loaded only when a PDF is attached, so normal chat startup
 * does not pay its bundle cost. Pages without selectable text are rendered and
 * OCRed by the lazy Tesseract worker. If either parser or OCR is unavailable,
 * a text-only diagnostic is returned instead of the original binary, which
 * keeps subsequent provider requests out of the fragile PDF parser path.
 */
const extractPdfText = async (
  file: File,
  options: PdfAttachmentPreparationOptions = {},
): Promise<File> => {
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs")
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  } catch (error) {
    console.warn("Failed to load the local PDF text extractor", error)
    return fallbackPdfText(file, "The local PDF parser could not be loaded in this runtime.")
  }

  let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined
  try {
    const documentOptions = {
      data: new Uint8Array(await file.arrayBuffer()),
      useWorkerFetch: false,
      useSystemFonts: true,
      isEvalSupported: false,
    } as Parameters<typeof pdfjs.getDocument>[0]
    loadingTask = pdfjs.getDocument(documentOptions)
    const document = await loadingTask.promise
    const pageCount = document.numPages

    const pagesToRead = Math.min(pageCount, PDF_MAX_PAGES)
    const pageTexts = new Map<number, string>()
    const pagesWithoutText: number[] = []

    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      let page: Awaited<ReturnType<typeof document.getPage>> | undefined
      try {
        page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        let pageText = ""
        for (const rawItem of content.items) {
          const item = rawItem as { str?: unknown; hasEOL?: unknown }
          if (typeof item.str !== "string") continue
          // PDF.js emits explicit whitespace items and an empty `hasEOL`
          // marker for many PDFs. Preserve both so RTL and multilingual text
          // keep the source's word and line boundaries.
          if (item.hasEOL && pageText.length > 0 && !pageText.endsWith("\n")) pageText += "\n"
          pageText += item.str
        }
        pageText = pageText
          .replace(/\r\n?/g, "\n")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
        if (pageText) pageTexts.set(pageNumber, pageText)
        else pagesWithoutText.push(pageNumber)
      } catch (error) {
        console.warn(`Failed to extract text from PDF page ${pageNumber}`, error)
        pagesWithoutText.push(pageNumber)
      } finally {
        try {
          page?.cleanup()
        } catch {
          // PDF.js cleanup is best-effort; keep the page text already read.
        }
      }
    }

    let ocrTexts = new Map<number, string>()
    if (pagesWithoutText.length > 0) {
      try {
        const ocrRunner = options.ocrPages ?? ocrPdfPages
        ocrTexts = await ocrRunner(document, pagesWithoutText, {
          maxPages: PDF_MAX_PAGES,
        } satisfies PdfOcrOptions)
      } catch (error) {
        // OCR is an enhancement. A diagnostic text file is still safer and
        // more repeatable than returning the provider-breaking PDF binary.
        if (!(error instanceof Error && error.message === "PDF OCR requires a browser canvas")) {
          console.warn("Failed to OCR PDF pages", error)
        }
      }
    }

    let text = `# PDF: ${file.name}\nPages: ${pageCount}\n`
    let truncated = false

    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      const pageText = pageTexts.get(pageNumber) ?? ocrTexts.get(pageNumber) ?? ""
      const section = `\n\n--- Page ${pageNumber} of ${pageCount} ---\n${pageText || "[No text detected on this page.]"}`
      const remaining = PDF_TEXT_MAX_CHARS - text.length
      if (remaining <= 0) {
        truncated = true
        break
      }
      if (section.length > remaining) {
        text += section.slice(0, remaining)
        truncated = true
        break
      }
      text += section
    }

    const extractedText = [...pageTexts.values(), ...ocrTexts.values()].some((pageText) => pageText.trim())
    if (!extractedText) {
      text += "\n\n[No selectable text or OCR text was found in this PDF.]"
      text += "\nThe original PDF was not sent as binary to avoid provider PDF parser failures."
    }
    if (pageCount > pagesToRead) {
      text += `\n\n[Only the first ${pagesToRead.toLocaleString()} of ${pageCount.toLocaleString()} pages were processed.]`
    }
    if (truncated) {
      const notice = `\n\n[PDF text truncated by OpenDeputy at ${PDF_TEXT_MAX_CHARS.toLocaleString()} characters.]`
      text = `${text.slice(0, Math.max(0, PDF_TEXT_MAX_CHARS - notice.length))}${notice}`
    }

    return new File([text], pdfMarkdownFilename(file.name), { type: "text/plain" })
  } catch (error) {
    console.warn("Failed to extract PDF text", error)
    return fallbackPdfText(file, "The PDF could not be parsed locally.")
  } finally {
    // `destroy` is not present on every PDF.js build, but loading tasks that
    // do expose it can release parser resources after attachment preparation.
    try {
      await loadingTask?.destroy()
    } catch {
      // The extracted File is still valid if cleanup races with parsing.
    }
  }
}

const preparePdfAttachments = async (
  file: File,
  reservedFilenames: Iterable<string> = [],
  options: PdfAttachmentPreparationOptions = {},
): Promise<PreparedAttachmentFile[]> => {
  const outputFilename = uniqueFilename(pdfMarkdownFilename(file.name), reservedFilenames)
  const cacheKey = options.ocrPages ? undefined : `${await hashFile(file)}:${outputFilename.toLowerCase()}`
  const extracted = cacheKey
    ? await cachePdf(cacheKey, () => extractPdfText(file))
    : await extractPdfText(file, options)
  const normalized = extracted.name === outputFilename
    ? extracted
    : new File([await extracted.arrayBuffer()], outputFilename, { type: "text/plain" })
  return [{ file: normalized, mimeType: "text/plain" }]
}

const convertHeicToJpeg = async (file: File): Promise<File | undefined> => {
  try {
    const heic2any = (await import("heic2any")).default
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 })
    const blob = Array.isArray(converted) ? converted[0] : converted
    if (!blob) return
    const filename = file.name.replace(/\.(heic|heif)$/i, ".jpg")
    return new File([blob], filename, { type: "image/jpeg" })
  } catch (error) {
    console.warn("Failed to convert HEIC attachment to JPEG", error)
    return
  }
}

export const prepareAttachmentFile = (
  file: File,
): PreparedAttachmentFile | Promise<PreparedAttachmentFile | undefined> | undefined => {
  const extension = extensionOf(file.name)
  const type = declaredMimeOf(file)
  if (type === "image/heic" || type === "image/heif" || extension === "heic" || extension === "heif") {
    return convertHeicToJpeg(file).then((converted) => converted
      ? { file: converted, mimeType: "image/jpeg" }
      : undefined)
  }
  if (extension === "har" || extension === "ipynb") {
    return prepareStructuredText(file, extension).then((prepared) => prepared
      ? { file: prepared, mimeType: "text/plain" }
      : undefined)
  }

  const mime = attachmentMime(file)
  if (typeof mime === "string") return { file, mimeType: mime }
  return mime?.then((mimeType) => mimeType ? { file, mimeType } : undefined)
}

export const prepareAttachmentFiles = (
  file: File,
  reservedFilenames: Iterable<string> = [],
  options: PdfAttachmentPreparationOptions = {},
): PreparedAttachmentFile[] | Promise<PreparedAttachmentFile[] | undefined> | undefined => {
  if (isPdfFile(file)) {
    return preparePdfAttachments(file, reservedFilenames, options)
  }

  if (!DOCUMENT_EXTENSIONS.has(extensionOf(file.name))) {
    const prepared = prepareAttachmentFile(file)
    if (prepared instanceof Promise) return prepared.then((output) => output ? [output] : undefined)
    return prepared ? [prepared] : undefined
  }

  return import("./document-attachments").then(async ({ extractDocumentAttachments }) => {
    const extracted = await extractDocumentAttachments(file, reservedFilenames)
    if (!extracted) return
    const prepared: PreparedAttachmentFile[] = [{ file: extracted.textFile, mimeType: "text/plain" }]
    for (const image of extracted.images) {
      const output = await prepareAttachmentFile(image)
      if (!output || !output.mimeType.startsWith("image/")) return
      prepared.push(output)
    }
    return prepared
  })
}
