import { describe, expect, mock, test } from "bun:test"
import {
  ACCEPTED_ATTACHMENT_EXTENSIONS,
  ATTACHMENT_ACCEPT,
  getAttachmentInputModality,
  getUnsupportedAttachmentInputs,
  prepareAttachmentFile,
  prepareAttachmentFiles,
  selectPdfContext,
  textToDataUrl,
  type PdfAttachmentPreparationOptions,
  PDF_TEXT_EXTRACTION_PAGE_THRESHOLD,
} from "./attachment-files"

mock.module("heic2any", () => ({
  default: async () => new Blob(["jpeg-data"], { type: "image/jpeg" }),
}))

const prepare = (file: File) => Promise.resolve(prepareAttachmentFile(file))
const prepareFiles = (file: File) => Promise.resolve(prepareAttachmentFiles(file))

/** Small PDF fixture generator; keeping it here avoids shipping a PDF writer. */
const createPdfFixture = (pageCount: number, withText: boolean | ((pageIndex: number) => boolean) = true): ArrayBuffer => {
  const fontObject = 3 + pageCount * 2
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, index) => `${3 + index} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  ]

  for (let index = 0; index < pageCount; index += 1) {
    const contentsObject = 3 + pageCount + index
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentsObject} 0 R >>`,
    )
  }

  for (let index = 0; index < pageCount; index += 1) {
    const includeText = typeof withText === "function" ? withText(index) : withText
    const stream = includeText ? `BT /F1 12 Tf 72 720 Td (Page ${index + 1} text) Tj ET` : ""
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

  const encoder = new TextEncoder()
  let source = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets[index + 1] = encoder.encode(source).byteLength
    source += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = encoder.encode(source).byteLength
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index <= objects.length; index += 1) {
    source += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`
  }
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  const bytes = encoder.encode(source)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

describe("attachment file preparation", () => {
  test("maps normalized attachment MIME types to model input modalities", () => {
    expect(getAttachmentInputModality("text/plain;charset=utf-8")).toBe("text")
    expect(getAttachmentInputModality("image/jpeg")).toBe("image")
    expect(getAttachmentInputModality("application/pdf")).toBe("pdf")
    expect(getAttachmentInputModality("audio/mpeg")).toBe("audio")
    expect(getAttachmentInputModality("video/mp4")).toBe("video")
    expect(getAttachmentInputModality("application/octet-stream")).toBe(undefined)
  })

  test("returns only attachment inputs unsupported by the model", () => {
    const attachments = [
      { filename: "notes.txt", mimeType: "text/plain" },
      { filename: "photo.jpg", mimeType: "image/jpeg" },
      { filename: "report.pdf", mimeType: "application/pdf" },
      { filename: "unknown.bin", mimeType: "application/octet-stream" },
    ]

    expect(getUnsupportedAttachmentInputs(attachments, ["TEXT", "pdf"])).toEqual([
      { attachment: attachments[1], modality: "image" },
    ])
  })

  test("exposes the expanded code and structured-text formats to pickers", () => {
    for (const extension of [
      "diff", "patch", "ipynb", "jsonl", "ndjson", "har", "svg", "drawio",
      "vue", "svelte", "php", "cs", "kt", "swift", "lua", "dart", "tf", "hcl", "proto",
      "docx", "pptx", "xlsx", "odt", "odp", "ods",
    ]) {
      expect(ACCEPTED_ATTACHMENT_EXTENSIONS.includes(extension)).toBe(true)
      expect(ATTACHMENT_ACCEPT.includes(`.${extension}`)).toBe(true)
    }
  })

  test("renders notebooks as readable markdown without binary outputs", async () => {
    const notebook = {
      metadata: { kernelspec: { language: "python" } },
      cells: [
        { cell_type: "markdown", source: ["# Analysis\n", "Notes"] },
        {
          cell_type: "code",
          source: ["print('ok')"],
          outputs: [
            { text: ["ok\n"] },
            { data: { "text/plain": ["result"], "image/png": "base64-image" } },
          ],
        },
      ],
    }

    const result = await prepare(new File([JSON.stringify(notebook)], "analysis.ipynb", { type: "application/json" }))
    const text = await result?.file.text()

    expect(result?.mimeType).toBe("text/plain")
    expect(text?.includes("# Notebook: analysis.ipynb")).toBe(true)
    expect(text?.includes("```python\nprint('ok')\n```")).toBe(true)
    expect(text?.includes("ok")).toBe(true)
    expect(text?.includes("[Non-text output omitted: image/png]")).toBe(true)
    expect(text?.includes("base64-image")).toBe(false)
  })

  test("redacts credentials and omits bodies from HAR files", async () => {
    const har = {
      log: {
        entries: [{
          request: {
            url: "https://example.com/api?token=secret&query=visible",
            headers: [
              { name: "Authorization", value: "Bearer secret" },
              { name: "Accept", value: "application/json" },
            ],
            cookies: [{ name: "session", value: "cookie-secret" }],
            postData: { mimeType: "application/json", text: "{\"password\":\"secret\"}" },
          },
          response: {
            headers: [{ name: "Set-Cookie", value: "session=secret" }],
            content: { mimeType: "application/json", encoding: "base64", text: "secret response" },
          },
        }],
      },
    }

    const result = await prepare(new File([JSON.stringify(har)], "network.har", { type: "application/json" }))
    const text = await result?.file.text() ?? ""
    const sanitized = JSON.parse(text)
    const entry = sanitized.log.entries[0]

    expect(result?.mimeType).toBe("text/plain")
    expect(new URL(entry.request.url).searchParams.get("token")).toBe("[REDACTED]")
    expect(entry.request.headers[0].value).toBe("[REDACTED]")
    expect(entry.request.headers[1].value).toBe("application/json")
    expect(entry.request.cookies[0].value).toBe("[REDACTED]")
    expect(entry.request.postData.text).toBe("[OMITTED BY OPENCHAMBER]")
    expect(entry.response.headers[0].value).toBe("[REDACTED]")
    expect(entry.response.content.text).toBe("[OMITTED BY OPENCHAMBER]")
    expect(entry.response.content.encoding).toBe("[OMITTED BY OPENCHAMBER]")
    expect(text.includes("Bearer secret")).toBe(false)
    expect(text.includes("secret response")).toBe(false)
  })

  test("rejects malformed HAR files instead of leaking unsanitized content", async () => {
    const result = await prepare(new File(["not valid HAR JSON"], "network.har", { type: "text/plain" }))
    expect(result).toBe(undefined)
  })

  test("treats SVG and Draw.io files as text", async () => {
    const svg = await prepare(new File(["<svg></svg>"], "diagram.svg", { type: "image/svg+xml" }))
    const drawio = await prepare(new File(["<mxfile></mxfile>"], "diagram.drawio", { type: "application/xml" }))

    expect(svg?.mimeType).toBe("text/plain")
    expect(drawio?.mimeType).toBe("text/plain")
  })

  test("converts HEIC files to JPEG before attachment", async () => {
    const result = await prepare(new File(["heic-data"], "photo.heic", { type: "image/heic" }))

    expect(result?.mimeType).toBe("image/jpeg")
    expect(result?.file.name).toBe("photo.jpg")
    expect(result?.file.type).toBe("image/jpeg")
    expect(await result?.file.text()).toBe("jpeg-data")
  })

  test("normalizes small text PDFs to Markdown", async () => {
    const result = await prepareFiles(new File([createPdfFixture(1)], "short.pdf", { type: "application/pdf" }))

    expect(result).toHaveLength(1)
    expect(result?.[0]?.mimeType).toBe("text/plain")
    expect(result?.[0]?.file.name).toBe("short.md")
    expect(await result?.[0]?.file.text()).toContain("Page 1 text")
  })

  test("converts large text PDFs to reusable text instead of provider-parsed binary", async () => {
    const pageCount = PDF_TEXT_EXTRACTION_PAGE_THRESHOLD + 1
    const result = await prepareFiles(new File([createPdfFixture(pageCount)], "large-book.pdf", { type: "application/pdf" }))

    expect(result).toHaveLength(1)
    expect(result?.[0]?.mimeType).toBe("text/plain")
    expect(result?.[0]?.file.name).toBe("large-book.md")
    const text = await result?.[0]?.file.text() ?? ""
    expect(text).toContain("# PDF: large-book.pdf")
    expect(text).toContain(`Pages: ${pageCount}`)
    expect(text).toContain("--- Page 1 of 51 ---")
    expect(text).toContain("Page 51 text")
  })

  test("keeps scanned or otherwise textless PDFs out of the binary provider path", async () => {
    const result = await prepareFiles(new File([
      createPdfFixture(PDF_TEXT_EXTRACTION_PAGE_THRESHOLD + 1, false),
    ], "scanned-book.pdf", { type: "application/pdf" }))

    expect(result).toHaveLength(1)
    expect(result?.[0]?.mimeType).toBe("text/plain")
    expect(result?.[0]?.file.name).toBe("scanned-book.md")
    expect(await result?.[0]?.file.text()).toContain("No selectable text or OCR text")
  })

  test("uses OCR text for scanned pages when the browser OCR runner is available", async () => {
    const ocrPages: NonNullable<PdfAttachmentPreparationOptions["ocrPages"]> = async (_pdf, pageNumbers) => {
      return new Map(pageNumbers.map((pageNumber) => [pageNumber, `OCR answer ${pageNumber}`]))
    }
    const result = await prepareAttachmentFiles(
      new File([createPdfFixture(2, false)], "scanned-ocr.pdf", { type: "application/pdf" }),
      [],
      { ocrPages },
    )

    expect(result).toHaveLength(1)
    expect(result?.[0]?.mimeType).toBe("text/plain")
    expect(await result?.[0]?.file.text()).toContain("OCR answer 1")
    expect(await result?.[0]?.file.text()).toContain("OCR answer 2")
  })

  test("combines selectable text and OCR text for mixed PDFs", async () => {
    const ocrPages: NonNullable<PdfAttachmentPreparationOptions["ocrPages"]> = async (_pdf, pageNumbers) => {
      return new Map(pageNumbers.map((pageNumber) => [pageNumber, `OCR fallback ${pageNumber}`]))
    }
    const result = await prepareAttachmentFiles(
      new File([createPdfFixture(3, (pageIndex) => pageIndex === 0)], "mixed.pdf", { type: "application/pdf" }),
      [],
      { ocrPages },
    )
    const text = await result?.[0]?.file.text() ?? ""

    expect(text).toContain("Page 1 text")
    expect(text).toContain("OCR fallback 2")
    expect(text).toContain("OCR fallback 3")
    expect(text).not.toContain("[No text detected on this page.]")
  })

  test("bounds long PDF context and prefers pages matching the question", () => {
    const pages = Array.from({ length: 8 }, (_, index) => {
      const topic = index === 5 ? "four rivers of paradise" : "unrelated background passage"
      return `--- Page ${index + 1} of 8 ---\n${topic} ${"context ".repeat(3200)}`
    }).join("\n\n")
    const source = `# PDF: book.pdf\nPages: 8\n\n${pages}`
    const selected = selectPdfContext(source, "Explain the four rivers of paradise")

    expect(selected.length <= 96_000).toBe(true)
    expect(selected).toContain("Page 6 of 8")
    expect(selected).toContain("selected the most relevant PDF pages")
    expect(selected).not.toContain("Page 8 of 8")

    const encoded = textToDataUrl("سلام PDF")
    expect(Buffer.from(encoded.split(",")[1] ?? "", "base64").toString()).toBe("سلام PDF")
  })

  test("reuses a prepared PDF by content hash on repeated attachment", async () => {
    const file = new File([createPdfFixture(2)], "cached.pdf", { type: "application/pdf" })
    const first = await prepareFiles(file)
    const second = await prepareFiles(file)

    expect(second?.[0]?.file).toBe(first?.[0]?.file)
    expect(await second?.[0]?.file.text()).toContain("Page 2 text")
  })

  test("builds a provider-safe prompt payload for PDF questions", async () => {
    const prepared = await prepareFiles(new File([createPdfFixture(1)], "question.pdf", { type: "application/pdf" }))
    const file = prepared?.[0]
    expect(file?.mimeType).toBe("text/plain")
    const dataUrl = `data:text/plain;base64,${Buffer.from(await file!.file.arrayBuffer()).toString("base64")}`
    const filePart = { type: "file", mime: file!.mimeType, filename: file!.file.name, url: dataUrl }
    const payload = {
      parts: [filePart, { type: "text", text: "What does page 1 say?" }],
    }

    expect(filePart.mime).toBe("text/plain")
    expect(filePart.filename).toBe("question.md")
    expect(Buffer.from(filePart.url.split(",")[1] ?? "", "base64").toString()).toContain("Page 1 text")
    expect(JSON.stringify(payload)).not.toContain("application/pdf")
  })

  test("returns a text diagnostic for malformed PDFs instead of forwarding binary", async () => {
    const result = await prepareFiles(new File(["not a PDF"], "broken.pdf", { type: "application/pdf" }))

    expect(result).toHaveLength(1)
    expect(result?.[0]?.mimeType).toBe("text/plain")
    expect(result?.[0]?.file.name).toBe("broken.md")
    expect(await result?.[0]?.file.text()).toContain("could not be parsed locally")
  })
})
