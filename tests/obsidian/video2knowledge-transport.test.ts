jest.mock("obsidian", () => ({ requestUrl: jest.fn() }));

import { requestUrl } from "obsidian";

import { obsidianVideo2KnowledgeTransport } from "src/obsidian/video2knowledge-transport";

const mockRequestUrl = requestUrl as unknown as jest.Mock;

beforeEach(() => {
	mockRequestUrl.mockReset();
});

function resolveOnce(status: number, text: unknown): void {
	mockRequestUrl.mockResolvedValueOnce({
		status,
		headers: {},
		json: null,
		arrayBuffer: new ArrayBuffer(0),
		text,
	});
}

describe("obsidianVideo2KnowledgeTransport", () => {
	it("maps a GET request to requestUrl with throw disabled", async () => {
		resolveOnce(200, "ok");
		const result = await obsidianVideo2KnowledgeTransport.request({
			method: "GET",
			url: "http://127.0.0.1:8000/api/health",
		});
		expect(result).toEqual({ status: 200, text: "ok" });
		expect(mockRequestUrl).toHaveBeenCalledTimes(1);
		expect(mockRequestUrl.mock.calls[0][0]).toMatchObject({
			url: "http://127.0.0.1:8000/api/health",
			method: "GET",
			throw: false,
		});
	});

	it("maps a POST body and headers to requestUrl", async () => {
		resolveOnce(200, '{"task_id":"t-1"}');
		await obsidianVideo2KnowledgeTransport.request({
			method: "POST",
			url: "http://127.0.0.1:8000/api/transcribe",
			headers: { "Content-Type": "application/json" },
			body: '{"video_url":"https://youtu.be/x"}',
		});
		expect(mockRequestUrl.mock.calls[0][0]).toMatchObject({
			url: "http://127.0.0.1:8000/api/transcribe",
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: '{"video_url":"https://youtu.be/x"}',
			throw: false,
		});
	});

	it.each([404, 500])(
		"preserves the status %i and text without rewriting",
		async (status) => {
			resolveOnce(status, '{"detail":"boom"}');
			const result = await obsidianVideo2KnowledgeTransport.request({
				method: "GET",
				url: "http://127.0.0.1:8000/api/task/t-1",
			});
			expect(result).toEqual({ status, text: '{"detail":"boom"}' });
		},
	);

	it("propagates a requestUrl rejection unchanged", async () => {
		const failure = new Error("network down");
		mockRequestUrl.mockRejectedValueOnce(failure);
		await expect(
			obsidianVideo2KnowledgeTransport.request({
				method: "GET",
				url: "http://127.0.0.1:8000/api/health",
			}),
		).rejects.toBe(failure);
	});

	it("forwards an unexpected non-string text so the client can reject it", async () => {
		resolveOnce(200, 123);
		const result = await obsidianVideo2KnowledgeTransport.request({
			method: "GET",
			url: "http://127.0.0.1:8000/api/health",
		});
		expect(result).toEqual({ status: 200, text: 123 });
	});
});
