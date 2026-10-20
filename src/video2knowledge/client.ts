import {
	Video2KnowledgeClientError,
	type BilibiliPage,
	type BilibiliPagesPreview,
	type MarkdownSummary,
	type MarkdownTranscript,
	type StartSummaryRequest,
	type StartSummaryResponse,
	type StartTranscriptionRequest,
	type StartTranscriptionResponse,
	type TransportMethod,
	type TransportRequest,
	type TransportResponse,
	type TranscriptionTask,
	type TranscriptionTaskStatus,
	type Video2KnowledgeHealth,
	type Video2KnowledgeTransport,
} from "./types";

export const DEFAULT_VIDEO2KNOWLEDGE_BASE_URL = "http://127.0.0.1:8000";

const VIDEO2KNOWLEDGE_SERVICE = "VideoToNo";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const KNOWN_TASK_STATUSES: TranscriptionTaskStatus[] = [
	"pending",
	"queued",
	"processing",
	"cancelling",
	"completed",
	"failed",
	"cancelled",
];

const MAX_ERROR_DETAIL_LENGTH = 300;

const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
	[/sk-[A-Za-z0-9_-]{4,}/g, "sk-***"],
	[/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***"],
	[
		/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|cookie|authorization|secret|password|passwd)["']?\s*[:=]\s*)(["'])([^"']*)\2/gi,
		"$1$2***$2",
	],
	[
		/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|cookie|authorization|secret|password|passwd)["']?\s*[:=]\s*)([^\s"'&,;]+)/gi,
		"$1***",
	],
];

export interface Video2KnowledgeClientOptions {
	transport: Video2KnowledgeTransport;
	baseUrl?: string;
}

export class Video2KnowledgeClient {
	private readonly transport: Video2KnowledgeTransport;
	private readonly baseUrl: string;

	constructor(options: Video2KnowledgeClientOptions) {
		this.transport = options.transport;
		this.baseUrl = normalizeBaseUrl(
			options.baseUrl ?? DEFAULT_VIDEO2KNOWLEDGE_BASE_URL,
		);
	}

	async health(): Promise<Video2KnowledgeHealth> {
		const response = await this.send("GET", "/api/health");
		const payload = parseJson(response);
		if (!isRecord(payload) || payload.status !== "ok") {
			throw protocolError('expected health status "ok"');
		}
		const service = nonEmptyString(payload.service);
		const version = nonEmptyString(payload.version);
		if (service !== VIDEO2KNOWLEDGE_SERVICE) {
			throw protocolError('expected health service "VideoToNo"');
		}
		if (!version) {
			throw protocolError("expected a non-empty version string");
		}
		return { status: "ok", service: VIDEO2KNOWLEDGE_SERVICE, version };
	}

	async startTranscription(
		request: StartTranscriptionRequest,
	): Promise<StartTranscriptionResponse> {
		const videoUrl = requireNonEmpty(request.videoUrl, "videoUrl");
		const requestPayload: Record<string, unknown> = {
			video_url: videoUrl,
			processing_mode: request.processingMode ?? "reuse",
			prefer_subtitles: request.preferSubtitles ?? true,
			whisper_model: request.whisperModel ?? "base",
			use_gpu: request.useGpu ?? false,
		};
		if (request.bilibiliPages !== undefined) {
			requestPayload.bilibili_pages = validateRequestedBilibiliPages(
				request.bilibiliPages,
			);
		}
		const body = JSON.stringify(requestPayload);
		const response = await this.send("POST", "/api/transcribe", {
			headers: { "Content-Type": "application/json" },
			body,
		});
		const payload = parseJson(response);
		if (!isRecord(payload)) {
			throw protocolError("expected a JSON object response");
		}
		const taskId = nonEmptyString(payload.task_id);
		if (!taskId) {
			throw protocolError('expected non-empty "task_id"');
		}
		const reused = payload.reused_task_id;
		if (
			reused !== undefined &&
			reused !== null &&
			typeof reused !== "string"
		) {
			throw protocolError(
				'"reused_task_id" must be a string, null, or absent',
			);
		}
		return {
			taskId,
			reusedTaskId: typeof reused === "string" ? reused : null,
		};
	}

	async previewBilibiliPages(
		videoUrl: string,
	): Promise<BilibiliPagesPreview> {
		const response = await this.send("POST", "/api/bili-pages", {
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				video_url: requireNonEmpty(videoUrl, "videoUrl"),
			}),
		});
		const payload = parseJson(response);
		if (!isRecord(payload)) {
			throw protocolError("expected a JSON object response");
		}
		if (typeof payload.title !== "string") {
			throw protocolError('"title" must be a string');
		}
		if (!isPositiveInteger(payload.total_pages)) {
			throw protocolError('"total_pages" must be a positive integer');
		}
		if (!Array.isArray(payload.pages) || payload.pages.length === 0) {
			throw protocolError('"pages" must be a non-empty array');
		}
		const pages = payload.pages.map(parseBilibiliPage);
		const pageNumbers = new Set(pages.map((page) => page.page));
		if (pageNumbers.size !== pages.length) {
			throw protocolError('"pages" contains duplicate page numbers');
		}
		if (pages.length !== payload.total_pages) {
			throw protocolError('"pages" length must match "total_pages"');
		}
		if (pages.some((page, index) => page.page !== index + 1)) {
			throw protocolError(
				'"pages" must be ordered consecutively from page 1',
			);
		}

		let previousPages: number[] | null = null;
		if (
			payload.previous_pages !== undefined &&
			payload.previous_pages !== null
		) {
			previousPages = validateResponseBilibiliPages(
				payload.previous_pages,
				pageNumbers,
			);
		}
		return {
			title: payload.title,
			totalPages: payload.total_pages,
			pages,
			previousPages,
		};
	}

	async startSummary(
		request: StartSummaryRequest,
	): Promise<StartSummaryResponse> {
		const videoUrl = requireNonEmpty(request.videoUrl, "videoUrl");
		const body = JSON.stringify({
			video_url: videoUrl,
			processing_mode: request.processingMode ?? "reuse",
			output: "note",
			summary_style: "detailed",
			prefer_subtitles: request.preferSubtitles ?? true,
			include_screenshots: false,
			whisper_model: request.whisperModel ?? "base",
			use_gpu: request.useGpu ?? false,
			llm_config: { model_type: "deepseek", api_key: "" },
		});
		const response = await this.send("POST", "/api/summarize", {
			headers: { "Content-Type": "application/json" },
			body,
		});
		return parseStartResponse(response);
	}

	async getTask(taskId: string): Promise<TranscriptionTask> {
		const id = requireNonEmpty(taskId, "taskId");
		const response = await this.send(
			"GET",
			"/api/task/" + encodeURIComponent(id),
		);
		const payload = parseJson(response);
		if (!isRecord(payload)) {
			throw protocolError("expected a JSON object response");
		}
		const status = payload.status;
		if (
			typeof status !== "string" ||
			!KNOWN_TASK_STATUSES.includes(status as TranscriptionTaskStatus)
		) {
			throw protocolError(
				'"status" is not a known transcription task status',
			);
		}
		const task: TranscriptionTask = {
			taskId: id,
			status: status as TranscriptionTaskStatus,
		};
		if (payload.step_name !== undefined) {
			if (typeof payload.step_name !== "string") {
				throw protocolError('"step_name" must be a string');
			}
			task.stepName = payload.step_name;
		}
		if (payload.progress !== undefined) {
			if (
				typeof payload.progress !== "number" ||
				!Number.isFinite(payload.progress)
			) {
				throw protocolError('"progress" must be a finite number');
			}
			task.progress = payload.progress;
		}
		if (payload.progress_message !== undefined) {
			if (typeof payload.progress_message !== "string") {
				throw protocolError('"progress_message" must be a string');
			}
			task.progressMessage = payload.progress_message;
		}
		if (payload.error !== undefined) {
			if (payload.error !== null && typeof payload.error !== "string") {
				throw protocolError('"error" must be a string or null');
			}
			task.error = payload.error;
		}
		return task;
	}

	async getMarkdownTranscript(taskId: string): Promise<MarkdownTranscript> {
		const id = requireNonEmpty(taskId, "taskId");
		const response = await this.send(
			"GET",
			"/api/task/" +
				encodeURIComponent(id) +
				"/transcript?output_format=markdown",
		);
		const payload = parseJson(response);
		if (!isRecord(payload)) {
			throw protocolError("expected a JSON object response");
		}
		const transcriptTaskId = nonEmptyString(payload.task_id);
		if (!transcriptTaskId) {
			throw protocolError('expected non-empty "task_id"');
		}
		if (payload.format !== "markdown") {
			throw protocolError('expected "format" to be "markdown"');
		}
		if (typeof payload.title !== "string") {
			throw protocolError('"title" must be a string');
		}
		const text = payload.text;
		if (typeof text !== "string" || text.trim().length === 0) {
			throw protocolError('expected a non-blank "text" string');
		}
		return {
			taskId: transcriptTaskId,
			format: "markdown",
			title: payload.title,
			text,
		};
	}

	async getMarkdownSummary(taskId: string): Promise<MarkdownSummary> {
		const id = requireNonEmpty(taskId, "taskId");
		const response = await this.send(
			"GET",
			"/api/download/" + encodeURIComponent(id),
		);
		if (response.text.trim().length === 0) {
			throw protocolError("expected a non-blank Markdown summary");
		}
		return {
			taskId: id,
			format: "markdown",
			text: response.text,
		};
	}

	private async send(
		method: TransportMethod,
		path: string,
		options: { headers?: Record<string, string>; body?: string } = {},
	): Promise<TransportResponse> {
		const url = this.baseUrl + path;
		const request: TransportRequest = { method, url };
		if (options.headers) request.headers = options.headers;
		if (options.body !== undefined) request.body = options.body;

		let response: TransportResponse;
		try {
			response = await this.transport.request(request);
		} catch {
			throw transportError();
		}
		if (!isTransportResponse(response)) {
			throw new Video2KnowledgeClientError(
				"transport-error",
				"Video2Knowledge transport returned an invalid response.",
			);
		}
		if (response.status < 200 || response.status >= 300) {
			throw httpError(response);
		}
		return response;
	}
}

function validateRequestedBilibiliPages(value: unknown): number[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Video2KnowledgeClientError(
			"invalid-request",
			"bilibiliPages must be a non-empty array of distinct positive integers.",
		);
	}
	const pages = value.slice();
	if (
		pages.some((page) => !isPositiveInteger(page)) ||
		new Set(pages).size !== pages.length
	) {
		throw new Video2KnowledgeClientError(
			"invalid-request",
			"bilibiliPages must be a non-empty array of distinct positive integers.",
		);
	}
	return pages;
}

function parseBilibiliPage(value: unknown): BilibiliPage {
	if (!isRecord(value)) {
		throw protocolError('each item in "pages" must be an object');
	}
	if (!isPositiveInteger(value.page)) {
		throw protocolError('each "page" must be a positive integer');
	}
	if (typeof value.part !== "string") {
		throw protocolError('each "part" must be a string');
	}
	if (
		typeof value.duration !== "number" ||
		!Number.isFinite(value.duration) ||
		value.duration < 0
	) {
		throw protocolError('each "duration" must be a non-negative number');
	}
	return {
		page: value.page,
		part: value.part,
		duration: value.duration,
	};
}

function validateResponseBilibiliPages(
	value: unknown,
	availablePages: Set<number>,
): number[] {
	if (!Array.isArray(value)) {
		throw protocolError('"previous_pages" must be an array or null');
	}
	if (
		value.some(
			(page) =>
				!isPositiveInteger(page) || !availablePages.has(page as number),
		) ||
		new Set(value).size !== value.length
	) {
		throw protocolError(
			'"previous_pages" must contain distinct available page numbers',
		);
	}
	return value.slice() as number[];
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseStartResponse(
	response: TransportResponse,
): StartTranscriptionResponse {
	const payload = parseJson(response);
	if (!isRecord(payload)) {
		throw protocolError("expected a JSON object response");
	}
	const taskId = nonEmptyString(payload.task_id);
	if (!taskId) {
		throw protocolError('expected non-empty "task_id"');
	}
	const reused = payload.reused_task_id;
	if (reused !== undefined && reused !== null && typeof reused !== "string") {
		throw protocolError(
			'"reused_task_id" must be a string, null, or absent',
		);
	}
	return {
		taskId,
		reusedTaskId: typeof reused === "string" ? reused : null,
	};
}

function parseBaseUrl(raw: string): URL {
	try {
		return new URL(raw.trim());
	} catch {
		throw invalidBaseUrlError();
	}
}

function normalizeBaseUrl(raw: string): string {
	const parsed = parseBaseUrl(raw);
	if (parsed.protocol !== "http:") throw invalidBaseUrlError();
	if (parsed.username || parsed.password) throw invalidBaseUrlError();
	if (parsed.search || parsed.hash) throw invalidBaseUrlError();
	if (parsed.pathname !== "" && parsed.pathname !== "/") {
		throw invalidBaseUrlError();
	}
	const host = stripIpv6Brackets(parsed.hostname);
	if (!LOOPBACK_HOSTS.has(host.toLowerCase())) throw invalidBaseUrlError();
	return parsed.protocol + "//" + parsed.host;
}

function stripIpv6Brackets(hostname: string): string {
	return hostname.startsWith("[") && hostname.endsWith("]")
		? hostname.slice(1, -1)
		: hostname;
}

function invalidBaseUrlError(): Video2KnowledgeClientError {
	return new Video2KnowledgeClientError(
		"invalid-base-url",
		"Video2Knowledge base URL must be a loopback http URL on 127.0.0.1, localhost, or ::1.",
	);
}

function requireNonEmpty(value: string, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Video2KnowledgeClientError(
			"invalid-request",
			field + " is required.",
		);
	}
	return value.trim();
}

function nonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	return value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTransportResponse(value: unknown): value is TransportResponse {
	if (!isRecord(value)) return false;
	return (
		typeof value.status === "number" &&
		Number.isFinite(value.status) &&
		typeof value.text === "string"
	);
}

function parseJson(response: TransportResponse): unknown {
	try {
		return JSON.parse(response.text);
	} catch {
		throw new Video2KnowledgeClientError(
			"invalid-json",
			"Video2Knowledge response was not valid JSON.",
		);
	}
}

function protocolError(reason: string): Video2KnowledgeClientError {
	return new Video2KnowledgeClientError(
		"protocol-error",
		"Video2Knowledge response did not match the expected contract: " +
			reason +
			".",
	);
}

function httpError(response: TransportResponse): Video2KnowledgeClientError {
	const detail = extractErrorDetail(response.text);
	const base =
		"Video2Knowledge request failed with status " + response.status + ".";
	const message = detail
		? base +
			" " +
			truncate(redactSensitive(detail), MAX_ERROR_DETAIL_LENGTH)
		: base;
	return new Video2KnowledgeClientError("http-error", message, {
		status: response.status,
	});
}

function extractErrorDetail(text: string): string | null {
	try {
		const parsed = JSON.parse(text);
		if (isRecord(parsed) && typeof parsed.detail === "string") {
			return parsed.detail;
		}
	} catch {
		// Non-JSON error bodies are intentionally not echoed into the error.
	}
	return null;
}

function transportError(): Video2KnowledgeClientError {
	return new Video2KnowledgeClientError(
		"transport-error",
		"Video2Knowledge transport request failed.",
	);
}

function truncate(text: string, maxLength: number): string {
	return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function redactSensitive(text: string): string {
	let result = text;
	for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
		result = result.replace(pattern, replacement);
	}
	return result;
}
