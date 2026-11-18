import { Video2KnowledgeClient } from "./client";
import {
	Video2KnowledgeClientError,
	type Video2KnowledgeTransport,
} from "./types";

export type LocalServiceConnectionResult =
	| { kind: "connected"; version: string }
	| { kind: "invalid-url" }
	| { kind: "unreachable" }
	| { kind: "http-error"; status: number | null }
	| { kind: "incompatible" };

export async function checkLocalServiceConnection(
	baseUrl: string,
	transport: Video2KnowledgeTransport,
): Promise<LocalServiceConnectionResult> {
	try {
		const health = await new Video2KnowledgeClient({
			baseUrl,
			transport,
		}).health();
		return { kind: "connected", version: health.version };
	} catch (error) {
		if (!(error instanceof Video2KnowledgeClientError)) {
			return { kind: "unreachable" };
		}
		switch (error.kind) {
			case "invalid-base-url":
				return { kind: "invalid-url" };
			case "transport-error":
				return { kind: "unreachable" };
			case "http-error":
				return {
					kind: "http-error",
					status:
						typeof error.status === "number" ? error.status : null,
				};
			case "invalid-json":
			case "protocol-error":
			case "invalid-request":
			default:
				return { kind: "incompatible" };
		}
	}
}

export function formatLocalServiceConnectionResult(
	result: LocalServiceConnectionResult,
): string {
	switch (result.kind) {
		case "connected":
			return `Connected to Video2Knowledge ${result.version}.`;
		case "invalid-url":
			return "Local service URL is invalid; use a loopback http URL.";
		case "unreachable":
			return "Cannot reach the local Video2Knowledge service.";
		case "http-error":
			return result.status === null
				? "Local service health check failed."
				: `Local service health check failed (HTTP ${result.status}).`;
		case "incompatible":
			return "Local service returned an incompatible health response.";
	}
}
