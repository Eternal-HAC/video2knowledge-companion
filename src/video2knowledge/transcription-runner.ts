import {
	TranscriptionRunError,
	type MarkdownTranscript,
	type StartTranscriptionRequest,
	type StartTranscriptionResponse,
	type TranscriptionTask,
	type Video2KnowledgeHealth,
} from "./types";

export interface TranscriptionRunnerClient {
	health(): Promise<Video2KnowledgeHealth>;
	startTranscription(
		request: StartTranscriptionRequest,
	): Promise<StartTranscriptionResponse>;
	getTask(taskId: string): Promise<TranscriptionTask>;
	getMarkdownTranscript(taskId: string): Promise<MarkdownTranscript>;
}

export interface TranscriptionRunnerDependencies {
	client: TranscriptionRunnerClient;
	wait?: (ms: number) => Promise<void>;
	now?: () => number;
}

export interface TranscriptionRunnerOptions {
	pollIntervalMs?: number;
	timeoutMs?: number;
	isCancelled?: () => boolean;
	onProgress?: (task: TranscriptionTask) => void;
}

export const DEFAULT_POLL_INTERVAL_MS = 2000;
export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

const CANCELLED_MESSAGE =
	"Transcription run was cancelled locally and no backend cancellation was sent.";
const FAILED_MESSAGE = "The transcription task failed.";
const TIMEOUT_MESSAGE = "The transcription run exceeded its time budget.";

export class TranscriptionRunner {
	private readonly client: TranscriptionRunnerClient;
	private readonly wait: (ms: number) => Promise<void>;
	private readonly now: () => number;

	constructor(dependencies: TranscriptionRunnerDependencies) {
		this.client = dependencies.client;
		this.wait =
			dependencies.wait ??
			((ms: number) =>
				new Promise<void>((resolve) => {
					setTimeout(resolve, ms);
				}));
		this.now = dependencies.now ?? (() => Date.now());
	}

	async run(
		request: StartTranscriptionRequest,
		options: TranscriptionRunnerOptions = {},
	): Promise<MarkdownTranscript> {
		const pollIntervalMs =
			options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		requirePositiveFinite(pollIntervalMs, "pollIntervalMs");
		requirePositiveFinite(timeoutMs, "timeoutMs");

		const startedAt = this.now();
		let maxElapsed = 0;
		const elapsed = (): number => {
			const raw = this.now() - startedAt;
			if (Number.isFinite(raw) && raw > maxElapsed) {
				maxElapsed = raw;
			}
			return maxElapsed;
		};

		if (isCancelled(options)) throw cancelledError();

		await this.client.health();
		if (isCancelled(options)) throw cancelledError();

		const { taskId } = await this.client.startTranscription(request);

		while (true) {
			if (isCancelled(options)) throw cancelledError(taskId);
			if (elapsed() >= timeoutMs) throw timeoutError(taskId);

			const task = await this.client.getTask(taskId);
			options.onProgress?.(task);

			if (task.status === "completed") {
				return await this.client.getMarkdownTranscript(taskId);
			}
			if (task.status === "failed") throw failedError(taskId);
			if (task.status === "cancelled") throw cancelledError(taskId);

			if (isCancelled(options)) throw cancelledError(taskId);
			if (elapsed() >= timeoutMs) throw timeoutError(taskId);
			await this.wait(pollIntervalMs);
		}
	}
}

function isCancelled(options: TranscriptionRunnerOptions): boolean {
	return options.isCancelled ? options.isCancelled() : false;
}

function requirePositiveFinite(value: number, field: string): void {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new TranscriptionRunError(
			"invalid-options",
			field + " must be a finite number greater than 0.",
		);
	}
}

function cancelledError(taskId?: string): TranscriptionRunError {
	return new TranscriptionRunError("cancelled", CANCELLED_MESSAGE, taskId);
}

function failedError(taskId?: string): TranscriptionRunError {
	return new TranscriptionRunError("failed", FAILED_MESSAGE, taskId);
}

function timeoutError(taskId?: string): TranscriptionRunError {
	return new TranscriptionRunError("timeout", TIMEOUT_MESSAGE, taskId);
}
