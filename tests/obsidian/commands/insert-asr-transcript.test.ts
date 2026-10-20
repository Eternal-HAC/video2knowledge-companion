jest.mock("obsidian", () => ({
	Notice: class MockNotice {},
	Modal: class MockModal {},
	ItemView: class MockItemView {},
	App: class MockApp {},
	Plugin: class MockPlugin {
		app: unknown;
		manifest: unknown;
		commands: Array<Record<string, unknown>> = [];
		constructor(app?: unknown, manifest?: unknown) {
			this.app = app;
			this.manifest = manifest;
		}
		addCommand(command: Record<string, unknown>) {
			this.commands.push(command);
			return command;
		}
		registerView() {}
		addSettingTab() {}
		async loadData() {
			return null;
		}
		async saveData() {}
	},
	PluginSettingTab: class MockPluginSettingTab {},
	Setting: class MockSetting {},
	WorkspaceLeaf: class MockWorkspaceLeaf {},
	Platform: {
		isDesktop: true,
		isMobile: false,
		isDesktopApp: true,
		isMobileApp: false,
	},
	ButtonComponent: class MockButtonComponent {},
	TextComponent: class MockTextComponent {},
	Menu: class MockMenu {},
	setIcon: jest.fn(),
	requestUrl: jest.fn(),
}));

import type { App, Editor, EditorPosition, TFile } from "obsidian";

import {
	DEFAULT_ASR_SETTINGS,
	getDefaultBilibiliPages,
	InsertAsrTranscriptCommand,
	normalizeAsrWhisperModel,
	type InsertAsrTranscriptSettings,
	type TranscriptionRunnerLike,
} from "src/obsidian/commands/insert-asr-transcript";
import YTranscriptPlugin, { DEFAULT_SETTINGS } from "src/obsidian/plugin";
import {
	TranscriptionRunError,
	Video2KnowledgeClientError,
	type BilibiliPagesPreview,
	type MarkdownTranscript,
	type StartTranscriptionRequest,
} from "src/video2knowledge/types";

jest.mock("src/obsidian/modals/prompt-modal", () => ({
	PromptModal: jest
		.fn()
		.mockImplementation((_app: unknown, initialValue?: string) => {
			promptInitialValues.push(initialValue ?? "");
			return {
				openAndGetValue: (
					resolve: (value: string) => void,
					reject: () => void,
				) => {
					if (promptCancelled) reject();
					else resolve(promptValue || initialValue || "");
				},
			};
		}),
}));

const YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YOUTUBE_URL_B = "https://youtu.be/bbbbbbbbbbb";
const YOUTUBE_URL_A = "https://youtu.be/aaaaaaaaaaa";
const BILIBILI_URL = "https://www.bilibili.com/video/BV1DKbxzjEz9";
const BILIBILI_URL_P2 = BILIBILI_URL + "?p=2";

const M = {
	mobile: "Local ASR requires Obsidian desktop and a running local Video2Knowledge service.",
	noTarget: "Local ASR failed: no target note is open.",
	notYouTube: "Not a valid YouTube URL.",
	notSupported: "Not a supported YouTube or Bilibili URL.",
	targetChanged:
		"Local ASR stopped: the target note changed; local waiting stopped, and the backend task may still be running.",
	cancelled:
		"Local ASR stopped local waiting; the backend task may still be running.",
	success: "Local ASR transcript inserted.",
	unknown: "Local ASR failed unexpectedly.",
	invalidBaseUrl:
		"Local ASR service URL is invalid; use a loopback http URL.",
	transport: "Cannot reach the local Video2Knowledge service.",
	incompatible: "Local ASR service returned an incompatible response.",
	failed: "Local ASR transcription failed.",
	timeout: "Local ASR timed out; the backend task may still be running.",
	insertPrefix: "Local ASR transcript was not inserted:",
};

const MARKDOWN: MarkdownTranscript = {
	taskId: "t-1",
	format: "markdown",
	title: "T",
	text: "# 带时间戳转录\n\n[00:00-00:12] 第一段\n",
};

let promptValue = "";
let promptCancelled = false;
let promptInitialValues: string[] = [];
let clipboardText = "";
let clipboardShouldFail = false;
let clipboardReads = 0;

Object.defineProperty(navigator, "clipboard", {
	value: {
		readText: async () => {
			clipboardReads += 1;
			if (clipboardShouldFail) throw new Error("Clipboard denied");
			return clipboardText;
		},
	},
	configurable: true,
});

beforeEach(() => {
	promptValue = YOUTUBE_URL;
	promptCancelled = false;
	promptInitialValues = [];
	clipboardText = "";
	clipboardShouldFail = false;
	clipboardReads = 0;
});

interface RunCall {
	request: StartTranscriptionRequest;
	options?: { isCancelled?: () => boolean };
}

function deferred() {
	let resolve!: (value: MarkdownTranscript) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<MarkdownTranscript>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function makeRunner(
	queue: Array<Promise<MarkdownTranscript> | MarkdownTranscript | Error>,
) {
	const runCalls: RunCall[] = [];
	const runner: TranscriptionRunnerLike = {
		run: jest.fn(async (request, options) => {
			runCalls.push({ request, options });
			const next = queue.shift();
			if (next instanceof Error) throw next;
			if (next instanceof Promise) return next;
			if (!next) throw new Error("unexpected runner.run");
			return next;
		}),
	};
	return { runner, runCalls };
}

function runnerReturning() {
	const runCalls: RunCall[] = [];
	const runner: TranscriptionRunnerLike = {
		run: jest.fn(async (request, options) => {
			runCalls.push({ request, options });
			return MARKDOWN;
		}),
	};
	return { runner, runCalls };
}

async function waitFor(array: unknown[], count: number) {
	for (let i = 0; i < 80 && array.length < count; i++) {
		await Promise.resolve();
	}
	expect(array).toHaveLength(count);
}

function makeEditor(initialText = "", selection = ""): Editor {
	let text = initialText;
	return {
		getValue: () => text,
		lineCount: () => text.split("\n").length,
		lastLine: () => Math.max(0, text.split("\n").length - 1),
		getLine: (line: number) => text.split("\n")[line] ?? "",
		getCursor: () => ({ line: 0, ch: 0 }),
		somethingSelected: () => selection.length > 0,
		getSelection: () => selection,
		replaceRange: (
			replacement: string,
			from: EditorPosition,
			to?: EditorPosition,
		) => {
			const lines = text.split("\n");
			const beforeLine = lines[from.line]?.slice(0, from.ch) ?? "";
			const afterLine = to ? (lines[to.line]?.slice(to.ch) ?? "") : "";
			const merged = beforeLine + replacement + afterLine;
			const deleteCount = to ? to.line - from.line + 1 : 1;
			lines.splice(from.line, deleteCount, ...merged.split("\n"));
			text = lines.join("\n");
		},
	} as unknown as Editor;
}

function makeApp(
	frontmatterByPath: Record<string, Record<string, unknown>> = {},
	activeFilePath = "active-note.md",
) {
	const getFileCache = jest.fn((file: TFile) =>
		file.path in frontmatterByPath
			? { frontmatter: frontmatterByPath[file.path] }
			: undefined,
	);
	const getActiveFile = jest.fn(() => ({ path: activeFilePath }) as TFile);
	return {
		app: {
			workspace: { getActiveFile },
			metadataCache: { getFileCache },
		} as unknown as App,
		getFileCache,
		getActiveFile,
	};
}

function makeTargetFile(path: string): TFile {
	return { path } as unknown as TFile;
}

function buildCommand(options: {
	app: App;
	settings?: Partial<InsertAsrTranscriptSettings>;
	runner?: TranscriptionRunnerLike;
	desktop?: boolean;
	sourceMode?: "youtube-only" | "supported";
	previewBilibiliPages?: (
		baseUrl: string,
		videoUrl: string,
	) => Promise<BilibiliPagesPreview>;
	selectBilibiliPages?: (
		preview: BilibiliPagesPreview,
		defaultPages: number[],
	) => Promise<number[] | null>;
}) {
	const notices: string[] = [];
	const runner = options.runner ?? makeRunner([MARKDOWN]).runner;
	const createRunner = jest.fn((_baseUrl: string) => runner);
	const settings: InsertAsrTranscriptSettings = {
		...DEFAULT_ASR_SETTINGS,
		...options.settings,
	};
	const command = new InsertAsrTranscriptCommand({
		app: options.app,
		settings,
		createRunner,
		showNotice: (message: string) => notices.push(message),
		isDesktopApp: () => options.desktop ?? true,
		sourceMode: options.sourceMode,
		previewBilibiliPages: options.previewBilibiliPages,
		selectBilibiliPages: options.selectBilibiliPages,
	});
	return { command, createRunner, notices, settings };
}

describe("InsertAsrTranscriptCommand", () => {
	it("rejects mobile immediately without prompting, running, or reading the clipboard", async () => {
		const { command, createRunner, notices } = buildCommand({
			app: makeApp().app,
			desktop: false,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, makeTargetFile("note-a.md"));
		expect(notices).toEqual([M.mobile]);
		expect(promptInitialValues).toEqual([]);
		expect(createRunner).not.toHaveBeenCalled();
		expect(clipboardReads).toBe(0);
		expect(editor.getValue()).toBe("# Note");
	});

	it("refuses to run without a target file", async () => {
		const { command, createRunner, notices } = buildCommand({
			app: makeApp().app,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, null);
		expect(notices).toEqual([M.noTarget]);
		expect(createRunner).not.toHaveBeenCalled();
		expect(editor.getValue()).toBe("# Note");
	});

	it("prefers ctx.file frontmatter source and never reads the active file", async () => {
		const target = makeTargetFile("note-a.md");
		const { app, getActiveFile } = makeApp(
			{
				"note-a.md": {
					source: YOUTUBE_URL,
					url: "https://youtu.be/abcdefghijk",
				},
				"active-note.md": { source: YOUTUBE_URL_A },
			},
			"active-note.md",
		);
		const { runner, runCalls } = runnerReturning();
		const { command } = buildCommand({ app, runner });
		await command.execute(makeEditor("# Note"), target);
		expect(promptInitialValues).toEqual([YOUTUBE_URL]);
		expect(getActiveFile).not.toHaveBeenCalled();
		expect(runCalls[0].request.videoUrl).toBe(YOUTUBE_URL);
	});

	it("falls back to the selection when frontmatter is empty", async () => {
		promptValue = "";
		const { runner, runCalls } = runnerReturning();
		const { command } = buildCommand({ app: makeApp().app, runner });
		const editor = makeEditor(
			"# Note",
			"see " + YOUTUBE_URL_A + " for details",
		);
		await command.execute(editor, makeTargetFile("note-a.md"));
		expect(promptInitialValues).toEqual([YOUTUBE_URL_A]);
		expect(runCalls[0].request.videoUrl).toBe(YOUTUBE_URL_A);
	});

	it("falls back to the clipboard when nothing else is available", async () => {
		promptValue = "";
		clipboardText = "clip " + YOUTUBE_URL_B;
		const { runner, runCalls } = runnerReturning();
		const { command } = buildCommand({ app: makeApp().app, runner });
		await command.execute(
			makeEditor("# Note"),
			makeTargetFile("note-a.md"),
		);
		expect(promptInitialValues).toEqual([YOUTUBE_URL_B]);
		expect(runCalls[0].request.videoUrl).toBe(YOUTUBE_URL_B);
	});

	it("falls back to an empty prompt when nothing is detected", async () => {
		promptValue = "";
		const { runner, runCalls } = runnerReturning();
		const { command } = buildCommand({ app: makeApp().app, runner });
		await command.execute(
			makeEditor("# Note"),
			makeTargetFile("note-a.md"),
		);
		expect(promptInitialValues).toEqual([""]);
		expect(runCalls).toHaveLength(0);
	});

	it("lets the submitted prompt value override the detected value", async () => {
		promptValue = YOUTUBE_URL_B;
		const target = makeTargetFile("note-a.md");
		const { app } = makeApp({ "note-a.md": { source: YOUTUBE_URL_A } });
		const { runner, runCalls } = runnerReturning();
		const { command } = buildCommand({ app, runner });
		await command.execute(makeEditor("# Note"), target);
		expect(promptInitialValues).toEqual([YOUTUBE_URL_A]);
		expect(runCalls[0].request.videoUrl).toBe(YOUTUBE_URL_B);
	});

	it("stops silently when the prompt is cancelled", async () => {
		promptCancelled = true;
		const { runner, runCalls } = runnerReturning();
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, makeTargetFile("note-a.md"));
		expect(runCalls).toHaveLength(0);
		expect(notices).toEqual([]);
		expect(editor.getValue()).toBe("# Note");
	});

	it("rejects a final URL that is not a YouTube link", async () => {
		promptValue = "https://example.com/watch?v=1";
		const { runner, runCalls } = runnerReturning();
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, makeTargetFile("note-a.md"));
		expect(notices).toEqual([M.notYouTube]);
		expect(runCalls).toHaveLength(0);
		expect(editor.getValue()).toBe("# Note");
	});

	it("passes the configured base URL to the runner factory", async () => {
		const { runner } = runnerReturning();
		const { command, createRunner } = buildCommand({
			app: makeApp().app,
			runner,
			settings: { video2KnowledgeBaseUrl: "http://localhost:8123" },
		});
		await command.execute(
			makeEditor("# Note"),
			makeTargetFile("note-a.md"),
		);
		expect(createRunner).toHaveBeenCalledWith("http://localhost:8123");
	});

	it("sends the exact five-field request with defaults and a base model", async () => {
		const { runner, runCalls } = runnerReturning();
		const { command } = buildCommand({
			app: makeApp().app,
			runner,
			settings: { asrWhisperModel: "  " },
		});
		await command.execute(
			makeEditor("# Note"),
			makeTargetFile("note-a.md"),
		);
		expect(runCalls[0].request).toEqual({
			videoUrl: YOUTUBE_URL,
			processingMode: "reuse",
			preferSubtitles: true,
			whisperModel: "base",
			useGpu: false,
		});
		expect(runCalls[0].request).toStrictEqual({
			videoUrl: YOUTUBE_URL,
			processingMode: "reuse",
			preferSubtitles: true,
			whisperModel: "base",
			useGpu: false,
		});
	});

	it("applies the configured subtitle, model, and GPU settings", async () => {
		const { runner, runCalls } = runnerReturning();
		const { command } = buildCommand({
			app: makeApp().app,
			runner,
			settings: {
				asrPreferSubtitles: false,
				asrWhisperModel: " small ",
				asrUseGpu: true,
			},
		});
		await command.execute(
			makeEditor("# Note"),
			makeTargetFile("note-a.md"),
		);
		expect(runCalls[0].request).toEqual({
			videoUrl: YOUTUBE_URL,
			processingMode: "reuse",
			preferSubtitles: false,
			whisperModel: "small",
			useGpu: true,
		});
	});

	it("writes the returned Markdown into the controlled region", async () => {
		const { runner } = runnerReturning();
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, makeTargetFile("note-a.md"));
		const text = editor.getValue();
		expect(text).toContain("<!-- YTranscript:start -->");
		expect(text).toContain("# 带时间戳转录");
		expect(text).toContain("[00:00-00:12] 第一段");
		expect(text).toContain("<!-- YTranscript:end -->");
		expect(notices).toEqual([M.success]);
	});

	it("replaces only the region on a second run", async () => {
		const { runner } = runnerReturning();
		const { command } = buildCommand({ app: makeApp().app, runner });
		const editor = makeEditor("# Note\n\nparagraph");
		const target = makeTargetFile("note-a.md");
		await command.execute(editor, target);
		await command.execute(editor, target);
		const text = editor.getValue();
		expect(text).toContain("# Note\n\nparagraph");
		expect(text.match(/<!-- YTranscript:start -->/g)).toHaveLength(1);
		expect(text).toContain("# 带时间戳转录");
	});

	it("fails closed when the transcript region markers are ambiguous", async () => {
		const original = "# Note\n\n<!-- YTranscript:start -->\nold";
		const { runner } = runnerReturning();
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
		});
		const editor = makeEditor(original);
		await command.execute(editor, makeTargetFile("note-a.md"));
		expect(editor.getValue()).toBe(original);
		expect(notices).toHaveLength(1);
		expect(notices[0].startsWith(M.insertPrefix)).toBe(true);
	});

	it("fails closed when the transcript contains a reserved marker", async () => {
		const original = "# Note";
		const runner = makeRunner([
			{ ...MARKDOWN, text: "bad <!-- YTranscript:start --> bad" },
		]).runner;
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
		});
		const editor = makeEditor(original);
		await command.execute(editor, makeTargetFile("note-a.md"));
		expect(editor.getValue()).toBe(original);
		expect(notices[0].startsWith(M.insertPrefix)).toBe(true);
	});

	it("does not write when the target is switched during the run", async () => {
		const target = makeTargetFile("note-a.md");
		let currentFile: TFile = target;
		const runner: TranscriptionRunnerLike = {
			run: jest.fn(async () => {
				currentFile = makeTargetFile("other.md");
				return MARKDOWN;
			}),
		};
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, target, () => currentFile);
		expect(editor.getValue()).toBe("# Note");
		expect(notices).toEqual([M.targetChanged]);
	});

	it("does not write when the target is renamed during the run", async () => {
		const target = makeTargetFile("note-a.md");
		const runner: TranscriptionRunnerLike = {
			run: jest.fn(async () => {
				target.path = "renamed.md";
				return MARKDOWN;
			}),
		};
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, target);
		expect(editor.getValue()).toBe("# Note");
		expect(notices).toEqual([M.targetChanged]);
	});

	it("does not write when the editor changed during the run", async () => {
		const runner: TranscriptionRunnerLike = {
			run: jest.fn(async () => {
				editor.replaceRange("\nedited", { line: 0, ch: 6 });
				return MARKDOWN;
			}),
		};
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, makeTargetFile("note-a.md"));
		expect(notices).toEqual([M.targetChanged]);
		expect(editor.getValue()).toBe("# Note\nedited");
		expect(editor.getValue()).not.toContain("<!-- YTranscript:start -->");
	});

	it("does not let an older slow request overwrite a newer result", async () => {
		const target = makeTargetFile("note-a.md");
		const editor = makeEditor("# Note");
		const first = deferred();
		const second = deferred();
		const runCalls: RunCall[] = [];
		const runner: TranscriptionRunnerLike = {
			run: jest.fn((request, options) => {
				runCalls.push({ request, options });
				return runCalls.length === 1 ? first.promise : second.promise;
			}),
		};
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
		});
		const firstCall = command.execute(editor, target);
		await waitFor(runCalls, 1);
		const secondCall = command.execute(editor, target);
		await waitFor(runCalls, 2);
		second.resolve({ ...MARKDOWN, text: "NEW-CONTENT\n" });
		await secondCall;
		expect(editor.getValue()).toContain("NEW-CONTENT");
		first.resolve({ ...MARKDOWN, text: "OLD-CONTENT\n" });
		await firstCall;
		expect(editor.getValue()).toContain("NEW-CONTENT");
		expect(editor.getValue()).not.toContain("OLD-CONTENT");
		expect(notices.some((message) => message.includes("failed"))).toBe(
			false,
		);
	});

	it("keeps concurrent requests on different files independent", async () => {
		promptValue = "";
		const targetA = makeTargetFile("a.md");
		const targetB = makeTargetFile("b.md");
		const editorA = makeEditor("# A");
		const editorB = makeEditor("# B");
		const pendingA = deferred();
		const pendingB = deferred();
		const runCalls: RunCall[] = [];
		const runner: TranscriptionRunnerLike = {
			run: jest.fn((request, options) => {
				runCalls.push({ request, options });
				return request.videoUrl === YOUTUBE_URL_A
					? pendingA.promise
					: pendingB.promise;
			}),
		};
		const { app } = makeApp({
			"a.md": { source: YOUTUBE_URL_A },
			"b.md": { source: YOUTUBE_URL_B },
		});
		const { command } = buildCommand({ app, runner });
		const callA = command.execute(editorA, targetA);
		await waitFor(runCalls, 1);
		const callB = command.execute(editorB, targetB);
		await waitFor(runCalls, 2);
		pendingB.resolve({ ...MARKDOWN, text: "B-ONLY\n" });
		await callB;
		await Promise.resolve();
		expect(editorA.getValue()).toBe("# A");
		pendingA.resolve({ ...MARKDOWN, text: "A-ONLY\n" });
		await callA;
		expect(editorA.getValue()).toContain("A-ONLY");
		expect(editorA.getValue()).not.toContain("B-ONLY");
		expect(editorB.getValue()).toContain("B-ONLY");
		expect(editorB.getValue()).not.toContain("A-ONLY");
	});

	it.each([
		[
			"invalid-base-url",
			new Video2KnowledgeClientError(
				"invalid-base-url",
				"x https://secret.example/a",
			),
			M.invalidBaseUrl,
		],
		[
			"transport-error",
			new Video2KnowledgeClientError("transport-error", "boom sk-leak"),
			M.transport,
		],
		[
			"http-error",
			new Video2KnowledgeClientError("http-error", "boom detail", {
				status: 503,
			}),
			"Local ASR service request failed (HTTP 503).",
		],
		[
			"protocol-error",
			new Video2KnowledgeClientError("protocol-error", "boom"),
			M.incompatible,
		],
		[
			"invalid-json",
			new Video2KnowledgeClientError("invalid-json", "boom"),
			M.incompatible,
		],
		[
			"failed",
			new TranscriptionRunError("failed", "task.error sk-leak", "t-1"),
			M.failed,
		],
		[
			"timeout",
			new TranscriptionRunError("timeout", "task.error sk-leak", "t-1"),
			M.timeout,
		],
		[
			"cancelled",
			new TranscriptionRunError("cancelled", "x", "t-1"),
			M.cancelled,
		],
		[
			"unknown",
			new Error("https://secret.example/video?token=sk-abc"),
			M.unknown,
		],
	] as Array<[string, unknown, string]>)(
		"maps a %s failure to a safe message without leaking details",
		async (_name, error, expected) => {
			const runner: TranscriptionRunnerLike = {
				run: jest.fn(async () => {
					throw error;
				}),
			};
			const { command, notices } = buildCommand({
				app: makeApp().app,
				runner,
			});
			const editor = makeEditor("# Note");
			await command.execute(editor, makeTargetFile("note-a.md"));
			expect(notices).toEqual([expected]);
			expect(notices[0]).not.toContain("secret.example");
			expect(notices[0]).not.toContain("sk-leak");
			expect(notices[0]).not.toContain("task.error");
			expect(editor.getValue()).toBe("# Note");
		},
	);

	it("maps a bad base URL thrown by the factory and leaves the note unchanged", async () => {
		const createRunner = jest.fn(() => {
			throw new Video2KnowledgeClientError("invalid-base-url", "bad");
		});
		const notices: string[] = [];
		const command = new InsertAsrTranscriptCommand({
			app: makeApp().app,
			settings: { ...DEFAULT_ASR_SETTINGS },
			createRunner,
			showNotice: (message: string) => notices.push(message),
			isDesktopApp: () => true,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, makeTargetFile("note-a.md"));
		expect(notices).toEqual([M.invalidBaseUrl]);
		expect(editor.getValue()).toBe("# Note");
	});

	it("maps an unknown throw from the runner and leaves the note unchanged", async () => {
		const runner: TranscriptionRunnerLike = {
			run: jest.fn(async () => {
				throw new Error("boom https://secret.example/x");
			}),
		};
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, makeTargetFile("note-a.md"));
		expect(notices).toEqual([M.unknown]);
		expect(editor.getValue()).toBe("# Note");
	});
});

describe("InsertAsrTranscriptCommand platform-neutral mode", () => {
	const multiPagePreview: BilibiliPagesPreview = {
		title: "Multi-part video",
		totalPages: 3,
		pages: [
			{ page: 1, part: "One", duration: 10 },
			{ page: 2, part: "Two", duration: 20 },
			{ page: 3, part: "Three", duration: 30 },
		],
		previousPages: [3, 1],
	};

	it("keeps the legacy command YouTube-only", async () => {
		promptValue = BILIBILI_URL;
		const { runner, runCalls } = runnerReturning();
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
		});
		await command.execute(
			makeEditor("# Note"),
			makeTargetFile("note-a.md"),
		);
		expect(runCalls).toHaveLength(0);
		expect(notices).toEqual([M.notYouTube]);
	});

	it("accepts YouTube without calling Bilibili preview", async () => {
		const { runner, runCalls } = runnerReturning();
		const previewBilibiliPages = jest.fn();
		const { command } = buildCommand({
			app: makeApp().app,
			runner,
			sourceMode: "supported",
			previewBilibiliPages,
		});
		await command.execute(
			makeEditor("# Note"),
			makeTargetFile("note-a.md"),
		);
		expect(previewBilibiliPages).not.toHaveBeenCalled();
		expect(runCalls[0].request).toStrictEqual({
			videoUrl: YOUTUBE_URL,
			processingMode: "reuse",
			preferSubtitles: true,
			whisperModel: "base",
			useGpu: false,
		});
	});

	it("auto-selects the only Bilibili part without opening selection", async () => {
		promptValue = BILIBILI_URL;
		const preview: BilibiliPagesPreview = {
			title: "Single part",
			totalPages: 1,
			pages: [{ page: 1, part: "Main", duration: 61 }],
			previousPages: null,
		};
		const previewBilibiliPages = jest.fn(async () => preview);
		const selectBilibiliPages = jest.fn();
		const { runner, runCalls } = runnerReturning();
		const { command } = buildCommand({
			app: makeApp().app,
			runner,
			sourceMode: "supported",
			previewBilibiliPages,
			selectBilibiliPages,
		});
		await command.execute(
			makeEditor("# Note"),
			makeTargetFile("note-a.md"),
		);
		expect(previewBilibiliPages).toHaveBeenCalledWith(
			"http://127.0.0.1:8000",
			BILIBILI_URL,
		);
		expect(selectBilibiliPages).not.toHaveBeenCalled();
		expect(runCalls[0].request.bilibiliPages).toEqual([1]);
	});

	it("detects a Bilibili source from the target note frontmatter", async () => {
		promptValue = "";
		const target = makeTargetFile("note-a.md");
		const { app } = makeApp({
			"note-a.md": { source: BILIBILI_URL },
		});
		const { runner, runCalls } = runnerReturning();
		const { command } = buildCommand({
			app,
			runner,
			sourceMode: "supported",
			previewBilibiliPages: async () => ({
				title: "Single part",
				totalPages: 1,
				pages: [{ page: 1, part: "Main", duration: 61 }],
				previousPages: null,
			}),
		});
		await command.execute(makeEditor("# Note"), target);
		expect(promptInitialValues).toEqual([BILIBILI_URL]);
		expect(runCalls[0].request.videoUrl).toBe(BILIBILI_URL);
	});

	it("canonicalizes a bare BV id from frontmatter before confirmation", async () => {
		promptValue = "";
		const target = makeTargetFile("note-a.md");
		const { app } = makeApp({
			"note-a.md": { source: "分享视频 BV1DKbxzjEz9" },
		});
		const { runner, runCalls } = runnerReturning();
		const { command } = buildCommand({
			app,
			runner,
			sourceMode: "supported",
			previewBilibiliPages: async () => ({
				title: "Single part",
				totalPages: 1,
				pages: [{ page: 1, part: "Main", duration: 61 }],
				previousPages: null,
			}),
		});
		await command.execute(makeEditor("# Note"), target);
		expect(promptInitialValues).toEqual([BILIBILI_URL]);
		expect(runCalls[0].request.videoUrl).toBe(BILIBILI_URL);
	});

	it("uses previous pages as multi-part defaults and sends the explicit selection", async () => {
		promptValue = BILIBILI_URL_P2;
		const previewBilibiliPages = jest.fn(async () => multiPagePreview);
		const selectBilibiliPages = jest.fn(async () => [2, 3]);
		const { runner, runCalls } = runnerReturning();
		const { command } = buildCommand({
			app: makeApp().app,
			runner,
			sourceMode: "supported",
			previewBilibiliPages,
			selectBilibiliPages,
		});
		await command.execute(
			makeEditor("# Note"),
			makeTargetFile("note-a.md"),
		);
		expect(selectBilibiliPages).toHaveBeenCalledWith(
			multiPagePreview,
			[3, 1],
		);
		expect(runCalls[0].request.bilibiliPages).toEqual([2, 3]);
	});

	it("stops silently when multi-part selection is cancelled", async () => {
		promptValue = BILIBILI_URL;
		const { runner, runCalls } = runnerReturning();
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
			sourceMode: "supported",
			previewBilibiliPages: async () => multiPagePreview,
			selectBilibiliPages: async () => null,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, makeTargetFile("note-a.md"));
		expect(runCalls).toHaveLength(0);
		expect(notices).toEqual([]);
		expect(editor.getValue()).toBe("# Note");
	});

	it("does not run when the note changes during Bilibili preview", async () => {
		promptValue = BILIBILI_URL;
		const editor = makeEditor("# Note");
		const { runner, runCalls } = runnerReturning();
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
			sourceMode: "supported",
			previewBilibiliPages: async () => {
				editor.replaceRange(" changed", { line: 0, ch: 6 });
				return multiPagePreview;
			},
		});
		await command.execute(editor, makeTargetFile("note-a.md"));
		expect(runCalls).toHaveLength(0);
		expect(notices).toEqual([M.targetChanged]);
		expect(editor.getValue()).toBe("# Note changed");
	});

	it("uses a stable message for unsupported prompt input", async () => {
		promptValue = "https://example.com/video";
		const { runner, runCalls } = runnerReturning();
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
			sourceMode: "supported",
		});
		await command.execute(
			makeEditor("# Note"),
			makeTargetFile("note-a.md"),
		);
		expect(runCalls).toHaveLength(0);
		expect(notices).toEqual([M.notSupported]);
	});

	it("maps a Bilibili preview protocol failure without leaking details", async () => {
		promptValue = BILIBILI_URL;
		const { runner, runCalls } = runnerReturning();
		const { command, notices } = buildCommand({
			app: makeApp().app,
			runner,
			sourceMode: "supported",
			previewBilibiliPages: async () => {
				throw new Video2KnowledgeClientError(
					"protocol-error",
					"secret backend detail sk-leak",
				);
			},
		});
		await command.execute(
			makeEditor("# Note"),
			makeTargetFile("note-a.md"),
		);
		expect(runCalls).toHaveLength(0);
		expect(notices).toEqual([M.incompatible]);
		expect(notices[0]).not.toContain("sk-leak");
	});
});

describe("getDefaultBilibiliPages", () => {
	const preview: BilibiliPagesPreview = {
		title: "x",
		totalPages: 3,
		pages: [
			{ page: 1, part: "One", duration: 1 },
			{ page: 2, part: "Two", duration: 1 },
			{ page: 3, part: "Three", duration: 1 },
		],
		previousPages: null,
	};

	it("prefers previous pages over the URL query", () => {
		expect(
			getDefaultBilibiliPages(
				{ ...preview, previousPages: [3] },
				BILIBILI_URL_P2,
			),
		).toEqual([3]);
	});

	it("uses a valid URL p query when there are no previous pages", () => {
		expect(getDefaultBilibiliPages(preview, BILIBILI_URL_P2)).toEqual([2]);
	});

	it("returns no defaults for an unavailable URL page", () => {
		expect(getDefaultBilibiliPages(preview, BILIBILI_URL + "?p=9")).toEqual(
			[],
		);
	});
});

describe("normalizeAsrWhisperModel", () => {
	it("falls back to base for empty or blank input and trims values", () => {
		expect(normalizeAsrWhisperModel("")).toBe("base");
		expect(normalizeAsrWhisperModel("   ")).toBe("base");
		expect(normalizeAsrWhisperModel(" small ")).toBe("small");
		expect(normalizeAsrWhisperModel("base")).toBe("base");
	});
});

describe("YTranscriptPlugin local ASR wiring", () => {
	type RegisteredCommand = {
		id: string;
		name: string;
		editorCallback?: (
			editor: Editor,
			ctx: { file: TFile | null },
		) => unknown;
	};

	function commandsOf(plugin: YTranscriptPlugin): RegisteredCommand[] {
		return (plugin as unknown as { commands: RegisteredCommand[] })
			.commands;
	}

	it("registers the local ASR command and forwards ctx.file", async () => {
		const { app } = makeApp();
		const plugin = new YTranscriptPlugin(app, {} as never);
		await plugin.onload();
		const command = commandsOf(plugin).find(
			(entry) => entry.id === "insert-youtube-transcript-local-asr",
		);
		expect(command).toBeDefined();
		expect(command?.name).toBe("Insert YouTube transcript using local ASR");

		const execute = jest.fn();
		(
			plugin as unknown as {
				insertAsrTranscriptCommand: { execute: unknown };
			}
		).insertAsrTranscriptCommand = { execute };
		const editor = makeEditor("# Note");
		const targetFile = makeTargetFile("note-a.md");
		await command?.editorCallback?.(editor, { file: targetFile });
		expect(execute).toHaveBeenCalledTimes(1);
		const [passedEditor, passedFile, getCurrentFile] = execute.mock
			.calls[0] as [Editor, TFile | null, () => TFile | null];
		expect(passedEditor).toBe(editor);
		expect(passedFile).toBe(targetFile);
		expect(getCurrentFile()).toBe(targetFile);
	});

	it("registers the platform-neutral local transcript command and forwards ctx.file", async () => {
		const { app } = makeApp();
		const plugin = new YTranscriptPlugin(app, {} as never);
		await plugin.onload();
		const command = commandsOf(plugin).find(
			(entry) => entry.id === "insert-video-transcript-local",
		);
		expect(command?.name).toBe(
			"Insert video transcript using local service",
		);

		const execute = jest.fn();
		(
			plugin as unknown as {
				insertLocalTranscriptCommand: { execute: unknown };
			}
		).insertLocalTranscriptCommand = { execute };
		const editor = makeEditor("# Note");
		const targetFile = makeTargetFile("note-a.md");
		await command?.editorCallback?.(editor, { file: targetFile });
		const [passedEditor, passedFile, getCurrentFile] = execute.mock
			.calls[0] as [Editor, TFile | null, () => TFile | null];
		expect(passedEditor).toBe(editor);
		expect(passedFile).toBe(targetFile);
		expect(getCurrentFile()).toBe(targetFile);
	});

	it("uses the four local ASR defaults and keeps older stored data", async () => {
		expect(DEFAULT_SETTINGS.video2KnowledgeBaseUrl).toBe(
			"http://127.0.0.1:8000",
		);
		expect(DEFAULT_SETTINGS.asrWhisperModel).toBe("base");
		expect(DEFAULT_SETTINGS.asrPreferSubtitles).toBe(true);
		expect(DEFAULT_SETTINGS.asrUseGpu).toBe(false);

		const { app } = makeApp();
		const plugin = new YTranscriptPlugin(app, {} as never);
		(plugin as unknown as { loadData: () => Promise<unknown> }).loadData =
			async () => ({ timestampMod: 3 });
		await plugin.onload();
		expect(plugin.settings.timestampMod).toBe(3);
		expect(plugin.settings.video2KnowledgeBaseUrl).toBe(
			"http://127.0.0.1:8000",
		);
		expect(plugin.settings.asrWhisperModel).toBe("base");
		expect(plugin.settings.asrPreferSubtitles).toBe(true);
		expect(plugin.settings.asrUseGpu).toBe(false);
	});
});
