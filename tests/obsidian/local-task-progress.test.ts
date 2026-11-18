jest.mock("obsidian", () => ({
	Notice: class MockNotice {
		static instances: MockNotice[] = [];
		messages: unknown[] = [];
		hide = jest.fn();
		constructor(_message: string, _duration: number) {
			MockNotice.instances.push(this);
		}
		setMessage(message: unknown) {
			this.messages.push(message);
			return this;
		}
	},
}));

import { Notice } from "obsidian";

import {
	createLocalTaskProgress,
	createTrackedLocalTaskProgressFactory,
	LocalTaskProgressController,
	LocalTaskStatusTracker,
	type LocalTaskProgressSurface,
	type LocalTaskStatusSurface,
} from "src/obsidian/local-task-progress";

interface FakeNode {
	type: "fragment" | "text" | "button";
	textContent?: string;
	className?: string;
	disabled?: boolean;
	children: FakeNode[];
	click?: () => void;
}

interface MockNoticeInstance {
	messages: FakeNode[];
	hide: jest.Mock;
}

function createSurface() {
	const messages: string[] = [];
	const disabled: boolean[] = [];
	let hides = 0;
	const surface: LocalTaskProgressSurface = {
		setMessage: (message) => messages.push(message),
		setCancelDisabled: (value) => disabled.push(value),
		hide: () => {
			hides += 1;
		},
	};
	return { surface, messages, disabled, hides: () => hides };
}

function createStatusSurface() {
	const messages: string[] = [];
	const visibility: boolean[] = [];
	const surface: LocalTaskStatusSurface = {
		setMessage: (message) => messages.push(message),
		setVisible: (visible) => visibility.push(visible),
	};
	return { surface, messages, visibility };
}

describe("LocalTaskProgressController", () => {
	it("shows only a bounded status and valid rounded percentage", () => {
		const state = createSurface();
		const progress = new LocalTaskProgressController(
			"transcription",
			state.surface,
		);
		progress.update({
			taskId: "secret-task-id",
			status: "processing",
			progress: 42.6,
			progressMessage: "token=secret",
			stepName: "private path",
		});
		expect(state.messages).toEqual([
			"Local transcription: processing (43%).",
		]);
		expect(state.messages[0]).not.toContain("secret");
		expect(state.messages[0]).not.toContain("private");
	});

	it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
		"omits an invalid progress value %p",
		(value) => {
			const state = createSurface();
			const progress = new LocalTaskProgressController(
				"summary",
				state.surface,
			);
			progress.update({
				taskId: "t-1",
				status: "queued",
				progress: value,
			});
			expect(state.messages).toEqual(["DeepSeek summary: queued."]);
		},
	);

	it("turns the cancel action into local cancellation exactly once", () => {
		const state = createSurface();
		const progress = new LocalTaskProgressController(
			"transcription",
			state.surface,
		);
		progress.cancel();
		progress.cancel();
		expect(progress.isCancelled()).toBe(true);
		expect(state.disabled).toEqual([true]);
		expect(state.messages).toEqual([
			"Local transcription: stopping local wait; the backend task may continue.",
		]);
	});

	it("ignores updates after cancellation and hides exactly once", () => {
		const state = createSurface();
		const progress = new LocalTaskProgressController(
			"summary",
			state.surface,
		);
		progress.cancel();
		progress.update({ taskId: "t-1", status: "completed" });
		progress.close();
		progress.close();
		progress.update({ taskId: "t-1", status: "failed" });
		expect(state.messages).toHaveLength(1);
		expect(state.hides()).toBe(1);
	});
});

describe("createLocalTaskProgress", () => {
	const originalDocument = global.document;

	beforeEach(() => {
		(Notice as unknown as { instances: MockNoticeInstance[] }).instances =
			[];
		global.document = {
			createDocumentFragment: () => {
				const fragment: FakeNode = {
					type: "fragment",
					children: [],
				};
				return Object.assign(fragment, {
					append: (...nodes: FakeNode[]) =>
						fragment.children.push(...nodes),
				});
			},
			createTextNode: (text: string) => ({
				type: "text",
				textContent: text,
				children: [],
			}),
			createElement: () => {
				const button: FakeNode = { type: "button", children: [] };
				return Object.assign(button, {
					addEventListener: (_event: string, handler: () => void) => {
						button.click = handler;
					},
				});
			},
		} as unknown as Document;
	});

	afterAll(() => {
		global.document = originalDocument;
	});

	it("renders a persistent cancel button and rewires it after updates", () => {
		const progress = createLocalTaskProgress("transcription");
		const notice = (
			Notice as unknown as { instances: MockNoticeInstance[] }
		).instances[0];
		let fragment = notice.messages[notice.messages.length - 1];
		expect(fragment.children[0].textContent).toBe(
			"Local transcription started…",
		);
		expect(fragment.children[1]).toMatchObject({
			type: "button",
			textContent: "Stop waiting",
			disabled: false,
		});

		progress.update({
			taskId: "t-1",
			status: "processing",
			progress: 12,
		});
		fragment = notice.messages[notice.messages.length - 1];
		expect(fragment.children[0].textContent).toBe(
			"Local transcription: processing (12%).",
		);
		fragment.children[1].click?.();
		expect(progress.isCancelled()).toBe(true);
		fragment = notice.messages[notice.messages.length - 1];
		expect(fragment.children[1].disabled).toBe(true);
		expect(fragment.children[0].textContent).toContain(
			"backend task may continue",
		);

		progress.close();
		expect(notice.hide).toHaveBeenCalledTimes(1);
	});

	it("mirrors bounded progress to a shared status tracker", () => {
		const state = createStatusSurface();
		const tracker = new LocalTaskStatusTracker(state.surface);
		const createProgress = createTrackedLocalTaskProgressFactory(tracker);
		const progress = createProgress("summary");

		expect(state.messages).toEqual(["DeepSeek summary started…"]);
		expect(state.visibility).toEqual([true]);

		progress.update({
			taskId: "secret-task-id",
			status: "processing",
			progress: 54,
			progressMessage: "token=secret",
		});
		expect(state.messages[state.messages.length - 1]).toBe(
			"DeepSeek summary: processing (54%).",
		);
		expect(state.messages.join(" ")).not.toContain("secret");

		progress.close();
		expect(state.visibility).toEqual([true, false]);
	});
});

describe("LocalTaskStatusTracker", () => {
	it("summarizes concurrent tasks without letting an older close hide a newer task", () => {
		const state = createStatusSurface();
		const tracker = new LocalTaskStatusTracker(state.surface);
		const transcription = tracker.open("Local transcription started…");
		const summary = tracker.open("DeepSeek summary started…");

		expect(state.messages).toEqual([
			"Local transcription started…",
			"Video2Knowledge: 2 local tasks running.",
		]);

		transcription.hide();
		expect(state.messages[state.messages.length - 1]).toBe(
			"DeepSeek summary started…",
		);
		expect(state.visibility[state.visibility.length - 1]).toBe(true);

		summary.setMessage("DeepSeek summary: finalizing result.");
		expect(state.messages[state.messages.length - 1]).toBe(
			"DeepSeek summary: finalizing result.",
		);

		summary.hide();
		expect(state.visibility[state.visibility.length - 1]).toBe(false);
	});

	it("ignores updates and duplicate closes from completed task handles", () => {
		const state = createStatusSurface();
		const tracker = new LocalTaskStatusTracker(state.surface);
		const task = tracker.open("Local transcription started…");

		task.hide();
		task.setMessage("must not reappear");
		task.hide();

		expect(state.messages).toEqual(["Local transcription started…"]);
		expect(state.visibility).toEqual([true, false]);
	});
});
