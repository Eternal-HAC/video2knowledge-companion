jest.mock("obsidian", () => ({
	Notice: jest.fn((message: string) => {
		noticeMessages.push(message);
	}),
	Modal: class MockModal {},
	ItemView: class MockItemView {},
	App: class MockApp {},
	Plugin: class MockPlugin {},
	PluginSettingTab: class MockPluginSettingTab {},
	Setting: class MockSetting {},
	WorkspaceLeaf: class MockWorkspaceLeaf {},
	ButtonComponent: class MockButtonComponent {},
	TextComponent: class MockTextComponent {},
	Menu: class MockMenu {},
	setIcon: jest.fn(),
}));

import type { App, Editor, EditorPosition, TFile } from "obsidian";

import { InsertTranscriptCommand } from "src/obsidian/commands/insert-transcript";

const mockTranscript = {
	title: "Test Video",
	lines: [
		{ text: "hello", offset: 0, duration: 1000 },
		{ text: "world", offset: 1000, duration: 1000 },
	],
};

let fetchResult: typeof mockTranscript | null | Error = mockTranscript;
const fetchByUrl = new Map<
	string,
	Array<Promise<typeof mockTranscript> | typeof mockTranscript>
>();

function deferredTranscript() {
	let resolve!: (value: typeof mockTranscript) => void;
	const promise = new Promise<typeof mockTranscript>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function waitForFetches(count: number) {
	for (let i = 0; i < 20 && fetchCalls.length < count; i++)
		await Promise.resolve();
	expect(fetchCalls).toHaveLength(count);
}

beforeEach(() => fetchByUrl.clear());
let promptValue = "";
let noticeMessages: string[] = [];
let clipboardText = "";
let clipboardShouldFail = false;

const fetchCalls: string[] = [];
let promptInitialValues: string[] = [];

jest.mock("src/youtube/fetch", () => ({
	fetchTranscript: jest.fn(async (url: string) => {
		fetchCalls.push(url);
		const queued = fetchByUrl.get(url)?.shift();
		if (queued) return queued;
		if (fetchResult instanceof Error) throw fetchResult;
		return fetchResult;
	}),
}));

jest.mock("src/obsidian/modals/prompt-modal", () => ({
	PromptModal: jest
		.fn()
		.mockImplementation((_app: unknown, initialValue?: string) => {
			promptInitialValues.push(initialValue ?? "");
			return {
				openAndGetValue: (resolve: (v: string) => void) =>
					resolve(promptValue || initialValue || ""),
			};
		}),
}));

Object.defineProperty(navigator, "clipboard", {
	value: {
		readText: async () => {
			if (clipboardShouldFail) throw new Error("Clipboard denied");
			return clipboardText;
		},
	},
	configurable: true,
});

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
): App {
	return {
		workspace: {
			getActiveFile: () => ({ path: activeFilePath }) as TFile,
		},
		metadataCache: {
			getFileCache: (file: TFile) =>
				file.path in frontmatterByPath
					? { frontmatter: frontmatterByPath[file.path] }
					: undefined,
		},
	} as unknown as App;
}

function makeTargetFile(path: string): TFile {
	return { path } as unknown as TFile;
}

describe("InsertTranscriptCommand detection priority", () => {
	beforeEach(() => {
		fetchResult = mockTranscript;
		promptValue = "";
		promptInitialValues = [];
		noticeMessages = [];
		clipboardText = "";
		clipboardShouldFail = false;
		fetchCalls.length = 0;
	});

	it("reads frontmatter from ctx.file, not activeFile", async () => {
		const targetFile = makeTargetFile("note-a.md");
		const app = makeApp(
			{
				"note-a.md": {
					source: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					url: "https://www.youtube.com/watch?v=abcdefghijk",
				},
				"active-note.md": {
					source: "https://www.youtube.com/watch?v=active-source",
					url: "https://www.youtube.com/watch?v=active-url",
				},
			},
			"active-note.md",
		);
		const command = new InsertTranscriptCommand({
			app,
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, targetFile);
		expect(promptInitialValues).toEqual([
			"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		]);
		expect(fetchCalls).toEqual([
			"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		]);
	});

	it("detects frontmatter url when source is absent", async () => {
		const targetFile = makeTargetFile("note-a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp({
				"note-a.md": {
					url: "https://www.youtube.com/watch?v=abcdefghijk",
				},
			}),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor(
			"# Note",
			"https://www.youtube.com/watch?v=klmnopqrstu",
		);
		await command.execute(editor, targetFile);
		expect(promptInitialValues).toEqual([
			"https://www.youtube.com/watch?v=abcdefghijk",
		]);
		expect(fetchCalls).toEqual([
			"https://www.youtube.com/watch?v=abcdefghijk",
		]);
	});

	it("detects selection when frontmatter has no url", async () => {
		clipboardText = "https://www.youtube.com/watch?v=vwxyz123456";
		const targetFile = makeTargetFile("note-a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp(),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor(
			"# Note",
			"https://www.youtube.com/watch?v=klmnopqrstu",
		);
		await command.execute(editor, targetFile);
		expect(promptInitialValues).toEqual([
			"https://www.youtube.com/watch?v=klmnopqrstu",
		]);
		expect(fetchCalls).toEqual([
			"https://www.youtube.com/watch?v=klmnopqrstu",
		]);
	});

	it("detects clipboard when nothing else is available", async () => {
		clipboardText = "https://www.youtube.com/watch?v=vwxyz123456";
		const targetFile = makeTargetFile("note-a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp(),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, targetFile);
		expect(promptInitialValues).toEqual([
			"https://www.youtube.com/watch?v=vwxyz123456",
		]);
		expect(fetchCalls).toEqual([
			"https://www.youtube.com/watch?v=vwxyz123456",
		]);
	});

	it("falls back to empty prompt when no source is detected", async () => {
		promptValue = "https://www.youtube.com/watch?v=11223344556";
		const targetFile = makeTargetFile("note-a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp(),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, targetFile);
		expect(promptInitialValues).toEqual([""]);
		expect(fetchCalls).toEqual([
			"https://www.youtube.com/watch?v=11223344556",
		]);
	});

	it("falls back to empty prompt when clipboard read fails", async () => {
		clipboardShouldFail = true;
		promptValue = "https://www.youtube.com/watch?v=11223344556";
		const targetFile = makeTargetFile("note-a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp(),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, targetFile);
		expect(promptInitialValues).toEqual([""]);
		expect(fetchCalls).toEqual([
			"https://www.youtube.com/watch?v=11223344556",
		]);
	});

	it("uses the value the user submits in the prompt, overriding the detected initial value", async () => {
		clipboardText = "https://www.youtube.com/watch?v=vwxyz123456";
		promptValue = "https://www.youtube.com/watch?v=11223344556";
		const targetFile = makeTargetFile("note-a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp(),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, targetFile);
		expect(promptInitialValues).toEqual([
			"https://www.youtube.com/watch?v=vwxyz123456",
		]);
		expect(fetchCalls).toEqual([
			"https://www.youtube.com/watch?v=11223344556",
		]);
	});
});

describe("InsertTranscriptCommand behavior", () => {
	beforeEach(() => {
		fetchResult = mockTranscript;
		promptValue = "";
		noticeMessages = [];
		clipboardText = "";
		clipboardShouldFail = false;
		fetchCalls.length = 0;
	});

	it("inserts transcript into controlled region", async () => {
		const targetFile = makeTargetFile("note-a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp({
				"note-a.md": {
					source: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				},
			}),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, targetFile);
		expect(editor.getValue()).toContain("<!-- YTranscript:start -->");
		expect(editor.getValue()).toContain("<!-- YTranscript:end -->");
		expect(editor.getValue()).toContain("[00:00]");
	});

	it("shows notice when no transcript is available", async () => {
		fetchResult = { title: "Empty", lines: [] };
		const targetFile = makeTargetFile("note-a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp({
				"note-a.md": {
					source: "https://www.youtube.com/watch?v=bbbbbbbbbbb",
				},
			}),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, targetFile);
		expect(noticeMessages).toContain(
			"No transcript available for this video.",
		);
		expect(editor.getValue()).not.toContain("<!-- YTranscript:start -->");
	});

	it("shows notice for invalid frontmatter URL", async () => {
		const targetFile = makeTargetFile("note-a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp({ "note-a.md": { source: "not a url" } }),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, targetFile);
		expect(noticeMessages).toContain("Not a valid YouTube URL.");
	});

	it("shows notice when transcript region markers are ambiguous", async () => {
		const targetFile = makeTargetFile("note-a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp({
				"note-a.md": {
					source: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				},
			}),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor("# Note\n\n<!-- YTranscript:start -->\nold");
		await command.execute(editor, targetFile);
		expect(
			noticeMessages.some((m) => m.includes("Insert transcript failed")),
		).toBe(true);
		expect(editor.getValue()).toBe(
			"# Note\n\n<!-- YTranscript:start -->\nold",
		);
	});

	it("refuses to run when target file is missing", async () => {
		const command = new InsertTranscriptCommand({
			app: makeApp(),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor("# Note");
		await command.execute(editor, null as unknown as TFile);
		expect(noticeMessages).toContain(
			"Insert transcript failed: no target file provided.",
		);
		expect(fetchCalls).toEqual([]);
		expect(editor.getValue()).toBe("# Note");
	});
});

describe("InsertTranscriptCommand concurrency and stability", () => {
	it("refuses a switched context file even when editor text is unchanged", async () => {
		const target = makeTargetFile("a.md");
		let currentFile = target;
		const pending = deferredTranscript();
		const command = new InsertTranscriptCommand({
			app: makeApp({
				"a.md": { source: "https://youtu.be/dQw4w9WgXcQ" },
			}),
			showNotice: (message) => noticeMessages.push(message),
		});
		fetchByUrl.set("https://youtu.be/dQw4w9WgXcQ", [pending.promise]);
		const editor = makeEditor("# A");
		const call = command.execute(editor, target, () => currentFile);
		await waitForFetches(1);
		currentFile = makeTargetFile("b.md");
		pending.resolve(mockTranscript);
		await call;
		expect(editor.getValue()).toBe("# A");
		expect(noticeMessages).toContain(
			"Insert transcript aborted: note changed while fetching.",
		);
	});

	it("refuses a renamed target during fetch", async () => {
		const target = makeTargetFile("a.md");
		const pending = deferredTranscript();
		const command = new InsertTranscriptCommand({
			app: makeApp({
				"a.md": { source: "https://youtu.be/dQw4w9WgXcQ" },
			}),
			showNotice: (message) => noticeMessages.push(message),
		});
		fetchByUrl.set("https://youtu.be/dQw4w9WgXcQ", [pending.promise]);
		const editor = makeEditor("# A");
		const call = command.execute(editor, target);
		await waitForFetches(1);
		target.path = "renamed.md";
		pending.resolve(mockTranscript);
		await call;
		expect(editor.getValue()).toBe("# A");
		expect(noticeMessages).toContain(
			"Insert transcript aborted: note changed while fetching.",
		);
	});

	it("reports indented markers and preserves the note", async () => {
		const target = makeTargetFile("a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp({
				"a.md": { source: "https://youtu.be/dQw4w9WgXcQ" },
			}),
			showNotice: (message) => noticeMessages.push(message),
		});
		const original =
			"# Note\n    <!-- YTranscript:start -->\nold\n    <!-- YTranscript:end -->";
		const editor = makeEditor(original);
		await command.execute(editor, target);
		expect(editor.getValue()).toBe(original);
		expect(
			noticeMessages.some((message) =>
				message.includes("standalone lines"),
			),
		).toBe(true);
	});

	beforeEach(() => {
		fetchResult = mockTranscript;
		promptValue = "";
		promptInitialValues = [];
		noticeMessages = [];
		clipboardText = "";
		clipboardShouldFail = false;
		fetchCalls.length = 0;
	});

	it("does not let a stale slow response overwrite a newer response on the same target", async () => {
		const targetFile = makeTargetFile("note-a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp({
				"note-a.md": {
					source: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				},
			}),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor("# Note");

		let resolveFirst: (v: typeof mockTranscript) => void;
		const firstPromise = new Promise<typeof mockTranscript>((resolve) => {
			resolveFirst = resolve;
		});

		fetchByUrl.set("https://www.youtube.com/watch?v=dQw4w9WgXcQ", [
			firstPromise,
			{
				title: "Fast",
				lines: [{ text: "fast", offset: 0, duration: 1000 }],
			},
		]);
		const first = command.execute(editor, targetFile);
		await waitForFetches(1);
		const second = command.execute(editor, targetFile);

		await second;
		expect(editor.getValue()).toContain("fast");

		resolveFirst!({
			title: "Slow",
			lines: [{ text: "slow", offset: 0, duration: 1000 }],
		});
		await Promise.all([first, second]);

		expect(editor.getValue()).toContain("fast");
		expect(editor.getValue()).not.toContain("slow");
	});

	it("allows concurrent requests on different files independently", async () => {
		const targetA = makeTargetFile("note-a.md");
		const targetB = makeTargetFile("note-b.md");
		const command = new InsertTranscriptCommand({
			app: makeApp({
				"note-a.md": {
					source: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				},
				"note-b.md": {
					source: "https://www.youtube.com/watch?v=abcdefghijk",
				},
			}),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editorA = makeEditor("# A");
		const editorB = makeEditor("# B");

		let resolveA: (v: typeof mockTranscript) => void;
		const promiseA = new Promise<typeof mockTranscript>((resolve) => {
			resolveA = resolve;
		});

		fetchByUrl.set("https://www.youtube.com/watch?v=dQw4w9WgXcQ", [
			promiseA,
		]);
		fetchByUrl.set("https://www.youtube.com/watch?v=abcdefghijk", [
			{
				title: "B",
				lines: [{ text: "b-only", offset: 0, duration: 1000 }],
			},
		]);
		const callA = command.execute(editorA, targetA);
		const callB = command.execute(editorB, targetB);

		await callB;
		expect(editorA.getValue()).toBe("# A");
		resolveA!({
			title: "A",
			lines: [{ text: "a-only", offset: 0, duration: 1000 }],
		});
		await Promise.all([callA, callB]);

		expect(editorA.getValue()).toContain("a-only");
		expect(editorA.getValue()).not.toContain("b-only");
		expect(editorB.getValue()).toContain("b-only");
		expect(editorB.getValue()).not.toContain("a-only");
	});

	it("aborts write when editor content changed during fetch", async () => {
		const targetFile = makeTargetFile("note-a.md");
		const command = new InsertTranscriptCommand({
			app: makeApp({
				"note-a.md": {
					source: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				},
			}),
			settings: {},
			showNotice: (message) => noticeMessages.push(message),
		});
		const editor = makeEditor("# Note");

		let resolveFetch: (v: typeof mockTranscript) => void;
		const fetchPromise = new Promise<typeof mockTranscript>((resolve) => {
			resolveFetch = resolve;
		});

		fetchByUrl.set("https://www.youtube.com/watch?v=dQw4w9WgXcQ", [
			fetchPromise,
		]);
		const call = command.execute(editor, targetFile);
		await waitForFetches(1);

		// Simulate user editing the note while fetching.
		editor.replaceRange("\nedited", { line: 0, ch: 6 });

		resolveFetch!(mockTranscript);
		await call;

		expect(noticeMessages).toContain(
			"Insert transcript aborted: note changed while fetching.",
		);
		expect(editor.getValue()).not.toContain("<!-- YTranscript:start -->");
	});
});
