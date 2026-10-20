import {
	SummaryRunError,
	type MarkdownSummary,
	type StartSummaryRequest,
	type StartSummaryResponse,
	type TranscriptionTask,
	type Video2KnowledgeHealth,
} from "./types";

export interface SummaryRunnerClient {
	health(): Promise<Video2KnowledgeHealth>;
	startSummary(request: StartSummaryRequest): Promise<StartSummaryResponse>;
	getTask(taskId: string): Promise<TranscriptionTask>;
	getMarkdownSummary(taskId: string): Promise<MarkdownSummary>;
}

export interface SummaryRunnerDependencies {
	client: SummaryRunnerClient;
	wait?: (ms: number) => Promise<void>;
	now?: () => number;
}

export interface SummaryRunnerOptions {
	pollIntervalMs?: number;
	timeoutMs?: number;
	isCancelled?: () => boolean;
	onProgress?: (task: TranscriptionTask) => void;
}

export const DEFAULT_SUMMARY_POLL_INTERVAL_MS = 2000;
export const DEFAULT_SUMMARY_TIMEOUT_MS = 30 * 60 * 1000;

const CANCELLED_MESSAGE =
	"Summary run was cancelled locally and no backend cancellation was sent.";
const FAILED_MESSAGE = "The summary task failed.";
const TIMEOUT_MESSAGE = "The summary run exceeded its time budget.";

export class SummaryRunner {
	private readonly client: SummaryRunnerClient;
	private readonly wait: (ms: number) => Promise<void>;
	private readonly now: () => number;

	constructor(dependencies: SummaryRunnerDependencies) {
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
		request: StartSummaryRequest,
		options: SummaryRunnerOptions = {},
	): Promise<MarkdownSummary> {
		const pollIntervalMs =
			options.pollIntervalMs ?? DEFAULT_SUMMARY_POLL_INTERVAL_MS;
		const timeoutMs = options.timeoutMs ?? DEFAULT_SUMMARY_TIMEOUT_MS;
		requirePositiveFinite(pollIntervalMs, "pollIntervalMs");
		requirePositiveFinite(timeoutMs, "timeoutMs");

		const startedAt = this.now();
		let maxElapsed = 0;
		const elapsed = (): number => {
			const raw = this.now() - startedAt;
			if (Number.isFinite(raw) && raw > maxElapsed) maxElapsed = raw;
			return maxElapsed;
		};

		if (isCancelled(options)) throw cancelledError();
		await this.client.health();
		if (isCancelled(options)) throw cancelledError();

		const { taskId } = await this.client.startSummary(request);

		while (true) {
			if (isCancelled(options)) throw cancelledError(taskId);
			if (elapsed() >= timeoutMs) throw timeoutError(taskId);

			const task = await this.client.getTask(taskId);
			options.onProgress?.(task);

			if (task.status === "completed") {
				return await this.client.getMarkdownSummary(taskId);
			}
			if (task.status === "failed") throw failedError(taskId);
			if (task.status === "cancelled") throw cancelledError(taskId);

			if (isCancelled(options)) throw cancelledError(taskId);
			if (elapsed() >= timeoutMs) throw timeoutError(taskId);
			await this.wait(pollIntervalMs);
		}
	}
}

function isCancelled(options: SummaryRunnerOptions): boolean {
	return options.isCancelled ? options.isCancelled() : false;
}

function requirePositiveFinite(value: number, field: string): void {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new SummaryRunError(
			"invalid-options",
			field + " must be a finite number greater than 0.",
		);
	}
}

function cancelledError(taskId?: string): SummaryRunError {
	return new SummaryRunError("cancelled", CANCELLED_MESSAGE, taskId);
}

function failedError(taskId?: string): SummaryRunError {
	return new SummaryRunError("failed", FAILED_MESSAGE, taskId);
}

function timeoutError(taskId?: string): SummaryRunError {
	return new SummaryRunError("timeout", TIMEOUT_MESSAGE, taskId);
}
