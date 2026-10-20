import { requestUrl } from "obsidian";

import type {
	TransportRequest,
	TransportResponse,
	Video2KnowledgeTransport,
} from "src/video2knowledge/types";

export const obsidianVideo2KnowledgeTransport: Video2KnowledgeTransport = {
	async request(request: TransportRequest): Promise<TransportResponse> {
		const response = await requestUrl({
			url: request.url,
			method: request.method,
			headers: request.headers,
			body: request.body,
			throw: false,
		});
		return { status: response.status, text: response.text };
	},
};
