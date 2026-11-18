import {
	checkLocalServiceConnection,
	formatLocalServiceConnectionResult,
} from "src/video2knowledge/connection-check";
import type {
	TransportRequest,
	TransportResponse,
	Video2KnowledgeTransport,
} from "src/video2knowledge/types";

function transportReturning(
	response: TransportResponse,
): Video2KnowledgeTransport {
	return { request: async (_request: TransportRequest) => response };
}

describe("checkLocalServiceConnection", () => {
	it("returns the compatible service version", async () => {
		await expect(
			checkLocalServiceConnection(
				"http://127.0.0.1:8000",
				transportReturning({
					status: 200,
					text: JSON.stringify({
						status: "ok",
						service: "VideoToNo",
						version: "1.4.2",
					}),
				}),
			),
		).resolves.toEqual({ kind: "connected", version: "1.4.2" });
	});

	it("rejects non-loopback URLs before making a request", async () => {
		const request = jest.fn();
		await expect(
			checkLocalServiceConnection("https://example.com", { request }),
		).resolves.toEqual({ kind: "invalid-url" });
		expect(request).not.toHaveBeenCalled();
	});

	it("maps transport failures without exposing their message", async () => {
		const result = await checkLocalServiceConnection(
			"http://localhost:8000",
			{
				request: async () => {
					throw new Error("secret backend detail");
				},
			},
		);
		expect(result).toEqual({ kind: "unreachable" });
		expect(formatLocalServiceConnectionResult(result)).not.toContain(
			"secret",
		);
	});

	it("keeps only the HTTP status for health failures", async () => {
		const result = await checkLocalServiceConnection(
			"http://[::1]:8000",
			transportReturning({ status: 503, text: "token=unsafe" }),
		);
		expect(result).toEqual({ kind: "http-error", status: 503 });
		expect(formatLocalServiceConnectionResult(result)).toBe(
			"Local service health check failed (HTTP 503).",
		);
	});

	it.each([
		"not json",
		JSON.stringify({ status: "ok", service: "Other", version: "1" }),
	])("maps an incompatible response without echoing it", async (text) => {
		const result = await checkLocalServiceConnection(
			"http://127.0.0.1:8000",
			transportReturning({ status: 200, text }),
		);
		expect(result).toEqual({ kind: "incompatible" });
		expect(formatLocalServiceConnectionResult(result)).toBe(
			"Local service returned an incompatible health response.",
		);
	});
});

describe("formatLocalServiceConnectionResult", () => {
	it("formats the bounded result variants", () => {
		expect(
			formatLocalServiceConnectionResult({
				kind: "connected",
				version: "1.4.2",
			}),
		).toBe("Connected to Video2Knowledge 1.4.2.");
		expect(
			formatLocalServiceConnectionResult({ kind: "invalid-url" }),
		).toContain("loopback");
		expect(
			formatLocalServiceConnectionResult({ kind: "unreachable" }),
		).toContain("Cannot reach");
		expect(
			formatLocalServiceConnectionResult({
				kind: "http-error",
				status: null,
			}),
		).toBe("Local service health check failed.");
	});
});
