/**
 * Browser-side OCR for PDF pages that do not expose selectable text.
 *
 * PDF.js intentionally does not include OCR. Tesseract is loaded lazily so
 * normal text PDFs do not pay the worker/language-data cost.
 */

export const DEFAULT_PDF_OCR_LANGUAGES = "eng+fas";
export const PDF_OCR_MAX_PAGES = 1000;
export const PDF_OCR_RENDER_MAX_DIMENSION = 1800;
export const PDF_OCR_RENDER_MAX_SCALE = 2;

type PdfViewport = { width: number; height: number };

type PdfPageLike = {
	getViewport: (params: { scale: number }) => PdfViewport;
	// `never` keeps this structural adapter compatible with PDF.js versions
	// that add required render options (canvas, intent, annotations, ...).
	render: (params: never) => { promise: Promise<unknown> };
	cleanup?: () => void;
};

type PdfDocumentLike = {
	numPages: number;
	getPage: (pageNumber: number) => Promise<PdfPageLike>;
};

type OcrResult = { data?: { text?: unknown } };

type OcrWorker = {
	recognize: (image: unknown) => Promise<OcrResult>;
	setParameters?: (parameters: Record<string, string | number>) => Promise<unknown>;
	terminate?: () => Promise<unknown>;
};

type TesseractApi = {
	createWorker: (
		languages?: string,
		oem?: number,
		options?: { logger?: (message: unknown) => void },
	) => Promise<OcrWorker>;
};

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

let workerPromise: Promise<OcrWorker> | undefined;

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new DOMException("PDF OCR was cancelled", "AbortError");
	}
}

function getCanvas(width: number, height: number): CanvasLike | undefined {
	if (typeof OffscreenCanvas !== "undefined") {
		return new OffscreenCanvas(width, height);
	}

	if (typeof document !== "undefined") {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		return canvas;
	}

	return undefined;
}

function clearCanvas(canvas: CanvasLike): void {
	if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
		canvas.width = 1;
		canvas.height = 1;
		return;
	}

	canvas.width = 1;
	canvas.height = 1;
}

async function renderPage(page: PdfPageLike): Promise<CanvasLike> {
	const initialViewport = page.getViewport({ scale: 1 });
	const longestSide = Math.max(initialViewport.width, initialViewport.height, 1);
	const scale = Math.min(
		PDF_OCR_RENDER_MAX_SCALE,
		PDF_OCR_RENDER_MAX_DIMENSION / longestSide,
	);
	// Down-scale unusually large pages as well as up-scaling small scans. This
	// keeps the canvas within the render budget on low-memory machines.
	const viewport = page.getViewport({ scale });
	const width = Math.max(1, Math.ceil(viewport.width));
	const height = Math.max(1, Math.ceil(viewport.height));
	const canvas = getCanvas(width, height);

	if (!canvas) {
		throw new Error("PDF OCR requires a browser canvas");
	}

	const context = canvas.getContext("2d");
	if (!context) {
		clearCanvas(canvas);
		throw new Error("PDF OCR could not create a 2D canvas context");
	}

	await page.render({
		canvasContext: context as CanvasRenderingContext2D,
		viewport,
	} as never).promise;

	return canvas;
}

async function getWorker(languages: string): Promise<OcrWorker> {
	if (!workerPromise) {
		workerPromise = (async () => {
			const imported = (await import("tesseract.js")) as unknown as {
				default?: TesseractApi;
				createWorker?: TesseractApi["createWorker"];
			};
			const api = imported.default ?? imported;
			if (typeof api.createWorker !== "function") {
				throw new Error("Tesseract OCR is unavailable");
			}

			const worker = await api.createWorker(languages, 1, {
				// Progress is intentionally not logged: OCR can run for hundreds of pages.
				logger: () => undefined,
			});
			await worker.setParameters?.({
				tessedit_pageseg_mode: 6,
				preserve_interword_spaces: 1,
				user_defined_dpi: 200,
			});
			return worker;
		})();

		workerPromise.catch(() => {
			workerPromise = undefined;
		});
	}

	return workerPromise;
}

function normalizeOcrText(value: unknown): string {
	return String(value ?? "")
		.split(String.fromCharCode(0)).join("")
		.replace(/\r\n?/g, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export type PdfOcrOptions = {
	languages?: string;
	maxPages?: number;
	signal?: AbortSignal;
	onProgress?: (completed: number, total: number) => void;
};

/**
 * OCR the supplied PDF pages sequentially. Sequential work keeps CPU and
 * memory bounded on low-end Windows machines and makes cancellation reliable.
 */
export async function ocrPdfPages(
	pdf: PdfDocumentLike,
	pageNumbers: readonly number[],
	options: PdfOcrOptions = {},
): Promise<Map<number, string>> {
	const selectedPages = pageNumbers
		.filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pdf.numPages)
		.slice(0, Math.min(options.maxPages ?? PDF_OCR_MAX_PAGES, PDF_OCR_MAX_PAGES));
	const results = new Map<number, string>();
	if (selectedPages.length === 0) {
		return results;
	}
	if (typeof OffscreenCanvas === "undefined" && typeof document === "undefined") {
		throw new Error("PDF OCR requires a browser canvas");
	}

	const worker = await getWorker(options.languages ?? DEFAULT_PDF_OCR_LANGUAGES);
	for (let index = 0; index < selectedPages.length; index += 1) {
		throwIfAborted(options.signal);
		const pageNumber = selectedPages[index];
		let page: PdfPageLike | undefined;
		let canvas: CanvasLike | undefined;
		try {
			page = await pdf.getPage(pageNumber);
			canvas = await renderPage(page);
			const recognized = await worker.recognize(canvas);
			const text = normalizeOcrText(recognized.data?.text);
			if (text) {
				results.set(pageNumber, text);
			}
		} catch {
			// A damaged/unsupported page should not discard OCR from every other
			// page. Cancellation remains fatal so the caller can stop promptly.
			throwIfAborted(options.signal);
		} finally {
			if (canvas) {
				clearCanvas(canvas);
			}
			try {
				page?.cleanup?.();
			} catch {
				// Cleanup must not turn a successful OCR page into a failed import.
			}
			options.onProgress?.(index + 1, selectedPages.length);
		}
	}

	return results;
}
