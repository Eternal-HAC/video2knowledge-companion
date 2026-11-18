import { Notice } from "obsidian";

import type { TranscriptionTask } from "src/video2knowledge/types";

export type LocalTaskKind = "transcription" | "summary";

export interface LocalTaskProgress {
	isCancelled(): boolean;
	update(task: TranscriptionTask): void;
	close(): void;
}

export type LocalTaskProgressFactory = (
	kind: LocalTaskKind,
) => LocalTaskProgress;

export interface LocalTaskProgressSurface {
	setMessage(message: string): void;
	setCancelDisabled(disabled: boolean): void;
	hide(): void;
}

export interface LocalTaskStatusSurface {
	setMessage(message: string): void;
	setVisible(visible: boolean): void;
}

const LABELS: Record<LocalTaskKind, string> = {
	transcription: "Local transcription",
	summary: "DeepSeek summary",
};

const STATUS_LABELS: Record<TranscriptionTask["status"], string> = {
	pending: "pending",
	queued: "queued",
	processing: "processing",
	cancelling: "backend cancellation in progress",
	completed: "finalizing result",
	failed: "task failed",
	cancelled: "task cancelled",
};

export class LocalTaskStatusTracker {
	private readonly active = new Map<number, string>();
	private nextId = 0;
	private visible = false;

	constructor(private readonly surface: LocalTaskStatusSurface) {}

	open(initialMessage: string): LocalTaskProgressSurface {
		const id = this.nextId++;
		let closed = false;
		this.active.set(id, initialMessage);
		this.render();

		return {
			setMessage: (message) => {
				if (closed) return;
				this.active.set(id, message);
				this.render();
			},
			setCancelDisabled: () => {},
			hide: () => {
				if (closed) return;
				closed = true;
				this.active.delete(id);
				this.render();
			},
		};
	}

	private render(): void {
		if (this.active.size === 0) {
			if (this.visible) {
				this.visible = false;
				this.surface.setVisible(false);
			}
			return;
		}
		const message =
			this.active.size === 1
				? this.active.values().next().value
				: `Video2Knowledge: ${this.active.size} local tasks running.`;
		this.surface.setMessage(message ?? "Video2Knowledge task running.");
		if (!this.visible) {
			this.visible = true;
			this.surface.setVisible(true);
		}
	}
}

export class LocalTaskProgressController implements LocalTaskProgress {
	private cancelled = false;
	private closed = false;

	constructor(
		private readonly kind: LocalTaskKind,
		private readonly surface: LocalTaskProgressSurface,
	) {}

	cancel(): void {
		if (this.closed || this.cancelled) return;
		this.cancelled = true;
		this.surface.setCancelDisabled(true);
		this.surface.setMessage(
			`${LABELS[this.kind]}: stopping local wait; the backend task may continue.`,
		);
	}

	isCancelled(): boolean {
		return this.cancelled;
	}

	update(task: TranscriptionTask): void {
		if (this.closed || this.cancelled) return;
		const percent = formatProgress(task.progress);
		this.surface.setMessage(
			`${LABELS[this.kind]}: ${STATUS_LABELS[task.status]}${percent}.`,
		);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.surface.hide();
	}
}

export function createLocalTaskProgress(
	kind: LocalTaskKind,
	mirror?: LocalTaskProgressSurface,
): LocalTaskProgress {
	const notice = new Notice("", 0);
	let message = `${LABELS[kind]} started…`;
	let cancelDisabled = false;
	const render = () => {
		const fragment = document.createDocumentFragment();
		fragment.append(document.createTextNode(message));
		const button = document.createElement("button");
		button.className = "video2knowledge-task-progress__cancel";
		button.textContent = "Stop waiting";
		button.disabled = cancelDisabled;
		button.addEventListener("click", () => controller.cancel());
		fragment.append(button);
		notice.setMessage(fragment);
	};
	const controller = new LocalTaskProgressController(kind, {
		setMessage: (nextMessage) => {
			message = nextMessage;
			render();
			mirror?.setMessage(nextMessage);
		},
		setCancelDisabled: (disabled) => {
			cancelDisabled = disabled;
			render();
			mirror?.setCancelDisabled(disabled);
		},
		hide: () => {
			notice.hide();
			mirror?.hide();
		},
	});
	render();
	return controller;
}

export function createTrackedLocalTaskProgressFactory(
	tracker: LocalTaskStatusTracker,
): LocalTaskProgressFactory {
	return (kind) =>
		createLocalTaskProgress(kind, tracker.open(`${LABELS[kind]} started…`));
}

function formatProgress(progress: number | undefined): string {
	if (
		typeof progress !== "number" ||
		!Number.isFinite(progress) ||
		progress < 0 ||
		progress > 100
	) {
		return "";
	}
	return ` (${Math.round(progress)}%)`;
}
