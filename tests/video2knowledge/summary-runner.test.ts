import {
	SummaryRunner,
	type SummaryRunnerClient,
} from "src/video2knowledge/summary-runner";
import {
	SummaryRunError,
	Video2KnowledgeClientError,
	type MarkdownSummary,
	type StartSummaryRequest,
	type TranscriptionTask,
} from "src/video2knowledge/types";

const REQUEST: StartSummaryRequest = {
	videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
};

const SUMMARY: MarkdownSummary = {
	taskId: "t-1",
	format: "markdown",
	text: "# Summary\n\nBody",
};

function task(status: TranscriptionTask["status"]): TranscriptionTask {
	return { taskId: "t-1", status };
}

function createClient(statuses: TranscriptionTask[]) {
	const calls: string[] = [];
	const queue = [...statuses];
	const client: SummaryRunnerClient = {
		async health() {
			calls.push("health");
			return { status: "ok", service: "VideoToNo", version: "1.4.2" };
		},
		async startSummary(request) {
			calls.push("start:" + request.videoUrl);
			return { taskId: "t-1", reusedTaskId: null };
		},
		async getTask(taskId) {
			calls.push("task:" + taskId);
			const next = queue.shift();
			if (!next) throw new Error("unexpected getTask");
			return next;
		},
		async getMarkdownSummary(taskId) {
			calls.push("summary:" + taskId);
			return SUMMARY;
		},
	};
	return { client, calls };
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected rejection");
}

describe("SummaryRunner", () => {
	it("runs health, start, polling, and Markdown download in order", async () => {
		const { client, calls } = createClient([
			task("queued"),
			task("processing"),
			task("completed"),
		]);
		const progress: string[] = [];
		const runner = new SummaryRunner({
			client,
			wait: async () => {
				calls.push("wait");
			},
			now: () => 0,
		});
		await expect(
			runner.run(REQUEST, {
				pollIntervalMs: 1,
				timeoutMs: 100,
				onProgress: (current) => progress.push(current.status),
			}),
		).resolves.toBe(SUMMARY);
		expect(calls).toEqual([
			"health",
			"start:" + REQUEST.videoUrl,
			"task:t-1",
			"wait",
			"task:t-1",
			"wait",
			"task:t-1",
			"summary:t-1",
		]);
		expect(progress).toEqual(["queued", "processing", "completed"]);
	});

	it("stops before health when locally cancelled", async () => {
		const { client, calls } = createClient([task("completed")]);
		const runner = new SummaryRunner({ client, now: () => 0 });
		const error = await captureError(
			runner.run(REQUEST, { isCancelled: () => true }),
		);
		expect(error).toBeInstanceOf(SummaryRunError);
		expect((error as SummaryRunError).kind).toBe("cancelled");
		expect(calls).toEqual([]);
	});

	it.each(["failed", "cancelled"] as const)(
		"maps backend %s to a stable run error",
		async (status) => {
			const { client } = createClient([task(status)]);
			const runner = new SummaryRunner({ client, now: () => 0 });
			const error = await captureError(
				runner.run(REQUEST, { pollIntervalMs: 1, timeoutMs: 100 }),
			);
			expect(error).toBeInstanceOf(SummaryRunError);
			expect((error as SummaryRunError).kind).toBe(status);
			expect((error as SummaryRunError).taskId).toBe("t-1");
		},
	);

	it("times out with the backend task id", async () => {
		const { client } = createClient([task("processing")]);
		let now = 0;
		const runner = new SummaryRunner({
			client,
			wait: async () => {
				now = 100;
			},
			now: () => now,
		});
		const error = await captureError(
			runner.run(REQUEST, { pollIntervalMs: 1, timeoutMs: 100 }),
		);
		expect((error as SummaryRunError).kind).toBe("timeout");
		expect((error as SummaryRunError).taskId).toBe("t-1");
	});

	it.each([0, -1, NaN, Infinity])(
		"rejects invalid poll interval %p before calling the client",
		async (pollIntervalMs) => {
			const { client, calls } = createClient([task("completed")]);
			const runner = new SummaryRunner({ client, now: () => 0 });
			const error = await captureError(
				runner.run(REQUEST, { pollIntervalMs }),
			);
			expect((error as SummaryRunError).kind).toBe("invalid-options");
			expect(calls).toEqual([]);
		},
	);

	it("propagates client errors unchanged", async () => {
		const failure = new Video2KnowledgeClientError(
			"http-error",
			"safe failure",
			{ status: 500 },
		);
		const client: SummaryRunnerClient = {
			async health() {
				throw failure;
			},
			async startSummary() {
				throw new Error("unreachable");
			},
			async getTask() {
				throw new Error("unreachable");
			},
			async getMarkdownSummary() {
				throw new Error("unreachable");
			},
		};
		const runner = new SummaryRunner({ client, now: () => 0 });
		await expect(runner.run(REQUEST)).rejects.toBe(failure);
	});

	it("does not let a backwards clock extend the timeout", async () => {
		const { client, calls } = createClient([
			task("processing"),
			task("processing"),
			task("processing"),
		]);
		const times = [0, 20, 10, 30];
		let index = 0;
		const runner = new SummaryRunner({
			client,
			wait: async () => {},
			now: () => times[Math.min(index++, times.length - 1)],
		});
		const error = await captureError(
			runner.run(REQUEST, { pollIntervalMs: 1, timeoutMs: 30 }),
		);
		expect((error as SummaryRunError).kind).toBe("timeout");
		expect(
			calls.filter((call) => call === "task:t-1").length,
		).toBeGreaterThan(0);
	});
});
