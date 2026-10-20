import { App, ButtonComponent, Modal, Setting } from "obsidian";

import type { BilibiliPagesPreview } from "src/video2knowledge/types";

export class BilibiliPagesModal extends Modal {
	private readonly preview: BilibiliPagesPreview;
	private readonly selected: Set<number>;
	private resolve: ((value: number[] | null) => void) | null = null;
	private settled = false;

	constructor(
		app: App,
		preview: BilibiliPagesPreview,
		defaultPages: number[],
	) {
		super(app);
		this.preview = preview;
		this.selected = new Set(defaultPages);
	}

	onOpen(): void {
		this.titleEl.setText("Select Bilibili parts");
		this.contentEl.createEl("p", {
			text:
				this.preview.title ||
				this.preview.totalPages + " available parts",
		});

		let submitButton: ButtonComponent | null = null;
		const refreshSubmit = () =>
			submitButton?.setDisabled(this.selected.size === 0);

		for (const page of this.preview.pages) {
			new Setting(this.contentEl)
				.setName("P" + page.page + " · " + (page.part || "Untitled"))
				.setDesc(formatDuration(page.duration))
				.addToggle((toggle) =>
					toggle
						.setValue(this.selected.has(page.page))
						.onChange((value) => {
							if (value) this.selected.add(page.page);
							else this.selected.delete(page.page);
							refreshSubmit();
						}),
				);
		}

		const buttons = this.contentEl.createDiv("modal-button-container");
		new ButtonComponent(buttons)
			.setButtonText("Cancel")
			.onClick(() => this.finish(null));
		submitButton = new ButtonComponent(buttons)
			.setButtonText("Transcribe selected parts")
			.setCta()
			.onClick(() => {
				const selected = this.preview.pages
					.filter((page) => this.selected.has(page.page))
					.map((page) => page.page);
				if (selected.length > 0) this.finish(selected);
			});
		refreshSubmit();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.settled) this.finish(null, false);
	}

	openAndGetValue(): Promise<number[] | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	private finish(value: number[] | null, close = true): void {
		if (this.settled) return;
		this.settled = true;
		this.resolve?.(value);
		if (close) this.close();
	}
}

function formatDuration(durationSeconds: number): string {
	const totalSeconds = Math.max(0, Math.round(durationSeconds));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return minutes + ":" + seconds.toString().padStart(2, "0");
}
