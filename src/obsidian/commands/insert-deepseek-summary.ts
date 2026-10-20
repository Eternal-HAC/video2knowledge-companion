import { App, Editor, Notice, Platform, type TFile } from "obsidian";

import { Video2KnowledgeClient } from "src/video2knowledge/client";
import { SummaryRunner } from "src/video2knowledge/summary-runner";
import {
	SummaryRunError,
	Video2KnowledgeClientError,
	type MarkdownSummary,
	type StartSummaryRequest,
} from "src/video2knowledge/types";
import { extractYouTubeUrlFromText, isValidYouTubeUrl } from "src/youtube/url";

import type { InsertAsrTranscriptSettings } from "./insert-asr-transcript";
import { getSelectedText } from "../editor-extensions";
import { getSourceUrlFromFrontmatter } from "../frontmatter";
import { PromptModal } from "../modals/prompt-modal";
import { replaceSummaryRegion } from "../transcript-region";
import { obsidianVideo2KnowledgeTransport } from "../video2knowledge-transport";

export interface SummaryRunnerLike {
	run(
		request: StartSummaryRequest,
		options?: { isCancelled?: () => boolean },
	): Promise<MarkdownSummary>;
}

export interface InsertDeepSeekSummaryContext {
	app: App;
	settings: InsertAsrTranscriptSettings;
	createRunner?: (baseUrl: string) => SummaryRunnerLike;
	showNotice?: (message: string, duration?: number) => void;
	isDesktopApp?: () => boolean;
}

const MOBILE_MESSAGE =
	"DeepSeek summary requires Obsidian desktop and a running local Video2Knowledge service.";
const NO_TARGET_MESSAGE = "DeepSeek summary failed: no target note is open.";
const NOT_YOUTUBE_MESSAGE = "Not a valid YouTube URL.";
const TARGET_CHANGED_MESSAGE =
	"DeepSeek summary stopped: the target note changed; local waiting stopped, and the backend task may still be running.";
const CANCELLED_MESSAGE =
	"DeepSeek summary stopped local waiting; the backend task may still be running.";
const SUCCESS_MESSAGE = "DeepSeek summary inserted.";
const UNKNOWN_MESSAGE = "DeepSeek summary failed unexpectedly.";
const INVALID_BASE_URL_MESSAGE =
	"Local summary service URL is invalid; use a loopback http URL.";
const TRANSPORT_MESSAGE = "Cannot reach the local Video2Knowledge service.";
const INCOMPATIBLE_MESSAGE =
	"Local summary service returned an incompatible response.";
const CONFIG_MESSAGE =
	"DeepSeek is not configured in the local Video2Knowledge service.";
const FAILED_MESSAGE = "DeepSeek summary task failed in the local service.";
const TIMEOUT_MESSAGE =
	"DeepSeek summary timed out; the backend task may still be running.";
const INSERT_FAILED_PREFIX = "DeepSeek summary was not inserted: ";

interface TargetKey {
	path: string;
}

function defaultCreateRunner(baseUrl: string): SummaryRunnerLike {
	return new SummaryRunner({
		client: new Video2KnowledgeClient({
			transport: obsidianVideo2KnowledgeTransport,
			baseUrl,
		}),
	});
}

function mapRunFailure(error: unknown): string {
	if (error instanceof Video2KnowledgeClientError) {
		switch (error.kind) {
			case "invalid-base-url":
				return INVALID_BASE_URL_MESSAGE;
			case "transport-error":
				return TRANSPORT_MESSAGE;
			case "http-error":
				if (error.status === 400 || error.status === 401) {
					return CONFIG_MESSAGE;
				}
				return typeof error.status === "number"
					? "Local summary service request failed (HTTP " +
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
	if (error instanceof SummaryRunError) {
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

export class InsertDeepSeekSummaryCommand {
	private readonly app: App;
	private readonly settings: InsertAsrTranscriptSettings;
	private readonly createRunner: (baseUrl: string) => SummaryRunnerLike;
	private readonly showNotice: (message: string, duration?: number) => void;
	private readonly isDesktopApp: () => boolean;
	private readonly inFlight = new Map<string, number>();

	constructor(context: InsertDeepSeekSummaryContext) {
		this.app = context.app;
		this.settings = context.settings;
		this.createRunner = context.createRunner ?? defaultCreateRunner;
		this.showNotice =
			context.showNotice ??
			((message, duration) => new Notice(message, duration));
		this.isDesktopApp =
			context.isDesktopApp ?? (() => Platform.isDesktopApp);
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
			if (!isValidYouTubeUrl(url)) {
				this.showNotice(NOT_YOUTUBE_MESSAGE);
				return;
			}
			if (!this.isStillInFlight(target, requestId)) return;
			if (this.isTargetStale(targetFile, target, getCurrentFile)) {
				this.showNotice(TARGET_CHANGED_MESSAGE);
				return;
			}

			editorSnapshot = editor.getValue();
			const snapshot = editorSnapshot;
			const runner = this.createRunner(
				this.settings.video2KnowledgeBaseUrl,
			);
			const isCancelled = () =>
				!this.isStillInFlight(target, requestId) ||
				this.isTargetStale(targetFile, target, getCurrentFile) ||
				editor.getValue() !== snapshot;

			const summary = await runner.run(this.buildRequest(url), {
				isCancelled,
			});

			if (!this.isStillInFlight(target, requestId)) return;
			if (
				this.isTargetStale(targetFile, target, getCurrentFile) ||
				editor.getValue() !== snapshot
			) {
				this.showNotice(TARGET_CHANGED_MESSAGE);
				return;
			}

			const insertResult: { error: string | null } = { error: null };
			replaceSummaryRegion(editor, summary.text, (reason) => {
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
		targetFile: TFile,
	): Promise<string | null> {
		const detectedUrl = await this.detectUrl(editor, targetFile);
		try {
			const prompt = new PromptModal(this.app, detectedUrl || undefined);
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
		targetFile: TFile,
	): Promise<string | null> {
		const frontmatterUrl = getSourceUrlFromFrontmatter(
			this.app,
			targetFile,
		);
		if (frontmatterUrl) return frontmatterUrl;

		try {
			const selectedText = editor.somethingSelected()
				? editor.getSelection()
				: getSelectedText(editor);
			const selectionUrl = extractYouTubeUrlFromText(selectedText);
			if (selectionUrl) return selectionUrl;
		} catch {
			// Continue to clipboard when editor selection lookup fails.
		}

		try {
			return extractYouTubeUrlFromText(
				await navigator.clipboard.readText(),
			);
		} catch {
			return null;
		}
	}

	private buildRequest(videoUrl: string): StartSummaryRequest {
		return {
			videoUrl,
			processingMode: "reuse",
			preferSubtitles: this.settings.asrPreferSubtitles,
			whisperModel: this.settings.asrWhisperModel.trim() || "base",
			useGpu: this.settings.asrUseGpu,
		};
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
