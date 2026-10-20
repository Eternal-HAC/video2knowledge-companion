import {
	TranscriptionRunner,
	type TranscriptionRunnerClient,
} from "src/video2knowledge/transcription-runner";
import {
	TranscriptionRunError,
	Video2KnowledgeClientError,
	type MarkdownTranscript,
	type StartTranscriptionRequest,
	type TranscriptionTask,
	type Video2KnowledgeHealth,
} from "src/video2knowledge/types";

const REQUEST: StartTranscriptionRequest = {
	videoUrl: "https://youtu.be/dQw4w9WgXcQ",
};

const HEALTH: Video2KnowledgeHealth = {
	status: "ok",
	service: "VideoToNo",
	version: "1.4.2",
};

const FAST = { pollIntervalMs: 10, timeoutMs: 60000 };

const NON_TERMINAL_STATUSES: TranscriptionTask["status"][] = [
	"pending",
	"queued",
	"processing",
	"cancelling",
];

function task(
	status: TranscriptionTask["status"],
	extra: Partial<TranscriptionTask> = {},
): TranscriptionTask {
	return { taskId: "t-1", status, ...extra };
}

interface Harness {
	client: TranscriptionRunnerClient;
	calls: string[];
}

function createClient(tasks: TranscriptionTask[]): Harness {
	const calls: string[] = [];
	const queue = [...tasks];
	const client: TranscriptionRunnerClient = {
		async health() {
			calls.push("health");
			return HEALTH;
		},
		async startTranscription() {
			calls.push("start");
			return { taskId: "t-1", reusedTaskId: null };
		},
		async getTask(taskId: string) {
			calls.push("getTask:" + taskId);
			const next = queue.shift();
			if (!next) throw new Error("unexpected getTask");
			return next;
		},
		async getMarkdownTranscript(taskId: string) {
			calls.push("transcript:" + taskId);
			return { taskId, format: "markdown", title: "", text: "hello\n" };
		},
	};
	return { client, calls };
}

function createClock() {
	const state = { t: 0 };
	const waits: number[] = [];
	return {
		state,
		waits,
		now: () => state.t,
		wait: async (ms: number) => {
			waits.push(ms);
			state.t += ms;
		},
	};
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected the promise to reject");
}

function clientWithError(
	stage: "health" | "start" | "getTask" | "transcript",
	error: Video2KnowledgeClientError,
): TranscriptionRunnerClient {
	return {
		async health() {
			if (stage === "health") throw error;
			return HEALTH;
		},
		async startTranscription() {
			if (stage === "start") throw error;
			return { taskId: "t-1", reusedTaskId: null };
		},
		async getTask(taskId: string) {
			if (stage === "getTask") throw error;
			return { taskId, status: "completed" };
		},
		async getMarkdownTranscript(taskId: string) {
			if (stage === "transcript") throw error;
			return { taskId, format: "markdown", title: "", text: "x" };
		},
	};
}

describe("TranscriptionRunner", () => {
	it("does not call the client on construction", () => {
		const { client, calls } = createClient([]);
		new TranscriptionRunner({ client });
		new TranscriptionRunner({ client, wait: async () => {}, now: () => 0 });
		expect(calls).toHaveLength(0);
	});

	it("runs health, start, poll, then transcript in order", async () => {
		const { client, calls } = createClient([
			task("pending"),
			task("processing"),
			task("completed"),
		]);
		const clock = createClock();
		const progress: string[] = [];
		const runner = new TranscriptionRunner({
			client,
			wait: clock.wait,
			now: clock.now,
		});
		const result = await runner.run(REQUEST, {
			...FAST,
			onProgress: (current) => progress.push(current.status),
		});
		expect(calls).toEqual([
			"health",
			"start",
			"getTask:t-1",
			"getTask:t-1",
			"getTask:t-1",
			"transcript:t-1",
		]);
		expect(progress).toEqual(["pending", "processing", "completed"]);
		expect(result).toEqual({
			taskId: "t-1",
			format: "markdown",
			title: "",
			text: "hello\n",
		});
	});

	it("does not wait when the first status is already completed", async () => {
		const { client, calls } = createClient([task("completed")]);
		const clock = createClock();
		const runner = new TranscriptionRunner({
			client,
			wait: clock.wait,
			now: clock.now,
		});
		await runner.run(REQUEST, FAST);
		expect(clock.waits).toEqual([]);
		expect(calls).toEqual([
			"health",
			"start",
			"getTask:t-1",
			"transcript:t-1",
		]);
	});

	it("uses the new task id even when reusedTaskId is present", async () => {
		const calls: string[] = [];
		const client: TranscriptionRunnerClient = {
			async health() {
				return HEALTH;
			},
			async startTranscription() {
				return { taskId: "t-new", reusedTaskId: "t-old" };
			},
			async getTask(taskId: string) {
				calls.push("getTask:" + taskId);
				return { taskId, status: "completed" };
			},
			async getMarkdownTranscript(taskId: string) {
				calls.push("transcript:" + taskId);
				return { taskId, format: "markdown", title: "", text: "x" };
			},
		};
		const runner = new TranscriptionRunner({
			client,
			wait: async () => {},
			now: () => 0,
		});
		await runner.run(REQUEST, FAST);
		expect(calls).toEqual(["getTask:t-new", "transcript:t-new"]);
	});

	it.each(NON_TERMINAL_STATUSES)(
		"keeps polling after a %s status",
		async (status) => {
			const { client, calls } = createClient([
				task(status),
				task("completed"),
			]);
			const runner = new TranscriptionRunner({
				client,
				wait: async () => {},
				now: () => 0,
			});
			await runner.run(REQUEST, FAST);
			expect(calls).toEqual([
				"health",
				"start",
				"getTask:t-1",
				"getTask:t-1",
				"transcript:t-1",
			]);
		},
	);

	it("reports each polled status to onProgress exactly once in order", async () => {
		const { client } = createClient([
			task("queued"),
			task("processing"),
			task("cancelling"),
			task("completed"),
		]);
		const progress: string[] = [];
		const runner = new TranscriptionRunner({
			client,
			wait: async () => {},
			now: () => 0,
		});
		await runner.run(REQUEST, {
			...FAST,
			onProgress: (current) => progress.push(current.status),
		});
		expect(progress).toEqual([
			"queued",
			"processing",
			"cancelling",
			"completed",
		]);
	});

	it("throws a failed run error without leaking task.error and skips the transcript", async () => {
		const secret = "failed for sk-leak-abcdef with token=tokensecret";
		const { client, calls } = createClient([
			task("failed", { error: secret }),
		]);
		const runner = new TranscriptionRunner({
			client,
			wait: async () => {},
			now: () => 0,
		});
		const error = await captureError(runner.run(REQUEST, FAST));
		expect(error).toBeInstanceOf(TranscriptionRunError);
		const runError = error as TranscriptionRunError;
		expect(runError.kind).toBe("failed");
		expect(runError.taskId).toBe("t-1");
		expect(runError.message).not.toContain(secret);
		expect(runError.message).not.toContain("sk-leak-abcdef");
		expect(runError.message).not.toContain("tokensecret");
		expect(calls).not.toContain("transcript:t-1");
	});

	it("throws a cancelled run error for a backend cancelled task and skips the transcript", async () => {
		const { client, calls } = createClient([task("cancelled")]);
		const runner = new TranscriptionRunner({
			client,
			wait: async () => {},
			now: () => 0,
		});
		const error = await captureError(runner.run(REQUEST, FAST));
		expect(error).toBeInstanceOf(TranscriptionRunError);
		const runError = error as TranscriptionRunError;
		expect(runError.kind).toBe("cancelled");
		expect(runError.taskId).toBe("t-1");
		expect(calls).not.toContain("transcript:t-1");
	});

	it("does not call the client when cancelled before starting", async () => {
		const { client, calls } = createClient([task("completed")]);
		const runner = new TranscriptionRunner({
			client,
			wait: async () => {},
			now: () => 0,
		});
		const error = await captureError(
			runner.run(REQUEST, { ...FAST, isCancelled: () => true }),
		);
		expect((error as TranscriptionRunError).kind).toBe("cancelled");
		expect(calls).toEqual([]);
	});

	it("does not start when cancelled right after health", async () => {
		const { client, calls } = createClient([task("completed")]);
		let checks = 0;
		const runner = new TranscriptionRunner({
			client,
			wait: async () => {},
			now: () => 0,
		});
		const error = await captureError(
			runner.run(REQUEST, {
				...FAST,
				isCancelled: () => {
					checks += 1;
					return checks >= 2;
				},
			}),
		);
		expect((error as TranscriptionRunError).kind).toBe("cancelled");
		expect(calls).toEqual(["health"]);
	});

	it("stops local waiting on cancel without claiming backend cancellation", async () => {
		const { client, calls } = createClient([task("processing")]);
		const clock = createClock();
		let checks = 0;
		const runner = new TranscriptionRunner({
			client,
			wait: clock.wait,
			now: clock.now,
		});
		const error = await captureError(
			runner.run(REQUEST, {
				...FAST,
				isCancelled: () => {
					checks += 1;
					return checks >= 4;
				},
			}),
		);
		const runError = error as TranscriptionRunError;
		expect(runError.kind).toBe("cancelled");
		expect(runError.message).toContain("no backend cancellation");
		expect(calls).toEqual(["health", "start", "getTask:t-1"]);
		expect(clock.waits).toEqual([]);
	});

	it("times out as soon as the observed elapsed reaches the budget", async () => {
		const { client, calls } = createClient([
			task("pending"),
			task("pending"),
		]);
		const clock = createClock();
		const runner = new TranscriptionRunner({
			client,
			wait: clock.wait,
			now: clock.now,
		});
		const error = await captureError(
			runner.run(REQUEST, { pollIntervalMs: 1000, timeoutMs: 1000 }),
		);
		expect((error as TranscriptionRunError).kind).toBe("timeout");
		expect(calls).toEqual(["health", "start", "getTask:t-1"]);
	});

	it("does not wait or fetch the task again after timing out", async () => {
		const { client, calls } = createClient([
			task("pending"),
			task("pending"),
		]);
		const clock = createClock();
		const runner = new TranscriptionRunner({
			client,
			wait: clock.wait,
			now: clock.now,
		});
		await captureError(
			runner.run(REQUEST, { pollIntervalMs: 1000, timeoutMs: 1000 }),
		);
		expect(clock.waits).toEqual([1000]);
		expect(
			calls.filter((entry) => entry.startsWith("getTask")),
		).toHaveLength(1);
	});

	it.each([0, -1, NaN, Infinity])(
		"rejects an invalid pollIntervalMs (%p) without calling the client",
		async (value) => {
			const { client, calls } = createClient([task("completed")]);
			const runner = new TranscriptionRunner({
				client,
				wait: async () => {},
				now: () => 0,
			});
			const error = await captureError(
				runner.run(REQUEST, { pollIntervalMs: value, timeoutMs: 1000 }),
			);
			expect(error).toBeInstanceOf(TranscriptionRunError);
			expect((error as TranscriptionRunError).kind).toBe(
				"invalid-options",
			);
			expect(calls).toEqual([]);
		},
	);

	it.each([0, -1, NaN, Infinity])(
		"rejects an invalid timeoutMs (%p) without calling the client",
		async (value) => {
			const { client, calls } = createClient([task("completed")]);
			const runner = new TranscriptionRunner({
				client,
				wait: async () => {},
				now: () => 0,
			});
			const error = await captureError(
				runner.run(REQUEST, { pollIntervalMs: 1000, timeoutMs: value }),
			);
			expect((error as TranscriptionRunError).kind).toBe(
				"invalid-options",
			);
			expect(calls).toEqual([]);
		},
	);

	it.each(["health", "start", "getTask", "transcript"] as const)(
		"propagates a Video2KnowledgeClientError from %s unchanged",
		async (stage) => {
			const failure = new Video2KnowledgeClientError(
				"http-error",
				"boom",
				{ status: 500 },
			);
			const client = clientWithError(stage, failure);
			const runner = new TranscriptionRunner({
				client,
				wait: async () => {},
				now: () => 0,
			});
			const error = await captureError(runner.run(REQUEST, FAST));
			expect(error).toBe(failure);
			expect((error as Video2KnowledgeClientError).kind).toBe(
				"http-error",
			);
			expect((error as Video2KnowledgeClientError).status).toBe(500);
		},
	);

	it("propagates a wait rejection unchanged", async () => {
		const failure = new Error("wait failed");
		const { client } = createClient([task("pending")]);
		const runner = new TranscriptionRunner({
			client,
			wait: async () => {
				throw failure;
			},
			now: () => 0,
		});
		const error = await captureError(runner.run(REQUEST, FAST));
		expect(error).toBe(failure);
	});

	it("propagates an onProgress error instead of swallowing it", async () => {
		const failure = new Error("progress handler failed");
		const { client } = createClient([task("pending")]);
		const runner = new TranscriptionRunner({
			client,
			wait: async () => {},
			now: () => 0,
		});
		const error = await captureError(
			runner.run(REQUEST, {
				...FAST,
				onProgress: () => {
					throw failure;
				},
			}),
		);
		expect(error).toBe(failure);
	});

	it("propagates an isCancelled error instead of treating it as cancellation", async () => {
		const failure = new Error("cancel predicate failed");
		const { client, calls } = createClient([task("completed")]);
		const runner = new TranscriptionRunner({
			client,
			wait: async () => {},
			now: () => 0,
		});
		const error = await captureError(
			runner.run(REQUEST, {
				...FAST,
				isCancelled: () => {
					throw failure;
				},
			}),
		);
		expect(error).toBe(failure);
		expect(calls).toEqual([]);
	});

	it("does not let a non-monotonic now() extend the run indefinitely", async () => {
		const { client, calls } = createClient([
			task("pending"),
			task("pending"),
			task("pending"),
			task("pending"),
			task("pending"),
		]);
		const script = [2000, 1000, 3000];
		let waitCall = 0;
		const clock = { t: 0 };
		const runner = new TranscriptionRunner({
			client,
			wait: async () => {
				clock.t = script[Math.min(waitCall, script.length - 1)];
				waitCall += 1;
			},
			now: () => clock.t,
		});
		const error = await captureError(
			runner.run(REQUEST, { pollIntervalMs: 1000, timeoutMs: 3000 }),
		);
		expect((error as TranscriptionRunError).kind).toBe("timeout");
		expect(
			calls.filter((entry) => entry.startsWith("getTask")),
		).toHaveLength(3);
	});

	it("returns the transcript object unchanged", async () => {
		const raw: MarkdownTranscript = {
			taskId: "t-1",
			format: "markdown",
			title: "T",
			text: "\n  keep  \n",
		};
		const client: TranscriptionRunnerClient = {
			async health() {
				return HEALTH;
			},
			async startTranscription() {
				return { taskId: "t-1", reusedTaskId: null };
			},
			async getTask(taskId: string) {
				return { taskId, status: "completed" };
			},
			async getMarkdownTranscript() {
				return raw;
			},
		};
		const runner = new TranscriptionRunner({
			client,
			wait: async () => {},
			now: () => 0,
		});
		await expect(runner.run(REQUEST, FAST)).resolves.toBe(raw);
	});
});
