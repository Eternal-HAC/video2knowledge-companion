export type TranscriptionTaskStatus =
	| "pending"
	| "queued"
	| "processing"
	| "cancelling"
	| "completed"
	| "failed"
	| "cancelled";

export type TranscriptionProcessingMode = "reuse" | "restart";

export interface Video2KnowledgeHealth {
	status: "ok";
	service: string;
	version: string;
}

export interface StartTranscriptionRequest {
	videoUrl: string;
	processingMode?: TranscriptionProcessingMode;
	preferSubtitles?: boolean;
	whisperModel?: string;
	useGpu?: boolean;
	bilibiliPages?: number[];
}

export interface BilibiliPage {
	page: number;
	part: string;
	duration: number;
}

export interface BilibiliPagesPreview {
	title: string;
	totalPages: number;
	pages: BilibiliPage[];
	previousPages: number[] | null;
}

export interface StartTranscriptionResponse {
	taskId: string;
	reusedTaskId: string | null;
}

export interface StartSummaryRequest {
	videoUrl: string;
	processingMode?: TranscriptionProcessingMode;
	preferSubtitles?: boolean;
	whisperModel?: string;
	useGpu?: boolean;
}

export interface StartSummaryResponse {
	taskId: string;
	reusedTaskId: string | null;
}

export interface TranscriptionTask {
	taskId: string;
	status: TranscriptionTaskStatus;
	stepName?: string;
	progress?: number;
	progressMessage?: string;
	error?: string | null;
}

export interface MarkdownTranscript {
	taskId: string;
	format: "markdown";
	title: string;
	text: string;
}

export interface MarkdownSummary {
	taskId: string;
	format: "markdown";
	text: string;
}

export type TransportMethod = "GET" | "POST";

export interface TransportRequest {
	method: TransportMethod;
	url: string;
	headers?: Record<string, string>;
	body?: string;
}

export interface TransportResponse {
	status: number;
	text: string;
}

export interface Video2KnowledgeTransport {
	request(request: TransportRequest): Promise<TransportResponse>;
}

export type Video2KnowledgeClientErrorKind =
	| "invalid-base-url"
	| "invalid-request"
	| "transport-error"
	| "http-error"
	| "invalid-json"
	| "protocol-error";

export class Video2KnowledgeClientError extends Error {
	readonly kind: Video2KnowledgeClientErrorKind;
	readonly status?: number;

	constructor(
		kind: Video2KnowledgeClientErrorKind,
		message: string,
		options: { status?: number } = {},
	) {
		super(message);
		this.name = "Video2KnowledgeClientError";
		this.kind = kind;
		this.status = options.status;
	}
}

export type TranscriptionRunErrorKind =
	| "failed"
	| "cancelled"
	| "timeout"
	| "invalid-options";

export class TranscriptionRunError extends Error {
	readonly kind: TranscriptionRunErrorKind;
	readonly taskId?: string;

	constructor(
		kind: TranscriptionRunErrorKind,
		message: string,
		taskId?: string,
	) {
		super(message);
		this.name = "TranscriptionRunError";
		this.kind = kind;
		this.taskId = taskId;
	}
}

export type SummaryRunErrorKind =
	| "failed"
	| "cancelled"
	| "timeout"
	| "invalid-options";

export class SummaryRunError extends Error {
	readonly kind: SummaryRunErrorKind;
	readonly taskId?: string;

	constructor(kind: SummaryRunErrorKind, message: string, taskId?: string) {
		super(message);
		this.name = "SummaryRunError";
		this.kind = kind;
		this.taskId = taskId;
	}
}
