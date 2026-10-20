import { App, Editor, Notice, Platform, type TFile } from "obsidian";

import { Video2KnowledgeClient } from "src/video2knowledge/client";
import { TranscriptionRunner } from "src/video2knowledge/transcription-runner";
import {
	TranscriptionRunError,
	Video2KnowledgeClientError,
	type BilibiliPagesPreview,
	type MarkdownTranscript,
	type StartTranscriptionRequest,
} from "src/video2knowledge/types";
import {
	classifySupportedVideoUrl,
	extractSupportedVideoUrlFromText,
	getBilibiliPageFromUrl,
} from "src/video2knowledge/video-url";
import { extractYouTubeUrlFromText, isValidYouTubeUrl } from "src/youtube/url";

import { getSelectedText } from "../editor-extensions";
import { getSourceUrlFromFrontmatter } from "../frontmatter";
import { BilibiliPagesModal } from "../modals/bilibili-pages-modal";
import { PromptModal } from "../modals/prompt-modal";
import { replaceTranscriptRegion } from "../transcript-region";
import { obsidianVideo2KnowledgeTransport } from "../video2knowledge-transport";

export const DEFAULT_ASR_WHISPER_MODEL = "base";

export interface InsertAsrTranscriptSettings {
	video2KnowledgeBaseUrl: string;
	asrWhisperModel: string;
	asrPreferSubtitles: boolean;
	asrUseGpu: boolean;
}

export const DEFAULT_ASR_SETTINGS: InsertAsrTranscriptSettings = {
	video2KnowledgeBaseUrl: "http://127.0.0.1:8000",
	asrWhisperModel: DEFAULT_ASR_WHISPER_MODEL,
	asrPreferSubtitles: true,
	asrUseGpu: false,
};

export function normalizeAsrWhisperModel(value: string): string {
	return value.trim() || DEFAULT_ASR_WHISPER_MODEL;
}

export interface TranscriptionRunnerLike {
	run(
		request: StartTranscriptionRequest,
		options?: { isCancelled?: () => boolean },
	): Promise<MarkdownTranscript>;
}

export interface InsertAsrTranscriptContext {
	app: App;
	settings: InsertAsrTranscriptSettings;
	createRunner?: (baseUrl: string) => TranscriptionRunnerLike;
	showNotice?: (message: string, duration?: number) => void;
	isDesktopApp?: () => boolean;
	sourceMode?: "youtube-only" | "supported";
	previewBilibiliPages?: (
		baseUrl: string,
		videoUrl: string,
	) => Promise<BilibiliPagesPreview>;
	selectBilibiliPages?: (
		preview: BilibiliPagesPreview,
		defaultPages: number[],
	) => Promise<number[] | null>;
}

const MOBILE_MESSAGE =
	"Local ASR requires Obsidian desktop and a running local Video2Knowledge service.";
const NO_TARGET_MESSAGE = "Local ASR failed: no target note is open.";
const NOT_YOUTUBE_MESSAGE = "Not a valid YouTube URL.";
const NOT_SUPPORTED_MESSAGE = "Not a supported YouTube or Bilibili URL.";
const TARGET_CHANGED_MESSAGE =
	"Local ASR stopped: the target note changed; local waiting stopped, and the backend task may still be running.";
const CANCELLED_MESSAGE =
	"Local ASR stopped local waiting; the backend task may still be running.";
const SUCCESS_MESSAGE = "Local ASR transcript inserted.";
const UNKNOWN_MESSAGE = "Local ASR failed unexpectedly.";
const INVALID_BASE_URL_MESSAGE =
	"Local ASR service URL is invalid; use a loopback http URL.";
const TRANSPORT_MESSAGE = "Cannot reach the local Video2Knowledge service.";
const INCOMPATIBLE_MESSAGE =
	"Local ASR service returned an incompatible response.";
const FAILED_MESSAGE = "Local ASR transcription failed.";
const TIMEOUT_MESSAGE =
	"Local ASR timed out; the backend task may still be running.";
const INSERT_FAILED_PREFIX = "Local ASR transcript was not inserted: ";

interface TargetKey {
	path: string;
}

function defaultCreateRunner(baseUrl: string): TranscriptionRunnerLike {
	return new TranscriptionRunner({
		client: new Video2KnowledgeClient({
			transport: obsidianVideo2KnowledgeTransport,
			baseUrl,
		}),
	});
}

async function defaultPreviewBilibiliPages(
	baseUrl: string,
	videoUrl: string,
): Promise<BilibiliPagesPreview> {
	return new Video2KnowledgeClient({
		transport: obsidianVideo2KnowledgeTransport,
		baseUrl,
	}).previewBilibiliPages(videoUrl);
}

function mapRunFailure(error: unknown): string {
	if (error instanceof Video2KnowledgeClientError) {
		switch (error.kind) {
			case "invalid-base-url":
				return INVALID_BASE_URL_MESSAGE;
			case "transport-error":
				return TRANSPORT_MESSAGE;
			case "http-error":
				return typeof error.status === "number"
					? "Local ASR service request failed (HTTP " +
							error.status +
							")."
					: UNKNOWN_MESSAGE;
			case "invalid-json":
			case "protocol-error":
				return INCOMPATIBLE_MESSAGE;
			default:
				return UNKNOWN_MESSAGE;
		}
	}
	if (error instanceof TranscriptionRunError) {
		switch (error.kind) {
			case "failed":
				return FAILED_MESSAGE;
			case "timeout":
				return TIMEOUT_MESSAGE;
			case "cancelled":
				return CANCELLED_MESSAGE;
			default:
				return UNKNOWN_MESSAGE;
		}
	}
	return UNKNOWN_MESSAGE;
}

export class InsertAsrTranscriptCommand {
	private readonly app: App;
	private readonly settings: InsertAsrTranscriptSettings;
	private readonly createRunner: (baseUrl: string) => TranscriptionRunnerLike;
	private readonly showNotice: (message: string, duration?: number) => void;
	private readonly isDesktopApp: () => boolean;
	private readonly sourceMode: "youtube-only" | "supported";
	private readonly previewBilibiliPages: (
		baseUrl: string,
		videoUrl: string,
	) => Promise<BilibiliPagesPreview>;
	private readonly selectBilibiliPages: (
		preview: BilibiliPagesPreview,
		defaultPages: number[],
	) => Promise<number[] | null>;
	private readonly inFlight = new Map<string, number>();

	constructor(context: InsertAsrTranscriptContext) {
		this.app = context.app;
		this.settings = context.settings;
		this.createRunner = context.createRunner ?? defaultCreateRunner;
		this.showNotice =
			context.showNotice ??
			((message, duration) => new Notice(message, duration));
		this.isDesktopApp =
			context.isDesktopApp ?? (() => Platform.isDesktopApp);
		this.sourceMode = context.sourceMode ?? "youtube-only";
		this.previewBilibiliPages =
			context.previewBilibiliPages ?? defaultPreviewBilibiliPages;
		this.selectBilibiliPages =
			context.selectBilibiliPages ??
			((preview, defaultPages) =>
				new BilibiliPagesModal(
					this.app,
					preview,
					defaultPages,
				).openAndGetValue());
	}

	async execute(
		editor: Editor,
		targetFile: TFile | null = null,
		getCurrentFile: () => TFile | null = () => targetFile,
	): Promise<void> {
		if (!this.isDesktopApp()) {
			this.showNotice(MOBILE_MESSAGE);
			return;
		}
		if (!targetFile) {
			this.showNotice(NO_TARGET_MESSAGE);
			return;
		}

		const target: TargetKey = { path: targetFile.path };
		const requestId = this.nextRequestId(target);
		let editorSnapshot: string | null = null;

		try {
			const url = await this.getUrlWithConfirmation(editor, targetFile);
			if (!url) return;

			const source =
				this.sourceMode === "youtube-only"
					? isValidYouTubeUrl(url)
						? "youtube"
						: null
					: classifySupportedVideoUrl(url);
			if (!source) {
				this.showNotice(
					this.sourceMode === "youtube-only"
						? NOT_YOUTUBE_MESSAGE
						: NOT_SUPPORTED_MESSAGE,
				);
				return;
			}

			if (!this.isStillInFlight(target, requestId)) return;
			if (this.isTargetStale(targetFile, target, getCurrentFile)) {
				this.showNotice(TARGET_CHANGED_MESSAGE);
				return;
			}

			editorSnapshot = editor.getValue();
			const snapshot = editorSnapshot;
			let bilibiliPages: number[] | undefined;
			if (source === "bilibili") {
				const preview = await this.previewBilibiliPages(
					this.settings.video2KnowledgeBaseUrl,
					url,
				);
				if (!this.isStillInFlight(target, requestId)) return;
				if (
					this.isTargetStale(targetFile, target, getCurrentFile) ||
					editor.getValue() !== snapshot
				) {
					this.showNotice(TARGET_CHANGED_MESSAGE);
					return;
				}
				if (preview.totalPages === 1) {
					bilibiliPages = [preview.pages[0].page];
				} else {
					const selectedPages = await this.selectBilibiliPages(
						preview,
						getDefaultBilibiliPages(preview, url),
					);
					if (!selectedPages) return;
					bilibiliPages = selectedPages;
					if (!this.isStillInFlight(target, requestId)) return;
					if (
						this.isTargetStale(
							targetFile,
							target,
							getCurrentFile,
						) ||
						editor.getValue() !== snapshot
					) {
						this.showNotice(TARGET_CHANGED_MESSAGE);
						return;
					}
				}
			}
			const runner = this.createRunner(
				this.settings.video2KnowledgeBaseUrl,
			);
			const isCancelled = () =>
				!this.isStillInFlight(target, requestId) ||
				this.isTargetStale(targetFile, target, getCurrentFile) ||
				editor.getValue() !== snapshot;

			const transcript = await runner.run(
				this.buildRequest(url, bilibiliPages),
				{
					isCancelled,
				},
			);

			if (!this.isStillInFlight(target, requestId)) return;
			if (
				this.isTargetStale(targetFile, target, getCurrentFile) ||
				editor.getValue() !== snapshot
			) {
				this.showNotice(TARGET_CHANGED_MESSAGE);
				return;
			}

			const insertResult: { error: string | null } = { error: null };
			replaceTranscriptRegion(editor, transcript.text, (reason) => {
				insertResult.error = reason;
			});
			if (insertResult.error) {
				this.showNotice(INSERT_FAILED_PREFIX + insertResult.error);
				return;
			}
			this.showNotice(SUCCESS_MESSAGE);
		} catch (error) {
			if (!this.isStillInFlight(target, requestId)) return;
			if (
				this.isTargetStale(targetFile, target, getCurrentFile) ||
				(editorSnapshot !== null &&
					editor.getValue() !== editorSnapshot)
			) {
				this.showNotice(TARGET_CHANGED_MESSAGE);
				return;
			}
			this.showNotice(mapRunFailure(error));
		}
	}

	private async getUrlWithConfirmation(
		editor: Editor,
		targetFile: TFile | null,
	): Promise<string | null> {
		const detectedUrl = await this.detectUrl(editor, targetFile);

		try {
			const prompt = new PromptModal(
				this.app,
				detectedUrl || undefined,
				this.sourceMode === "supported" ? "Video URL" : "YouTube URL",
			);
			const userUrl = await new Promise<string>((resolve, reject) => {
				prompt.openAndGetValue(resolve, reject);
			});
			return userUrl.trim() || null;
		} catch {
			return null;
		}
	}

	private async detectUrl(
		editor: Editor,
		targetFile: TFile | null,
	): Promise<string | null> {
		const frontmatterUrl = this.getUrlFromFrontmatter(targetFile);
		if (frontmatterUrl) return frontmatterUrl;

		const selectionUrl = this.getUrlFromSelection(editor);
		if (selectionUrl) return selectionUrl;

		return this.getUrlFromClipboard();
	}

	private getUrlFromFrontmatter(targetFile: TFile | null): string | null {
		if (!targetFile) return null;
		const source = getSourceUrlFromFrontmatter(this.app, targetFile);
		if (!source || this.sourceMode === "youtube-only") return source;
		return extractSupportedVideoUrlFromText(source) ?? source;
	}

	private getUrlFromSelection(editor: Editor): string | null {
		try {
			const selectedText = editor.somethingSelected()
				? editor.getSelection()
				: getSelectedText(editor);
			return this.extractUrl(selectedText);
		} catch {
			return null;
		}
	}

	private async getUrlFromClipboard(): Promise<string | null> {
		try {
			const clipboardText = await navigator.clipboard.readText();
			return this.extractUrl(clipboardText);
		} catch {
			return null;
		}
	}

	private extractUrl(text: string): string | null {
		return this.sourceMode === "supported"
			? extractSupportedVideoUrlFromText(text)
			: extractYouTubeUrlFromText(text);
	}

	private buildRequest(
		videoUrl: string,
		bilibiliPages?: number[],
	): StartTranscriptionRequest {
		const request: StartTranscriptionRequest = {
			videoUrl,
			processingMode: "reuse",
			preferSubtitles: this.settings.asrPreferSubtitles,
			whisperModel: normalizeAsrWhisperModel(
				this.settings.asrWhisperModel,
			),
			useGpu: this.settings.asrUseGpu,
		};
		if (bilibiliPages !== undefined) {
			request.bilibiliPages = bilibiliPages;
		}
		return request;
	}

	private nextRequestId(target: TargetKey): number {
		const id = (this.inFlight.get(target.path) ?? 0) + 1;
		this.inFlight.set(target.path, id);
		return id;
	}

	private isStillInFlight(target: TargetKey, requestId: number): boolean {
		return this.inFlight.get(target.path) === requestId;
	}

	private isTargetStale(
		targetFile: TFile,
		target: TargetKey,
		getCurrentFile: () => TFile | null,
	): boolean {
		return (
			getCurrentFile() !== targetFile || targetFile.path !== target.path
		);
	}
}

export function getDefaultBilibiliPages(
	preview: BilibiliPagesPreview,
	videoUrl: string,
): number[] {
	if (preview.previousPages && preview.previousPages.length > 0) {
		return preview.previousPages.slice();
	}
	const pageFromUrl = getBilibiliPageFromUrl(videoUrl);
	return pageFromUrl !== null &&
		preview.pages.some((page) => page.page === pageFromUrl)
		? [pageFromUrl]
		: [];
}
