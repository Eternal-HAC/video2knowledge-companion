import { Video2KnowledgeClient } from "src/video2knowledge/client";
import {
	Video2KnowledgeClientError,
	type TransportRequest,
	type TransportResponse,
	type Video2KnowledgeTransport,
} from "src/video2knowledge/types";

interface RecordedRequest {
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: string;
}

function createTransport(
	handler: (request: TransportRequest) => TransportResponse,
): { transport: Video2KnowledgeTransport; requests: RecordedRequest[] } {
	const requests: RecordedRequest[] = [];
	const transport: Video2KnowledgeTransport = {
		async request(request: TransportRequest) {
			requests.push({
				method: request.method,
				url: request.url,
				headers: request.headers,
				body: request.body,
			});
			return handler(request);
		},
	};
	return { transport, requests };
}

async function captureError(
	promise: Promise<unknown>,
): Promise<Video2KnowledgeClientError> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Video2KnowledgeClientError) return error;
		throw error;
	}
	throw new Error("expected the promise to reject");
}

const HEALTH_OK = JSON.stringify({
	status: "ok",
	service: "VideoToNo",
	version: "1.4.2",
});

const START_OK = JSON.stringify({ task_id: "t-1", reused_task_id: null });

const MARKDOWN_TEXT =
	"# 带时间戳转录\n\n[00:00-00:12] 第一段\n[00:12-00:25] 第二段\n";

const TASK_STATUSES = [
	"pending",
	"queued",
	"processing",
	"cancelling",
	"completed",
	"failed",
	"cancelled",
];

function healthClient(text: string = HEALTH_OK, status = 200) {
	return createTransport(() => ({ status, text }));
}

describe("Video2KnowledgeClient base URL handling", () => {
	it("defaults to the loopback http://127.0.0.1:8000", async () => {
		const { transport, requests } = healthClient();
		const client = new Video2KnowledgeClient({ transport });
		await client.health();
		expect(requests[0].url).toBe("http://127.0.0.1:8000/api/health");
	});

	it.each([
		"http://localhost:8123",
		"http://127.0.0.1:8000",
		"http://127.0.0.1:8000/",
		"http://[::1]:8000",
	])(
		"accepts the loopback base URL %s and strips a trailing slash",
		async (baseUrl) => {
			const { transport, requests } = healthClient();
			const client = new Video2KnowledgeClient({ transport, baseUrl });
			await client.health();
			expect(requests[0].url).toBe(
				baseUrl.replace(/\/$/, "") + "/api/health",
			);
		},
	);

	function expectRejectedBaseUrl(baseUrl: string): void {
		const { transport, requests } = healthClient();
		let thrown: unknown;
		try {
			new Video2KnowledgeClient({ transport, baseUrl });
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(Video2KnowledgeClientError);
		expect((thrown as Video2KnowledgeClientError).kind).toBe(
			"invalid-base-url",
		);
		expect(requests).toHaveLength(0);
	}

	it.each([
		"http://example.com:8000",
		"http://192.168.1.10:8000",
		"http://0.0.0.0:8000",
		"http://host.docker.internal:8000",
		"https://127.0.0.1:8000",
		"ftp://127.0.0.1:8000",
		"http://user:pass@127.0.0.1:8000",
		"http://127.0.0.1:8000/api",
		"http://127.0.0.1:8000/?x=1",
		"http://127.0.0.1:8000/#frag",
		"not-a-url",
		"",
	])("rejects the base URL %s with invalid-base-url", (baseUrl) => {
		expectRejectedBaseUrl(baseUrl);
	});
});

describe("Video2KnowledgeClient.health", () => {
	it("issues GET /api/health and returns the minimal fields", async () => {
		const { transport, requests } = healthClient();
		const client = new Video2KnowledgeClient({ transport });
		await expect(client.health()).resolves.toEqual({
			status: "ok",
			service: "VideoToNo",
			version: "1.4.2",
		});
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			method: "GET",
			url: "http://127.0.0.1:8000/api/health",
		});
	});

	it.each([
		[
			"a non-ok status",
			JSON.stringify({
				status: "degraded",
				service: "VideoToNo",
				version: "1.4.2",
			}),
		],
		[
			"a missing service",
			JSON.stringify({ status: "ok", version: "1.4.2" }),
		],
		[
			"an empty version",
			JSON.stringify({ status: "ok", service: "VideoToNo", version: "" }),
		],
		["a non-object payload", JSON.stringify(["ok"])],
	])("rejects %s as protocol-error", async (_name, text) => {
		const { transport } = healthClient(text);
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(client.health());
		expect(error.kind).toBe("protocol-error");
	});

	it("rejects a non-JSON 200 response as invalid-json without echoing the body", async () => {
		const { transport } = healthClient(
			"<html>sk-secretvalue leaked</html>",
		);
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(client.health());
		expect(error.kind).toBe("invalid-json");
		expect(error.message).not.toContain("sk-secretvalue");
	});

	it("wraps a thrown transport failure as transport-error without the URL", async () => {
		const { transport } = createTransport(() => {
			throw new Error(
				"connect ECONNREFUSED http://127.0.0.1:8000/api/health",
			);
		});
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(client.health());
		expect(error.kind).toBe("transport-error");
		expect(error.message).not.toContain("http://127.0.0.1:8000/api/health");
	});

	it("reports a non-2xx response as http-error with the status and detail", async () => {
		const { transport } = healthClient(
			JSON.stringify({ detail: "boom" }),
			503,
		);
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(client.health());
		expect(error.kind).toBe("http-error");
		expect(error.status).toBe(503);
		expect(error.message).toContain("boom");
	});

	it("rejects a different service identity even when status is ok", async () => {
		const { transport } = healthClient(
			JSON.stringify({
				status: "ok",
				service: "OtherService",
				version: "1.0",
			}),
		);
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(client.health());
		expect(error.kind).toBe("protocol-error");
	});

	it("does not echo a transport failure message that contains a URL or body", async () => {
		const leaked =
			'failed body={"video_url":"https://private.example/video","api_key":"sk-abcdef123456"}';
		const { transport } = createTransport(() => {
			throw new Error(leaked);
		});
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(client.health());
		expect(error.kind).toBe("transport-error");
		expect(error.message).toBe("Video2Knowledge transport request failed.");
		expect(error.message).not.toContain("https://private.example/video");
		expect(error.message).not.toContain("video_url");
		expect(error.message).not.toContain("sk-abcdef123456");
		expect(error.message).not.toContain("api_key");
	});
});

describe("Video2KnowledgeClient.startTranscription", () => {
	it("POSTs /api/transcribe with exactly the default five fields", async () => {
		const { transport, requests } = createTransport(() => ({
			status: 200,
			text: START_OK,
		}));
		const client = new Video2KnowledgeClient({ transport });
		const result = await client.startTranscription({
			videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		});
		expect(result).toEqual({ taskId: "t-1", reusedTaskId: null });
		expect(requests[0]).toMatchObject({
			method: "POST",
			url: "http://127.0.0.1:8000/api/transcribe",
			headers: { "Content-Type": "application/json" },
		});
		expect(JSON.parse(String(requests[0].body))).toStrictEqual({
			video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			processing_mode: "reuse",
			prefer_subtitles: true,
			whisper_model: "base",
			use_gpu: false,
		});
		expect(String(requests[0].body)).not.toMatch(
			/llm|api[_-]?key|cookie|token|bilibili|douyin|feishu|screenshot|upload/i,
		);
	});

	it("applies every optional override", async () => {
		const { transport, requests } = createTransport(() => ({
			status: 200,
			text: START_OK,
		}));
		const client = new Video2KnowledgeClient({ transport });
		await client.startTranscription({
			videoUrl: "https://youtu.be/dQw4w9WgXcQ",
			processingMode: "restart",
			preferSubtitles: false,
			whisperModel: "small",
			useGpu: true,
		});
		expect(JSON.parse(String(requests[0].body))).toStrictEqual({
			video_url: "https://youtu.be/dQw4w9WgXcQ",
			processing_mode: "restart",
			prefer_subtitles: false,
			whisper_model: "small",
			use_gpu: true,
		});
	});

	it("adds only bilibili_pages when an explicit Bilibili selection is provided", async () => {
		const { transport, requests } = createTransport(() => ({
			status: 200,
			text: START_OK,
		}));
		const client = new Video2KnowledgeClient({ transport });
		await client.startTranscription({
			videoUrl: "https://www.bilibili.com/video/BV1example",
			bilibiliPages: [1, 3],
		});
		expect(JSON.parse(String(requests[0].body))).toStrictEqual({
			video_url: "https://www.bilibili.com/video/BV1example",
			processing_mode: "reuse",
			prefer_subtitles: true,
			whisper_model: "base",
			use_gpu: false,
			bilibili_pages: [1, 3],
		});
		expect(String(requests[0].body)).not.toMatch(
			/cookie|token|api[_-]?key/i,
		);
	});

	it.each([[[]], [[0]], [[-1]], [[1.5]], [[1, 1]]])(
		"rejects invalid bilibiliPages %p before transport",
		async (bilibiliPages) => {
			const { transport, requests } = createTransport(() => ({
				status: 200,
				text: START_OK,
			}));
			const client = new Video2KnowledgeClient({ transport });
			const error = await captureError(
				client.startTranscription({
					videoUrl: "https://www.bilibili.com/video/BV1example",
					bilibiliPages,
				}),
			);
			expect(error.kind).toBe("invalid-request");
			expect(requests).toHaveLength(0);
		},
	);

	it.each(["", "   "])(
		"rejects an empty videoUrl (%p) before calling the transport",
		async (videoUrl) => {
			const { transport, requests } = createTransport(() => ({
				status: 200,
				text: START_OK,
			}));
			const client = new Video2KnowledgeClient({ transport });
			const error = await captureError(
				client.startTranscription({ videoUrl }),
			);
			expect(error.kind).toBe("invalid-request");
			expect(requests).toHaveLength(0);
		},
	);

	it("returns a string reused_task_id from the response", async () => {
		const text = JSON.stringify({ task_id: "t-1", reused_task_id: "t-0" });
		const { transport } = createTransport(() => ({ status: 200, text }));
		const client = new Video2KnowledgeClient({ transport });
		await expect(
			client.startTranscription({ videoUrl: "https://youtu.be/x" }),
		).resolves.toEqual({ taskId: "t-1", reusedTaskId: "t-0" });
	});

	it("treats an explicit null reused_task_id as null", async () => {
		const text = JSON.stringify({ task_id: "t-1", reused_task_id: null });
		const { transport } = createTransport(() => ({ status: 200, text }));
		const client = new Video2KnowledgeClient({ transport });
		await expect(
			client.startTranscription({ videoUrl: "https://youtu.be/x" }),
		).resolves.toEqual({ taskId: "t-1", reusedTaskId: null });
	});

	it("treats a missing reused_task_id as null", async () => {
		const text = JSON.stringify({ task_id: "t-1" });
		const { transport } = createTransport(() => ({ status: 200, text }));
		const client = new Video2KnowledgeClient({ transport });
		await expect(
			client.startTranscription({ videoUrl: "https://youtu.be/x" }),
		).resolves.toEqual({ taskId: "t-1", reusedTaskId: null });
	});

	it.each([
		["a missing task_id", JSON.stringify({ reused_task_id: null })],
		[
			"a numeric reused_task_id",
			JSON.stringify({ task_id: "t-1", reused_task_id: 5 }),
		],
		["an array payload", JSON.stringify([{ task_id: "t-1" }])],
	])("rejects %s as protocol-error", async (_name, text) => {
		const { transport } = createTransport(() => ({ status: 200, text }));
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(
			client.startTranscription({ videoUrl: "https://youtu.be/x" }),
		);
		expect(error.kind).toBe("protocol-error");
	});
});

describe("Video2KnowledgeClient.previewBilibiliPages", () => {
	it("POSTs the URL without credentials and maps the preview contract", async () => {
		const { transport, requests } = createTransport(() => ({
			status: 200,
			text: JSON.stringify({
				title: "测试视频",
				total_pages: 2,
				pages: [
					{ page: 1, part: "上", duration: 61 },
					{ page: 2, part: "下", duration: 72.5 },
				],
				previous_pages: [2],
			}),
		}));
		const client = new Video2KnowledgeClient({ transport });
		await expect(
			client.previewBilibiliPages(
				"https://www.bilibili.com/video/BV1example?p=2",
			),
		).resolves.toEqual({
			title: "测试视频",
			totalPages: 2,
			pages: [
				{ page: 1, part: "上", duration: 61 },
				{ page: 2, part: "下", duration: 72.5 },
			],
			previousPages: [2],
		});
		expect(requests[0]).toMatchObject({
			method: "POST",
			url: "http://127.0.0.1:8000/api/bili-pages",
			headers: { "Content-Type": "application/json" },
		});
		expect(JSON.parse(String(requests[0].body))).toStrictEqual({
			video_url: "https://www.bilibili.com/video/BV1example?p=2",
		});
		expect(String(requests[0].body)).not.toMatch(
			/cookie|token|api[_-]?key/i,
		);
	});

	it("maps an absent previous_pages field to null", async () => {
		const { transport } = createTransport(() => ({
			status: 200,
			text: JSON.stringify({
				title: "单 P",
				total_pages: 1,
				pages: [{ page: 1, part: "正文", duration: 10 }],
			}),
		}));
		const client = new Video2KnowledgeClient({ transport });
		await expect(
			client.previewBilibiliPages("https://b23.tv/example"),
		).resolves.toMatchObject({ previousPages: null });
	});

	it.each([
		[
			"a total mismatch",
			{ total_pages: 2, pages: [{ page: 1, part: "x", duration: 1 }] },
		],
		[
			"duplicate page numbers",
			{
				total_pages: 2,
				pages: [
					{ page: 1, part: "x", duration: 1 },
					{ page: 1, part: "y", duration: 1 },
				],
			},
		],
		[
			"an unavailable previous page",
			{
				total_pages: 1,
				pages: [{ page: 1, part: "x", duration: 1 }],
				previous_pages: [2],
			},
		],
		[
			"non-consecutive page numbers",
			{
				total_pages: 2,
				pages: [
					{ page: 1, part: "x", duration: 1 },
					{ page: 3, part: "z", duration: 1 },
				],
			},
		],
	])("rejects %s as protocol-error", async (_name, fields) => {
		const { transport } = createTransport(() => ({
			status: 200,
			text: JSON.stringify({ title: "x", ...fields }),
		}));
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(
			client.previewBilibiliPages("https://b23.tv/example"),
		);
		expect(error.kind).toBe("protocol-error");
	});
});

describe("Video2KnowledgeClient.startSummary", () => {
	it("POSTs the fixed DeepSeek detailed-note contract without a real key", async () => {
		const { transport, requests } = createTransport(() => ({
			status: 200,
			text: START_OK,
		}));
		const client = new Video2KnowledgeClient({ transport });
		await expect(
			client.startSummary({
				videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			}),
		).resolves.toEqual({ taskId: "t-1", reusedTaskId: null });
		expect(requests[0]).toMatchObject({
			method: "POST",
			url: "http://127.0.0.1:8000/api/summarize",
			headers: { "Content-Type": "application/json" },
		});
		expect(JSON.parse(String(requests[0].body))).toStrictEqual({
			video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			processing_mode: "reuse",
			output: "note",
			summary_style: "detailed",
			prefer_subtitles: true,
			include_screenshots: false,
			whisper_model: "base",
			use_gpu: false,
			llm_config: { model_type: "deepseek", api_key: "" },
		});
		expect(String(requests[0].body)).not.toMatch(
			/sk-|cookie|token|bilibili|douyin|feishu/i,
		);
	});

	it("applies preprocessing overrides while keeping summary policy fixed", async () => {
		const { transport, requests } = createTransport(() => ({
			status: 200,
			text: START_OK,
		}));
		const client = new Video2KnowledgeClient({ transport });
		await client.startSummary({
			videoUrl: "https://youtu.be/dQw4w9WgXcQ",
			processingMode: "restart",
			preferSubtitles: false,
			whisperModel: "small",
			useGpu: true,
		});
		expect(JSON.parse(String(requests[0].body))).toMatchObject({
			processing_mode: "restart",
			output: "note",
			summary_style: "detailed",
			prefer_subtitles: false,
			whisper_model: "small",
			use_gpu: true,
			llm_config: { model_type: "deepseek", api_key: "" },
		});
	});

	it("rejects a blank video URL before transport", async () => {
		const { transport, requests } = createTransport(() => ({
			status: 200,
			text: START_OK,
		}));
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(
			client.startSummary({ videoUrl: "   " }),
		);
		expect(error.kind).toBe("invalid-request");
		expect(requests).toHaveLength(0);
	});

	it("rejects a malformed start response", async () => {
		const { transport } = createTransport(() => ({
			status: 200,
			text: JSON.stringify({ reused_task_id: null }),
		}));
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(
			client.startSummary({ videoUrl: "https://youtu.be/x" }),
		);
		expect(error.kind).toBe("protocol-error");
	});
});

describe("Video2KnowledgeClient.getTask", () => {
	it("percent-encodes the task id in the path", async () => {
		const { transport, requests } = createTransport(() => ({
			status: 200,
			text: JSON.stringify({ status: "processing" }),
		}));
		const client = new Video2KnowledgeClient({ transport });
		await client.getTask("a/b c");
		expect(requests[0]).toMatchObject({
			method: "GET",
			url: "http://127.0.0.1:8000/api/task/a%2Fb%20c",
		});
	});

	it("rejects an empty task id before calling the transport", async () => {
		const { transport, requests } = createTransport(() => ({
			status: 200,
			text: "{}",
		}));
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(client.getTask("   "));
		expect(error.kind).toBe("invalid-request");
		expect(requests).toHaveLength(0);
	});

	it.each(TASK_STATUSES)("accepts the known status %s", async (status) => {
		const { transport } = createTransport(() => ({
			status: 200,
			text: JSON.stringify({ status }),
		}));
		const client = new Video2KnowledgeClient({ transport });
		await expect(client.getTask("t-1")).resolves.toMatchObject({ status });
	});

	it.each(["uploaded", "paused", "unknown"])(
		"rejects the unknown status %s as protocol-error",
		async (status) => {
			const { transport } = createTransport(() => ({
				status: 200,
				text: JSON.stringify({ status }),
			}));
			const client = new Video2KnowledgeClient({ transport });
			const error = await captureError(client.getTask("t-1"));
			expect(error.kind).toBe("protocol-error");
		},
	);

	it("maps optional fields for a failed task", async () => {
		const text = JSON.stringify({
			status: "failed",
			step: 4,
			step_name: "转写失败",
			progress: 66,
			progress_message: "处理失败",
			error: "未提供 API Key",
		});
		const { transport } = createTransport(() => ({ status: 200, text }));
		const client = new Video2KnowledgeClient({ transport });
		await expect(client.getTask("t-1")).resolves.toEqual({
			taskId: "t-1",
			status: "failed",
			stepName: "转写失败",
			progress: 66,
			progressMessage: "处理失败",
			error: "未提供 API Key",
		});
	});

	it("keeps a null error on a cancelled task", async () => {
		const text = JSON.stringify({
			status: "cancelled",
			step_name: "已取消",
			progress: 0,
			progress_message: "已取消",
			error: null,
		});
		const { transport } = createTransport(() => ({ status: 200, text }));
		const client = new Video2KnowledgeClient({ transport });
		await expect(client.getTask("t-1")).resolves.toEqual({
			taskId: "t-1",
			status: "cancelled",
			stepName: "已取消",
			progress: 0,
			progressMessage: "已取消",
			error: null,
		});
	});

	it.each([
		["a string progress", '{"status":"processing","progress":"50"}'],
		["a non-finite progress", '{"status":"processing","progress":1e999}'],
		["a null progress", '{"status":"processing","progress":null}'],
		["a numeric error", '{"status":"failed","error":7}'],
		["a numeric step_name", '{"status":"processing","step_name":3}'],
	])("rejects %s as protocol-error", async (_name, text) => {
		const { transport } = createTransport(() => ({ status: 200, text }));
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(client.getTask("t-1"));
		expect(error.kind).toBe("protocol-error");
	});
});

describe("Video2KnowledgeClient.getMarkdownTranscript", () => {
	it("requests the markdown format with the exact query string", async () => {
		const text = JSON.stringify({
			task_id: "t-1",
			title: "标题",
			format: "markdown",
			text: MARKDOWN_TEXT,
		});
		const { transport, requests } = createTransport(() => ({
			status: 200,
			text,
		}));
		const client = new Video2KnowledgeClient({ transport });
		const result = await client.getMarkdownTranscript("t 1");
		expect(requests[0]).toMatchObject({
			method: "GET",
			url: "http://127.0.0.1:8000/api/task/t%201/transcript?output_format=markdown",
		});
		expect(result).toEqual({
			taskId: "t-1",
			format: "markdown",
			title: "标题",
			text: MARKDOWN_TEXT,
		});
	});

	it("accepts an empty title", async () => {
		const text = JSON.stringify({
			task_id: "t-1",
			title: "",
			format: "markdown",
			text: MARKDOWN_TEXT,
		});
		const { transport } = createTransport(() => ({ status: 200, text }));
		const client = new Video2KnowledgeClient({ transport });
		await expect(
			client.getMarkdownTranscript("t-1"),
		).resolves.toMatchObject({
			title: "",
		});
	});

	it.each([
		[
			"an empty text",
			JSON.stringify({
				task_id: "t-1",
				title: "x",
				format: "markdown",
				text: "",
			}),
		],
		[
			"a json format",
			JSON.stringify({
				task_id: "t-1",
				title: "x",
				format: "json",
				text: MARKDOWN_TEXT,
			}),
		],
		[
			"a missing task_id",
			JSON.stringify({
				title: "x",
				format: "markdown",
				text: MARKDOWN_TEXT,
			}),
		],
		[
			"a non-string title",
			JSON.stringify({
				task_id: "t-1",
				title: 3,
				format: "markdown",
				text: MARKDOWN_TEXT,
			}),
		],
	])("rejects %s as protocol-error", async (_name, text) => {
		const { transport } = createTransport(() => ({ status: 200, text }));
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(client.getMarkdownTranscript("t-1"));
		expect(error.kind).toBe("protocol-error");
	});

	it.each([404, 409, 500])(
		"reports HTTP %i as http-error with the status",
		async (status) => {
			const { transport } = createTransport(() => ({
				status,
				text: JSON.stringify({ detail: "转录不可用" }),
			}));
			const client = new Video2KnowledgeClient({ transport });
			const error = await captureError(
				client.getMarkdownTranscript("t-1"),
			);
			expect(error.kind).toBe("http-error");
			expect(error.status).toBe(status);
		},
	);

	it("truncates a long detail to 300 characters and redacts credentials", async () => {
		const detail =
			"sk-abcdef123456 api_key=supersecret cookie=session123 " +
			"x".repeat(400);
		const { transport } = createTransport(() => ({
			status: 500,
			text: JSON.stringify({ detail }),
		}));
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(client.getMarkdownTranscript("t-1"));
		expect(error.message).not.toContain("sk-abcdef123456");
		expect(error.message).not.toContain("supersecret");
		expect(error.message).not.toContain("session123");
		expect(error.message).toContain("sk-***");
		expect(error.message.length).toBeLessThan(400);
	});

	it("does not echo the body when a 2xx response is not JSON", async () => {
		const body = "not json at all secret-payload";
		const { transport } = createTransport(() => ({
			status: 200,
			text: body,
		}));
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(client.getMarkdownTranscript("t-1"));
		expect(error.kind).toBe("invalid-json");
		expect(error.message).not.toContain("secret-payload");
	});

	it.each([
		[
			"double-quoted JSON",
			'{"api_key":"supersecret","token":"tokensecret","cookie":"sessionsecret"}',
			["supersecret", "tokensecret", "sessionsecret"],
		],
		[
			"single-quoted JSON-like",
			"{'api_key':'squoteone','token':'squotetwo'}",
			["squoteone", "squotetwo"],
		],
		[
			"equals form",
			"api_key=eqsecret token=eqtoken cookie=eqcookie",
			["eqsecret", "eqtoken", "eqcookie"],
		],
		[
			"authorization bearer",
			"authorization: Bearer bearersecret",
			["bearersecret"],
		],
	])(
		"redacts %s sensitive values in the http detail",
		async (_name, detail, forbidden) => {
			const { transport } = createTransport(() => ({
				status: 500,
				text: JSON.stringify({ detail }),
			}));
			const client = new Video2KnowledgeClient({ transport });
			const error = await captureError(
				client.getMarkdownTranscript("t-1"),
			);
			expect(error.kind).toBe("http-error");
			for (const value of forbidden as string[]) {
				expect(error.message).not.toContain(value);
			}
		},
	);

	it.each(["   ", "\n\t\n", "  \n  \t "])(
		"rejects a blank transcript text %p as protocol-error",
		async (blank) => {
			const text = JSON.stringify({
				task_id: "t-1",
				title: "x",
				format: "markdown",
				text: blank,
			});
			const { transport } = createTransport(() => ({
				status: 200,
				text,
			}));
			const client = new Video2KnowledgeClient({ transport });
			const error = await captureError(
				client.getMarkdownTranscript("t-1"),
			);
			expect(error.kind).toBe("protocol-error");
		},
	);

	it("preserves surrounding whitespace in a non-blank transcript", async () => {
		const raw = "\n# 带时间戳转录\n\n[00:00-00:12] 第一段\n\n";
		const text = JSON.stringify({
			task_id: "t-1",
			title: "x",
			format: "markdown",
			text: raw,
		});
		const { transport } = createTransport(() => ({ status: 200, text }));
		const client = new Video2KnowledgeClient({ transport });
		await expect(
			client.getMarkdownTranscript("t-1"),
		).resolves.toMatchObject({
			text: raw,
		});
	});
});

describe("Video2KnowledgeClient.getMarkdownSummary", () => {
	it("requests and preserves the raw Markdown download", async () => {
		const markdown = "\n# Summary\n\nKeep surrounding whitespace.\n";
		const { transport, requests } = createTransport(() => ({
			status: 200,
			text: markdown,
		}));
		const client = new Video2KnowledgeClient({ transport });
		await expect(client.getMarkdownSummary("task 1")).resolves.toEqual({
			taskId: "task 1",
			format: "markdown",
			text: markdown,
		});
		expect(requests[0]).toMatchObject({
			method: "GET",
			url: "http://127.0.0.1:8000/api/download/task%201",
		});
	});

	it.each(["", "   ", "\n\t\n"])(
		"rejects a blank summary %p",
		async (text) => {
			const { transport } = createTransport(() => ({
				status: 200,
				text,
			}));
			const client = new Video2KnowledgeClient({ transport });
			const error = await captureError(client.getMarkdownSummary("t-1"));
			expect(error.kind).toBe("protocol-error");
		},
	);

	it("reports a non-2xx download without echoing non-JSON content", async () => {
		const { transport } = createTransport(() => ({
			status: 500,
			text: "private backend output sk-secret-value",
		}));
		const client = new Video2KnowledgeClient({ transport });
		const error = await captureError(client.getMarkdownSummary("t-1"));
		expect(error.kind).toBe("http-error");
		expect(error.status).toBe(500);
		expect(error.message).not.toContain("private backend output");
		expect(error.message).not.toContain("sk-secret-value");
	});
});

describe("Video2KnowledgeClient side effects", () => {
	it("does not touch the transport on construction", () => {
		const { transport, requests } = healthClient();
		new Video2KnowledgeClient({ transport });
		new Video2KnowledgeClient({
			transport,
			baseUrl: "http://localhost:8000",
		});
		expect(requests).toHaveLength(0);
	});

	it("does not call the transport for local validation failures", async () => {
		const { transport, requests } = createTransport(() => ({
			status: 200,
			text: "{}",
		}));
		const client = new Video2KnowledgeClient({ transport });
		await captureError(client.startTranscription({ videoUrl: " " }));
		await captureError(client.getTask(""));
		await captureError(client.getMarkdownTranscript(""));
		expect(requests).toHaveLength(0);
	});
});
