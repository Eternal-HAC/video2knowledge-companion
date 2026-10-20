import { App, Editor, Notice, type TFile } from "obsidian";

import {
	formatTranscript,
	type FormatOptions,
	type FormatTemplate,
} from "src/transcript/format";
import { fetchTranscript } from "src/youtube/fetch";
import type { TranscriptConfig } from "src/youtube/types";
import { extractYouTubeUrlFromText, isValidYouTubeUrl } from "src/youtube/url";

import { getSelectedText } from "../editor-extensions";
import { getYouTubeUrlFromFrontmatter } from "../frontmatter";
import { obsidianHttp } from "../http";
import { PromptModal } from "../modals/prompt-modal";
import { replaceTranscriptRegion } from "../transcript-region";

export interface InsertTranscriptOptions {
	template?: FormatTemplate;
	timestampMod?: number;
}

interface CommandContext {
	app: App;
	settings?: {
		lang?: string;
		country?: string;
		timestampMod?: number;
	};
	showNotice?: (message: string) => void;
}

interface TargetKey {
	path: string;
}

export class InsertTranscriptCommand {
	private showNotice: (message: string) => void;
	private inFlight = new Map<string, number>();

	constructor(private context: CommandContext) {
		this.showNotice =
			context.showNotice ?? ((message) => new Notice(message));
	}

	async execute(
		editor: Editor,
		targetFile: TFile | null = null,
		getCurrentFile: () => TFile | null = () => targetFile,
	): Promise<void> {
		await this.executeWithOptions(editor, {}, targetFile, getCurrentFile);
	}

	async executeWithOptions(
		editor: Editor,
		options: InsertTranscriptOptions,
		targetFile: TFile | null = null,
		getCurrentFile: () => TFile | null = () => targetFile,
	): Promise<void> {
		if (!targetFile) {
			this.showNotice(
				"Insert transcript failed: no target file provided.",
			);
			return;
		}

		const target: TargetKey = { path: targetFile.path };
		const requestId = this.nextRequestId(target);

		try {
			const url = await this.getYouTubeUrlWithConfirmation(
				editor,
				targetFile,
			);

			if (!url) return;

			if (!isValidYouTubeUrl(url)) {
				this.showNotice("Not a valid YouTube URL.");
				return;
			}

			if (!this.isStillInFlight(target, requestId)) return;
			if (
				getCurrentFile() !== targetFile ||
				targetFile.path !== target.path
			) {
				this.showNotice(
					"Insert transcript aborted: target note changed.",
				);
				return;
			}
			const editorSnapshot = editor.getValue();
			const transcript = await fetchTranscript(
				url,
				obsidianHttp,
				this.transcriptConfig(),
			);

			if (!this.isStillInFlight(target, requestId)) {
				return;
			}

			if (
				getCurrentFile() !== targetFile ||
				targetFile.path !== target.path ||
				editor.getValue() !== editorSnapshot
			) {
				this.showNotice(
					"Insert transcript aborted: note changed while fetching.",
				);
				return;
			}

			if (!transcript?.lines?.length) {
				this.showNotice("No transcript available for this video.");
				return;
			}

			const formatted = formatTranscript(
				transcript,
				url,
				this.mergeFormatOptions(options),
			);
			if (!formatted.trim()) return;

			replaceTranscriptRegion(editor, formatted, (reason) =>
				this.showNotice(`Insert transcript failed: ${reason}`),
			);
		} catch (error) {
			if (!this.isStillInFlight(target, requestId)) return;
			const message =
				error instanceof Error ? error.message : "Unknown error";
			this.showNotice(`Insert transcript failed: ${message}`);
		}
	}

	detectYouTubeUrl(
		editor: Editor,
		targetFile: TFile | null = null,
	): Promise<string | null> {
		return this.detectUrl(editor, targetFile);
	}

	private async getYouTubeUrlWithConfirmation(
		editor: Editor,
		targetFile: TFile | null,
	): Promise<string | null> {
		const detectedUrl = await this.detectUrl(editor, targetFile);

		try {
			const prompt = new PromptModal(
				this.context.app,
				detectedUrl || undefined,
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
		return getYouTubeUrlFromFrontmatter(this.context.app, targetFile);
	}

	private getUrlFromSelection(editor: Editor): string | null {
		try {
			const selectedText = editor.somethingSelected()
				? editor.getSelection()
				: getSelectedText(editor);
			return extractYouTubeUrlFromText(selectedText);
		} catch {
			return null;
		}
	}

	private async getUrlFromClipboard(): Promise<string | null> {
		try {
			const clipboardText = await navigator.clipboard.readText();
			return extractYouTubeUrlFromText(clipboardText);
		} catch {
			return null;
		}
	}

	private transcriptConfig(): TranscriptConfig {
		return {
			lang: this.context.settings?.lang,
			country: this.context.settings?.country,
		};
	}

	private mergeFormatOptions(
		options: InsertTranscriptOptions,
	): FormatOptions {
		return {
			template: options.template ?? "standard",
			timestampMod:
				options.timestampMod ??
				this.context.settings?.timestampMod ??
				5,
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
}
