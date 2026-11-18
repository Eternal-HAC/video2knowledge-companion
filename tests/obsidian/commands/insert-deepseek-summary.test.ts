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
		addStatusBarItem() {
			return {
				style: { display: "" },
				setAttribute: jest.fn(),
				setText: jest.fn(),
			};
		}
		async loadData() {
			return null;
		}
		async saveData() {}
	},
	PluginSettingTab: class MockPluginSettingTab {},
	Setting: class MockSetting {},
	WorkspaceLeaf: class MockWorkspaceLeaf {},
	Platform: { isDesktopApp: true },
	ButtonComponent: class MockButtonComponent {},
	TextComponent: class MockTextComponent {},
	Menu: class MockMenu {},
	setIcon: jest.fn(),
	requestUrl: jest.fn(),
}));

import type { App, Editor, EditorPosition, TFile } from "obsidian";

import {
	InsertDeepSeekSummaryCommand,
	type SummaryRunnerLike,
} from "src/obsidian/commands/insert-deepseek-summary";
import { DEFAULT_ASR_SETTINGS } from "src/obsidian/commands/insert-asr-transcript";
import YTranscriptPlugin from "src/obsidian/plugin";
import type {
	LocalTaskProgress,
	LocalTaskProgressFactory,
} from "src/obsidian/local-task-progress";
import {
	SummaryRunError,
	Video2KnowledgeClientError,
	type BilibiliPagesPreview,
	type MarkdownSummary,
	type StartSummaryRequest,
	type TranscriptionTask,
} from "src/video2knowledge/types";

jest.mock("src/obsidian/modals/prompt-modal", () => ({
	PromptModal: jest
		.fn()
		.mockImplementation((_app: unknown, initialValue?: string) => ({
			openAndGetValue: (
				resolve: (value: string) => void,
				reject: () => void,
			) => {
				promptInitialValues.push(initialValue ?? "");
				if (promptCancelled) reject();
				else resolve(promptValue || initialValue || "");
			},
		})),
}));

jest.mock("src/obsidian/modals/bilibili-pages-modal", () => ({
	BilibiliPagesModal: jest.fn().mockImplementation(() => ({
		openAndGetValue: async () => [2],
	})),
}));

import { BilibiliPagesModal } from "src/obsidian/modals/bilibili-pages-modal";

const URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const URL_B = "https://youtu.be/bbbbbbbbbbb";
const BILIBILI_URL = "https://www.bilibili.com/video/BV1DKbxzjEz9";
const BILIBILI_URL_P2 = BILIBILI_URL + "?p=2";
const SUMMARY: MarkdownSummary = {
	taskId: "summary-1",
	format: "markdown",
	text: "# DeepSeek Summary\n\nImportant points.",
};

let promptValue = URL;
let promptCancelled = false;
let promptInitialValues: string[] = [];
let clipboardText = "";

Object.defineProperty(navigator, "clipboard", {
	value: { readText: async () => clipboardText },
	configurable: true,
});

beforeEach(() => {
	promptValue = URL;
	promptCancelled = false;
	promptInitialValues = [];
	clipboardText = "";
	jest.mocked(BilibiliPagesModal).mockClear();
});

function deferred() {
	let resolve!: (value: MarkdownSummary) => void;
	const promise = new Promise<MarkdownSummary>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

async function waitForCalls(
	calls: Array<unknown>,
	count: number,
): Promise<void> {
	for (let index = 0; index < 100 && calls.length < count; index++) {
		await Promise.resolve();
	}
	expect(calls).toHaveLength(count);
}

function makeRunner(
	results: Array<MarkdownSummary | Promise<MarkdownSummary> | Error> = [
		SUMMARY,
	],
) {
	const calls: Array<{
		request: StartSummaryRequest;
		options?: {
			isCancelled?: () => boolean;
			onProgress?: (task: TranscriptionTask) => void;
		};
	}> = [];
	const runner: SummaryRunnerLike = {
		run: jest.fn(async (request, options) => {
			calls.push({ request, options });
			const next = results.shift();
			if (next instanceof Error) throw next;
			if (next instanceof Promise) return next;
			if (!next) throw new Error("unexpected runner call");
			return next;
		}),
	};
	return { runner, calls };
}

function makeProgress(): LocalTaskProgress {
	return {
		isCancelled: jest.fn(() => false),
		update: jest.fn(),
		close: jest.fn(),
	};
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
			const before = lines[from.line]?.slice(0, from.ch) ?? "";
			const after = to ? (lines[to.line]?.slice(to.ch) ?? "") : "";
			const merged = before + replacement + after;
			lines.splice(
				from.line,
				to ? to.line - from.line + 1 : 1,
				...merged.split("\n"),
			);
			text = lines.join("\n");
		},
	} as unknown as Editor;
}

function file(path = "note.md"): TFile {
	return { path } as unknown as TFile;
}

function makeApp(frontmatter: Record<string, unknown> = {}) {
	return {
		workspace: { getActiveFile: jest.fn() },
		metadataCache: {
			getFileCache: jest.fn(() => ({ frontmatter })),
		},
	} as unknown as App;
}

function buildCommand(
	options: {
		app?: App;
		runner?: SummaryRunnerLike;
		desktop?: boolean;
		createProgress?: LocalTaskProgressFactory;
		previewBilibiliPages?: (
			baseUrl: string,
			videoUrl: string,
		) => Promise<BilibiliPagesPreview>;
		selectBilibiliPages?: (
			preview: BilibiliPagesPreview,
			defaultPages: number[],
		) => Promise<number[] | null>;
	} = {},
) {
	const notices: string[] = [];
	const runner = options.runner ?? makeRunner().runner;
	const createRunner = jest.fn(() => runner);
	const progress = makeProgress();
	const createProgress = jest.fn(options.createProgress ?? (() => progress));
	const command = new InsertDeepSeekSummaryCommand({
		app: options.app ?? makeApp({ source: URL }),
		settings: { ...DEFAULT_ASR_SETTINGS },
		createRunner,
		showNotice: (message) => notices.push(message),
		createProgress,
		isDesktopApp: () => options.desktop ?? true,
		previewBilibiliPages: options.previewBilibiliPages,
		selectBilibiliPages: options.selectBilibiliPages,
	});
	return {
		command,
		createRunner,
		createProgress,
		notices,
		progress,
	};
}

describe("InsertDeepSeekSummaryCommand", () => {
	it("reports progress and closes the progress surface", async () => {
		const { runner, calls } = makeRunner();
		const { command, createProgress, progress } = buildCommand({ runner });
		await command.execute(makeEditor("# Note"), file());
		calls[0].options?.onProgress?.({
			taskId: "summary-1",
			status: "processing",
			progress: 25,
		});
		expect(createProgress).toHaveBeenCalledWith("summary");
		expect(progress.update).toHaveBeenCalledWith({
			taskId: "summary-1",
			status: "processing",
			progress: 25,
		});
		expect(progress.close).toHaveBeenCalledTimes(1);
	});

	it("maps the progress cancel action to local summary cancellation", async () => {
		const progress = makeProgress();
		(progress.isCancelled as jest.Mock).mockReturnValue(true);
		const runner: SummaryRunnerLike = {
			run: jest.fn(async (_request, options) => {
				expect(options?.isCancelled?.()).toBe(true);
				throw new SummaryRunError("cancelled", "unsafe", "summary-1");
			}),
		};
		const { command, notices } = buildCommand({
			runner,
			createProgress: () => progress,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, file());
		expect(notices[0]).toContain("stopped local waiting");
		expect(progress.close).toHaveBeenCalledTimes(1);
		expect(editor.getValue()).toBe("# Note");
	});

	it("rejects mobile before prompting or creating a runner", async () => {
		const { command, createRunner, notices } = buildCommand({
			desktop: false,
		});
		await command.execute(makeEditor(), file());
		expect(createRunner).not.toHaveBeenCalled();
		expect(promptInitialValues).toEqual([]);
		expect(notices[0]).toContain("requires Obsidian desktop");
	});

	it("uses ctx.file frontmatter and sends the fixed reuse request", async () => {
		promptValue = "";
		const { runner, calls } = makeRunner();
		const app = makeApp({ source: URL_B });
		const { command } = buildCommand({ app, runner });
		await command.execute(makeEditor("# Note"), file("target.md"));
		expect(promptInitialValues).toEqual([URL_B]);
		expect(calls[0].request).toEqual({
			videoUrl: URL_B,
			processingMode: "reuse",
			preferSubtitles: true,
			whisperModel: "base",
			useGpu: false,
		});
		expect(app.workspace.getActiveFile).not.toHaveBeenCalled();
	});

	it("keeps the YouTube summary path free of Bilibili preview calls", async () => {
		const previewBilibiliPages = jest.fn();
		const { runner, calls } = makeRunner();
		const { command } = buildCommand({ runner, previewBilibiliPages });
		await command.execute(makeEditor("# Note"), file());
		expect(previewBilibiliPages).not.toHaveBeenCalled();
		expect(calls[0].request).not.toHaveProperty("bilibiliPages");
	});

	it("auto-selects a single Bilibili part from frontmatter", async () => {
		promptValue = "";
		const preview: BilibiliPagesPreview = {
			title: "Single part",
			totalPages: 1,
			pages: [{ page: 1, part: "Main", duration: 61 }],
			previousPages: null,
		};
		const previewBilibiliPages = jest.fn(async () => preview);
		const selectBilibiliPages = jest.fn();
		const { runner, calls } = makeRunner();
		const { command } = buildCommand({
			app: makeApp({ source: BILIBILI_URL }),
			runner,
			previewBilibiliPages,
			selectBilibiliPages,
		});
		await command.execute(makeEditor("# Note"), file());
		expect(promptInitialValues).toEqual([BILIBILI_URL]);
		expect(previewBilibiliPages).toHaveBeenCalledWith(
			"http://127.0.0.1:8000",
			BILIBILI_URL,
		);
		expect(selectBilibiliPages).not.toHaveBeenCalled();
		expect(calls[0].request.bilibiliPages).toEqual([1]);
	});

	it("uses previous pages as Bilibili multi-part defaults and sends the selection", async () => {
		promptValue = BILIBILI_URL_P2;
		const preview: BilibiliPagesPreview = {
			title: "Multi-part video",
			totalPages: 3,
			pages: [
				{ page: 1, part: "One", duration: 10 },
				{ page: 2, part: "Two", duration: 20 },
				{ page: 3, part: "Three", duration: 30 },
			],
			previousPages: [3, 1],
		};
		const selectBilibiliPages = jest.fn(async () => [2, 3]);
		const { runner, calls } = makeRunner();
		const { command } = buildCommand({
			runner,
			previewBilibiliPages: async () => preview,
			selectBilibiliPages,
		});
		await command.execute(makeEditor("# Note"), file());
		expect(selectBilibiliPages).toHaveBeenCalledWith(preview, [3, 1]);
		expect(calls[0].request.bilibiliPages).toEqual([2, 3]);
	});

	it("labels the default Bilibili selector for summary work", async () => {
		promptValue = BILIBILI_URL_P2;
		const preview: BilibiliPagesPreview = {
			title: "Multi-part video",
			totalPages: 2,
			pages: [
				{ page: 1, part: "One", duration: 10 },
				{ page: 2, part: "Two", duration: 20 },
			],
			previousPages: null,
		};
		const { runner, calls } = makeRunner();
		const app = makeApp();
		const { command } = buildCommand({
			app,
			runner,
			previewBilibiliPages: async () => preview,
		});
		await command.execute(makeEditor("# Note"), file());
		expect(BilibiliPagesModal).toHaveBeenCalledWith(
			app,
			preview,
			[2],
			"Summarize selected parts",
		);
		expect(calls[0].request.bilibiliPages).toEqual([2]);
	});

	it("stops before submission when Bilibili part selection is cancelled", async () => {
		promptValue = BILIBILI_URL;
		const preview: BilibiliPagesPreview = {
			title: "Multi-part video",
			totalPages: 2,
			pages: [
				{ page: 1, part: "One", duration: 10 },
				{ page: 2, part: "Two", duration: 20 },
			],
			previousPages: null,
		};
		const { runner, calls } = makeRunner();
		const { command, notices } = buildCommand({
			runner,
			previewBilibiliPages: async () => preview,
			selectBilibiliPages: async () => null,
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, file());
		expect(calls).toHaveLength(0);
		expect(notices).toEqual([]);
		expect(editor.getValue()).toBe("# Note");
	});

	it("stops before submission when the note changes during Bilibili preview", async () => {
		promptValue = BILIBILI_URL;
		const editor = makeEditor("# Note");
		const { runner, calls } = makeRunner();
		const { command, notices } = buildCommand({
			runner,
			previewBilibiliPages: async () => {
				editor.replaceRange(" changed", { line: 0, ch: 6 });
				return {
					title: "Single part",
					totalPages: 1,
					pages: [{ page: 1, part: "Main", duration: 61 }],
					previousPages: null,
				};
			},
		});
		await command.execute(editor, file());
		expect(calls).toHaveLength(0);
		expect(notices[0]).toContain("target note changed");
		expect(editor.getValue()).toBe("# Note changed");
	});

	it("stops before submission when the note changes during Bilibili selection", async () => {
		promptValue = BILIBILI_URL;
		const editor = makeEditor("# Note");
		const preview: BilibiliPagesPreview = {
			title: "Multi-part video",
			totalPages: 2,
			pages: [
				{ page: 1, part: "One", duration: 10 },
				{ page: 2, part: "Two", duration: 20 },
			],
			previousPages: null,
		};
		const { runner, calls } = makeRunner();
		const { command, notices } = buildCommand({
			runner,
			previewBilibiliPages: async () => preview,
			selectBilibiliPages: async () => {
				editor.replaceRange(" changed", { line: 0, ch: 6 });
				return [2];
			},
		});
		await command.execute(editor, file());
		expect(calls).toHaveLength(0);
		expect(notices[0]).toContain("target note changed");
		expect(editor.getValue()).toBe("# Note changed");
	});

	it("uses a stable message for unsupported video input", async () => {
		promptValue = "https://example.com/video";
		const { runner, calls } = makeRunner();
		const { command, notices } = buildCommand({ runner });
		await command.execute(makeEditor("# Note"), file());
		expect(calls).toHaveLength(0);
		expect(notices).toEqual(["Not a supported YouTube or Bilibili URL."]);
	});

	it("maps Bilibili preview failures without misreporting DeepSeek configuration", async () => {
		promptValue = BILIBILI_URL;
		const { runner, calls } = makeRunner();
		const { command, notices } = buildCommand({
			runner,
			previewBilibiliPages: async () => {
				throw new Video2KnowledgeClientError(
					"http-error",
					"secret backend detail sk-leak",
					{ status: 400 },
				);
			},
		});
		await command.execute(makeEditor("# Note"), file());
		expect(calls).toHaveLength(0);
		expect(notices).toEqual([
			"Could not load Bilibili video parts (HTTP 400).",
		]);
		expect(notices[0]).not.toContain("DeepSeek");
		expect(notices[0]).not.toContain("secret");
	});

	it("inserts summary after transcript and preserves canaries", async () => {
		const editor = makeEditor(
			"BEFORE\n\n<!-- YTranscript:start -->\nraw\n<!-- YTranscript:end -->\n\nAFTER",
		);
		const { command, notices } = buildCommand();
		await command.execute(editor, file());
		expect(editor.getValue()).toBe(
			"BEFORE\n\n<!-- YTranscript:start -->\nraw\n<!-- YTranscript:end -->\n\n<!-- YSummary:start -->\n# DeepSeek Summary\n\nImportant points.\n<!-- YSummary:end -->\n\nAFTER",
		);
		expect(notices).toEqual(["DeepSeek summary inserted."]);
	});

	it("updates only an existing summary region", async () => {
		const editor = makeEditor(
			"<!-- YTranscript:start -->\nraw\n<!-- YTranscript:end -->\n\n<!-- YSummary:start -->\nold\n<!-- YSummary:end -->\nTAIL",
		);
		const { runner } = makeRunner([
			{ ...SUMMARY, text: "first" },
			{ ...SUMMARY, text: "second" },
		]);
		const { command } = buildCommand({ runner });
		await command.execute(editor, file());
		await command.execute(editor, file());
		expect(editor.getValue()).toContain(
			"<!-- YSummary:start -->\nsecond\n<!-- YSummary:end -->",
		);
		expect(editor.getValue()).toContain(
			"<!-- YTranscript:start -->\nraw\n<!-- YTranscript:end -->",
		);
		expect(editor.getValue()).toContain("TAIL");
	});

	it.each([
		"<!-- YSummary:start -->\nold",
		"<!-- YSummary:end -->\nold\n<!-- YSummary:start -->",
	])("fails closed for invalid summary markers: %s", async (original) => {
		const editor = makeEditor(original);
		const { command, notices } = buildCommand();
		await command.execute(editor, file());
		expect(editor.getValue()).toBe(original);
		expect(notices[0]).toContain("was not inserted");
	});

	it("rejects generated content containing either managed marker family", async () => {
		const unsafe = {
			...SUMMARY,
			text: "unsafe <!-- YTranscript:start -->",
		};
		const editor = makeEditor("# Note");
		const { command, notices } = buildCommand({
			runner: makeRunner([unsafe]).runner,
		});
		await command.execute(editor, file());
		expect(editor.getValue()).toBe("# Note");
		expect(notices[0]).toContain("reserved marker");
	});

	it("does not write when target or editor changes during the run", async () => {
		const pending = deferred();
		const runner = makeRunner([pending.promise]);
		const editor = makeEditor("original");
		const target = file("one.md");
		let current = target;
		const { command, notices } = buildCommand({ runner: runner.runner });
		const running = command.execute(editor, target, () => current);
		await waitForCalls(runner.calls, 1);
		current = file("two.md");
		pending.resolve(SUMMARY);
		await running;
		expect(editor.getValue()).toBe("original");
		expect(notices).toEqual([
			"DeepSeek summary stopped: the target note changed; local waiting stopped, and the backend task may still be running.",
		]);
	});

	it("does not let an older request overwrite a newer result", async () => {
		const slow = deferred();
		const fast = deferred();
		const { runner } = makeRunner([slow.promise, fast.promise]);
		const editor = makeEditor("# Note");
		const target = file();
		const { command, notices } = buildCommand({ runner });
		const first = command.execute(editor, target);
		await waitForCalls((runner.run as jest.Mock).mock.calls, 1);
		const second = command.execute(editor, target);
		await waitForCalls((runner.run as jest.Mock).mock.calls, 2);
		fast.resolve({ ...SUMMARY, text: "new" });
		await second;
		slow.resolve({ ...SUMMARY, text: "old" });
		await first;
		expect(editor.getValue()).toContain(
			"<!-- YSummary:start -->\nnew\n<!-- YSummary:end -->",
		);
		expect(editor.getValue()).not.toContain("\nold\n");
		expect(notices).toEqual(["DeepSeek summary inserted."]);
	});

	it.each([
		[
			new Video2KnowledgeClientError("invalid-base-url", "unsafe"),
			"Local summary service URL is invalid",
		],
		[
			new Video2KnowledgeClientError("transport-error", "unsafe"),
			"Cannot reach the local Video2Knowledge service.",
		],
		[
			new Video2KnowledgeClientError("http-error", "secret", {
				status: 400,
			}),
			"DeepSeek is not configured",
		],
		[new SummaryRunError("failed", "secret"), "summary task failed"],
		[new SummaryRunError("timeout", "secret"), "timed out"],
	] as const)(
		"maps failures without exposing raw messages",
		async (error, message) => {
			const editor = makeEditor("original");
			const { command, notices } = buildCommand({
				runner: makeRunner([error]).runner,
			});
			await command.execute(editor, file());
			expect(editor.getValue()).toBe("original");
			expect(notices[0]).toContain(message);
			expect(notices[0]).not.toContain("secret");
			expect(notices[0]).not.toContain("unsafe");
		},
	);

	it("stops silently when the prompt is cancelled", async () => {
		promptCancelled = true;
		const { command, createRunner, notices } = buildCommand();
		await command.execute(makeEditor("original"), file());
		expect(createRunner).not.toHaveBeenCalled();
		expect(notices).toEqual([]);
	});
});

describe("YTranscriptPlugin DeepSeek summary wiring", () => {
	it("registers the summary command and forwards ctx.file", async () => {
		const ctxFile = file("ctx.md");
		const app = {
			workspace: {
				getActiveFile: jest.fn(),
				detachLeavesOfType: jest.fn(),
			},
			metadataCache: { getFileCache: jest.fn() },
		} as unknown as App;
		const plugin = new YTranscriptPlugin(
			app,
			{} as never,
		) as YTranscriptPlugin & {
			commands: Array<Record<string, unknown>>;
		};
		await plugin.onload();
		const registered = plugin.commands.find(
			(command) => command.id === "insert-youtube-deepseek-summary",
		);
		expect(registered?.name).toBe(
			"Insert DeepSeek summary using local service",
		);
		expect(typeof registered?.editorCallback).toBe("function");
		const execute = jest
			.spyOn(
				(
					plugin as unknown as {
						insertDeepSeekSummaryCommand: {
							execute: () => Promise<void>;
						};
					}
				).insertDeepSeekSummaryCommand,
				"execute",
			)
			.mockResolvedValue();
		const editor = makeEditor();
		await (
			registered?.editorCallback as (
				editor: Editor,
				ctx: { file: TFile },
			) => Promise<void>
		)(editor, { file: ctxFile });
		expect(execute).toHaveBeenCalledWith(
			editor,
			ctxFile,
			expect.any(Function),
		);
	});
});
