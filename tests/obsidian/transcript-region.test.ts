import type { Editor, EditorPosition } from "obsidian";

import {
	getSummaryRegionState,
	getTranscriptRegionState,
	replaceSummaryRegion,
	replaceTranscriptRegion,
} from "src/obsidian/transcript-region";

interface MockEditor extends Editor {
	text: string;
	replacements: Array<{
		from: EditorPosition;
		to: EditorPosition | undefined;
		text: string;
	}>;
}

function positionToOffset(text: string, pos: EditorPosition): number {
	const lines = text.split("\n");
	if (pos.line < 0 || pos.line >= lines.length) {
		throw new Error(
			`Invalid position line ${pos.line} for text with ${lines.length} lines`,
		);
	}
	let offset = 0;
	for (let i = 0; i < pos.line; i++) {
		offset += lines[i].length + 1;
	}
	offset += Math.min(pos.ch, lines[pos.line].length);
	return offset;
}

function makeEditor(initialText = ""): MockEditor {
	const editor: MockEditor = {
		text: initialText,
		replacements: [],
		getValue: () => editor.text,
		lineCount: () => editor.text.split("\n").length,
		lastLine: () => Math.max(0, editor.text.split("\n").length - 1),
		getLine: (line: number) => editor.text.split("\n")[line] ?? "",
		replaceRange: (
			replacement: string,
			from: EditorPosition,
			to?: EditorPosition,
		) => {
			editor.replacements.push({ text: replacement, from, to });
			const startOffset = positionToOffset(editor.text, from);
			const endOffset = to
				? positionToOffset(editor.text, to)
				: startOffset;
			editor.text =
				editor.text.slice(0, startOffset) +
				replacement +
				editor.text.slice(endOffset);
		},
	} as unknown as MockEditor;
	return editor;
}

describe("getTranscriptRegionState", () => {
	it("reports missing when no markers exist", () => {
		const editor = makeEditor("some content");
		expect(getTranscriptRegionState(editor)).toEqual({ type: "missing" });
	});

	it("reports valid when exactly one ordered pair exists", () => {
		const editor = makeEditor(
			"# Title\n\n<!-- YTranscript:start -->\ncontent\n<!-- YTranscript:end -->\nfooter",
		);
		const state = getTranscriptRegionState(editor);
		expect(state.type).toBe("valid");
	});

	it("reports invalid when only start marker exists", () => {
		const editor = makeEditor("<!-- YTranscript:start -->\ntext\n");
		expect(getTranscriptRegionState(editor).type).toBe("invalid");
	});

	it("reports invalid when only end marker exists", () => {
		const editor = makeEditor("text\n<!-- YTranscript:end -->\n");
		expect(getTranscriptRegionState(editor).type).toBe("invalid");
	});

	it("reports invalid when markers are reversed", () => {
		const editor = makeEditor(
			"<!-- YTranscript:end -->\ntext\n<!-- YTranscript:start -->\n",
		);
		expect(getTranscriptRegionState(editor).type).toBe("invalid");
	});

	it("reports invalid when start marker is duplicated", () => {
		const editor = makeEditor(
			"<!-- YTranscript:start -->\na\n<!-- YTranscript:end -->\n\n<!-- YTranscript:start -->\nb\n<!-- YTranscript:end -->\n",
		);
		expect(getTranscriptRegionState(editor).type).toBe("invalid");
	});

	it("reports invalid when end marker is duplicated", () => {
		const editor = makeEditor(
			"<!-- YTranscript:start -->\na\n<!-- YTranscript:end -->\n\n<!-- YTranscript:end -->\n",
		);
		expect(getTranscriptRegionState(editor).type).toBe("invalid");
	});
});

describe("replaceTranscriptRegion", () => {
	it.each([
		"---\nexample: |\n<!-- YTranscript:start -->\nfrontmatter example\n<!-- YTranscript:end -->\n---\n",
		"```markdown\n<!-- YTranscript:start -->\nfenced example\n<!-- YTranscript:end -->\n```\n",
		"Example: `<!-- YTranscript:start -->` and `<!-- YTranscript:end -->`\n",
	])("preserves pseudo markers before the validated region: %s", (prefix) => {
		const original =
			prefix +
			"# User note\n\n<!-- YTranscript:start -->\nold\n<!-- YTranscript:end -->\nfooter";
		const editor = makeEditor(original);
		replaceTranscriptRegion(editor, "new");
		expect(editor.text).toBe(
			prefix +
				"# User note\n\n<!-- YTranscript:start -->\nnew\n<!-- YTranscript:end -->\nfooter",
		);
	});

	it.each([" ", "    ", "\t"])(
		"rejects indented markers with prefix %s",
		(indent) => {
			const original =
				"# Note\n" +
				indent +
				"<!-- YTranscript:start -->\nold\n" +
				indent +
				"<!-- YTranscript:end -->";
			const editor = makeEditor(original);
			const errors: string[] = [];
			replaceTranscriptRegion(editor, "new", (error) =>
				errors.push(error),
			);
			expect(editor.text).toBe(original);
			expect(editor.replacements).toHaveLength(0);
			expect(errors).toHaveLength(1);
		},
	);

	it.each([
		"<!-- YTranscript:start --> \nold\n<!-- YTranscript:end --> \n",
		"<!-- YTranscript:start -->\t\nold\n<!-- YTranscript:end -->\t\n",
	])(
		"rejects trailing-whitespace markers instead of appending a duplicate region: %s",
		(original) => {
			const editor = makeEditor(original);
			const errors: string[] = [];
			replaceTranscriptRegion(editor, "new", (error) =>
				errors.push(error),
			);
			expect(editor.text).toBe(original);
			expect(editor.replacements).toHaveLength(0);
			expect(errors).toHaveLength(1);
		},
	);

	it("inserts new region at end of empty document", () => {
		const editor = makeEditor("");
		replaceTranscriptRegion(editor, "line one\nline two");
		expect(editor.text).toBe(
			"<!-- YTranscript:start -->\nline one\nline two\n<!-- YTranscript:end -->\n",
		);
	});

	it("inserts new region after existing content", () => {
		const editor = makeEditor("# Title");
		replaceTranscriptRegion(editor, "content");
		expect(editor.text).toBe(
			"# Title\n\n<!-- YTranscript:start -->\ncontent\n<!-- YTranscript:end -->\n",
		);
	});

	it("replaces existing region content without touching outside", () => {
		const original =
			"# Title\n\n<!-- YTranscript:start -->\nold\n<!-- YTranscript:end -->\nfooter";
		const editor = makeEditor(original);
		replaceTranscriptRegion(editor, "new");
		expect(editor.text).toBe(
			"# Title\n\n<!-- YTranscript:start -->\nnew\n<!-- YTranscript:end -->\nfooter",
		);
	});

	it("is idempotent when called twice", () => {
		const editor = makeEditor("");
		replaceTranscriptRegion(editor, "first");
		replaceTranscriptRegion(editor, "second");
		expect(editor.text).toBe(
			"<!-- YTranscript:start -->\nsecond\n<!-- YTranscript:end -->\n",
		);
	});

	it("leaves body unchanged when only start marker exists", () => {
		const original = "# Title\n\n<!-- YTranscript:start -->\nold";
		const editor = makeEditor(original);
		const errors: string[] = [];
		replaceTranscriptRegion(editor, "new", (reason) => errors.push(reason));
		expect(editor.text).toBe(original);
		expect(errors.length).toBeGreaterThan(0);
	});

	it("leaves body unchanged when only end marker exists", () => {
		const original = "# Title\n\nold\n<!-- YTranscript:end -->";
		const editor = makeEditor(original);
		const errors: string[] = [];
		replaceTranscriptRegion(editor, "new", (reason) => errors.push(reason));
		expect(editor.text).toBe(original);
		expect(errors.length).toBeGreaterThan(0);
	});

	it("leaves body unchanged when markers are reversed", () => {
		const original =
			"<!-- YTranscript:end -->\nold\n<!-- YTranscript:start -->";
		const editor = makeEditor(original);
		const errors: string[] = [];
		replaceTranscriptRegion(editor, "new", (reason) => errors.push(reason));
		expect(editor.text).toBe(original);
		expect(errors.length).toBeGreaterThan(0);
	});

	it("leaves body unchanged when start marker is duplicated", () => {
		const original =
			"<!-- YTranscript:start -->\na\n<!-- YTranscript:end -->\n\n<!-- YTranscript:start -->\nb\n<!-- YTranscript:end -->\n";
		const editor = makeEditor(original);
		const errors: string[] = [];
		replaceTranscriptRegion(editor, "new", (reason) => errors.push(reason));
		expect(editor.text).toBe(original);
		expect(errors.length).toBeGreaterThan(0);
	});

	it("leaves body unchanged when end marker is duplicated", () => {
		const original =
			"<!-- YTranscript:start -->\na\n<!-- YTranscript:end -->\n\n<!-- YTranscript:end -->\n";
		const editor = makeEditor(original);
		const errors: string[] = [];
		replaceTranscriptRegion(editor, "new", (reason) => errors.push(reason));
		expect(editor.text).toBe(original);
		expect(errors.length).toBeGreaterThan(0);
	});

	it("leaves body unchanged when content contains start marker", () => {
		const original = "# Title";
		const editor = makeEditor(original);
		const errors: string[] = [];
		replaceTranscriptRegion(
			editor,
			"malicious <!-- YTranscript:start -->",
			(reason) => errors.push(reason),
		);
		expect(editor.text).toBe(original);
		expect(errors.length).toBeGreaterThan(0);
	});

	it("leaves body unchanged when content contains end marker", () => {
		const original = "# Title";
		const editor = makeEditor(original);
		const errors: string[] = [];
		replaceTranscriptRegion(
			editor,
			"malicious <!-- YTranscript:end -->",
			(reason) => errors.push(reason),
		);
		expect(editor.text).toBe(original);
		expect(errors.length).toBeGreaterThan(0);
	});

	it("keeps frontmatter and body byte-identical across repeated runs", () => {
		const frontmatterAndBody =
			"---\nsource: https://youtube.com/watch?v=dQw4w9WgXcQ\n---\n\n# Title\n\nparagraph\n";
		const editor = makeEditor(frontmatterAndBody);
		replaceTranscriptRegion(editor, "first");
		replaceTranscriptRegion(editor, "second");
		expect(editor.text).toBe(
			frontmatterAndBody +
				"\n<!-- YTranscript:start -->\nsecond\n<!-- YTranscript:end -->\n",
		);
	});

	describe("marker context safety", () => {
		it("ignores markers inside YAML frontmatter", () => {
			const editor = makeEditor(
				"---\nsource: https://youtube.com/watch?v=dQw4w9WgXcQ\n<!-- YTranscript:start -->\n---\n\n# Note",
			);
			expect(getTranscriptRegionState(editor).type).toBe("missing");
		});

		it("ignores markers inside fenced code blocks", () => {
			const editor = makeEditor(
				"# Note\n\n```\n<!-- YTranscript:start -->\n```\n",
			);
			expect(getTranscriptRegionState(editor).type).toBe("missing");
		});

		it("ignores markers inside inline code", () => {
			const editor = makeEditor(
				"# Note\n\nUse `<!-- YTranscript:start -->` to mark region.\n",
			);
			expect(getTranscriptRegionState(editor).type).toBe("missing");
		});

		it("recognizes markers immediately after a closed frontmatter", () => {
			const editor = makeEditor(
				"---\nsource: https://youtube.com/watch?v=dQw4w9WgXcQ\n---\n\n<!-- YTranscript:start -->\ncontent\n<!-- YTranscript:end -->\n",
			);
			expect(getTranscriptRegionState(editor).type).toBe("valid");
		});
	});

	describe("fenced code block boundary safety", () => {
		it.each(["```not-a-close", "```js", "``` text", "~~~"])(
			"does not let %s close an open backtick fence",
			(pseudoClose) => {
				const editor = makeEditor(
					"```\nexample\n" +
						pseudoClose +
						"\n<!-- YTranscript:start -->\n<!-- YTranscript:end -->\n```\n",
				);
				expect(getTranscriptRegionState(editor).type).toBe("missing");
			},
		);

		it("ignores markers after a pseudo-closing line until the real fence closes", () => {
			const editor = makeEditor(
				"# Note\n\n```markdown\nexample\n```not-a-closing-fence\n<!-- YTranscript:start -->\nuser example\n<!-- YTranscript:end -->\n```\n",
			);
			expect(getTranscriptRegionState(editor).type).toBe("missing");
		});

		it("does not let a shorter backtick run close a longer backtick fence", () => {
			const editor = makeEditor(
				"````\n```\n<!-- YTranscript:start -->\n<!-- YTranscript:end -->\n````\n",
			);
			expect(getTranscriptRegionState(editor).type).toBe("missing");
		});

		it("recognizes real markers after a four-backtick fence closes", () => {
			const editor = makeEditor(
				"````\n```\n<!-- YTranscript:start -->\n<!-- YTranscript:end -->\n````\n\n<!-- YTranscript:start -->\nbody\n<!-- YTranscript:end -->\n",
			);
			expect(getTranscriptRegionState(editor).type).toBe("valid");
		});

		it("does not let ~~~text close a tilde fence", () => {
			const editor = makeEditor(
				"~~~\n~~~text\n<!-- YTranscript:start -->\n<!-- YTranscript:end -->\n~~~\n",
			);
			expect(getTranscriptRegionState(editor).type).toBe("missing");
		});

		it("recognizes real markers after a tilde fence closes", () => {
			const editor = makeEditor(
				"~~~\nexample\n~~~\n<!-- YTranscript:start -->\nbody\n<!-- YTranscript:end -->\n",
			);
			expect(getTranscriptRegionState(editor).type).toBe("valid");
		});

		it.each([
			["```", "~~~"],
			["~~~", "```"],
		])("does not let a %s line close a %s fence", (opening, otherFence) => {
			const editor = makeEditor(
				opening +
					"\nexample\n" +
					otherFence +
					"\n<!-- YTranscript:start -->\n<!-- YTranscript:end -->\n" +
					opening +
					"\n",
			);
			expect(getTranscriptRegionState(editor).type).toBe("missing");
		});

		it("treats markers as code when a fence is never legally closed before EOF", () => {
			const editor = makeEditor(
				"```\nexample\n```js\n<!-- YTranscript:start -->\n<!-- YTranscript:end -->\n",
			);
			expect(getTranscriptRegionState(editor).type).toBe("missing");
		});

		it("recognizes real markers immediately after a legally closed fence", () => {
			const editor = makeEditor(
				"```\nexample\n```\n<!-- YTranscript:start -->\ncontent\n<!-- YTranscript:end -->\n",
			);
			expect(getTranscriptRegionState(editor).type).toBe("valid");
		});

		it("keeps a fenced example byte-identical while replacing only the real region", () => {
			const fencedExample =
				"# Note\n\n```markdown\nexample\n```not-a-closing-fence\n<!-- YTranscript:start -->\nuser example\n<!-- YTranscript:end -->\n```\n";
			const original =
				fencedExample +
				"\n<!-- YTranscript:start -->\nold\n<!-- YTranscript:end -->\nfooter";
			const editor = makeEditor(original);
			replaceTranscriptRegion(editor, "new");
			expect(editor.text).toBe(
				fencedExample +
					"\n<!-- YTranscript:start -->\nnew\n<!-- YTranscript:end -->\nfooter",
			);
			expect(editor.replacements).toHaveLength(1);
			expect(editor.text.startsWith(fencedExample)).toBe(true);

			replaceTranscriptRegion(editor, "second");
			expect(editor.text).toBe(
				fencedExample +
					"\n<!-- YTranscript:start -->\nsecond\n<!-- YTranscript:end -->\nfooter",
			);
		});

		it("fails closed for CRLF marker lines instead of appending a second region", () => {
			const original =
				"<!-- YTranscript:start -->\r\nold\r\n<!-- YTranscript:end -->\r\n";
			const editor = makeEditor(original);
			expect(getTranscriptRegionState(editor).type).toBe("invalid");
			const errors: string[] = [];
			replaceTranscriptRegion(editor, "new", (reason) =>
				errors.push(reason),
			);
			expect(editor.text).toBe(original);
			expect(editor.replacements).toHaveLength(0);
			expect(errors).toHaveLength(1);
		});
	});
});

describe("summary controlled region", () => {
	it("appends a summary when no transcript region exists", () => {
		const editor = makeEditor("# Note\n\nbody");
		replaceSummaryRegion(editor, "# Summary\n\nresult");
		expect(editor.text).toBe(
			"# Note\n\nbody\n\n<!-- YSummary:start -->\n# Summary\n\nresult\n<!-- YSummary:end -->\n",
		);
		expect(getSummaryRegionState(editor).type).toBe("valid");
	});

	it("inserts the summary immediately after an existing transcript region", () => {
		const editor = makeEditor(
			"# Note\n\n<!-- YTranscript:start -->\nraw\n<!-- YTranscript:end -->\n\nCANARY",
		);
		replaceSummaryRegion(editor, "summary");
		expect(editor.text).toBe(
			"# Note\n\n<!-- YTranscript:start -->\nraw\n<!-- YTranscript:end -->\n\n<!-- YSummary:start -->\nsummary\n<!-- YSummary:end -->\n\nCANARY",
		);
	});

	it("replaces only summary content and preserves transcript and body", () => {
		const editor = makeEditor(
			"BEFORE\n\n<!-- YTranscript:start -->\nraw\n<!-- YTranscript:end -->\n\n<!-- YSummary:start -->\nold\n<!-- YSummary:end -->\n\nAFTER",
		);
		replaceSummaryRegion(editor, "new");
		expect(editor.text).toBe(
			"BEFORE\n\n<!-- YTranscript:start -->\nraw\n<!-- YTranscript:end -->\n\n<!-- YSummary:start -->\nnew\n<!-- YSummary:end -->\n\nAFTER",
		);
	});

	it("inserts a missing transcript before an existing summary", () => {
		const editor = makeEditor(
			"# Note\n\n<!-- YSummary:start -->\nsummary\n<!-- YSummary:end -->\n",
		);
		replaceTranscriptRegion(editor, "raw");
		expect(editor.text).toBe(
			"# Note\n\n<!-- YTranscript:start -->\nraw\n<!-- YTranscript:end -->\n\n<!-- YSummary:start -->\nsummary\n<!-- YSummary:end -->\n",
		);
	});

	it.each([
		"<!-- YSummary:start -->\nsummary",
		"summary\n<!-- YSummary:end -->",
		"<!-- YSummary:end -->\nsummary\n<!-- YSummary:start -->",
		"<!-- YSummary:start -->\na\n<!-- YSummary:end -->\n<!-- YSummary:start -->\nb\n<!-- YSummary:end -->",
	])("fails closed for invalid summary markers: %s", (original) => {
		const editor = makeEditor(original);
		const errors: string[] = [];
		replaceSummaryRegion(editor, "new", (reason) => errors.push(reason));
		expect(editor.text).toBe(original);
		expect(editor.replacements).toHaveLength(0);
		expect(errors).toHaveLength(1);
	});

	it("rejects either marker family in generated summary content", () => {
		for (const marker of [
			"<!-- YSummary:start -->",
			"<!-- YSummary:end -->",
			"<!-- YTranscript:start -->",
			"<!-- YTranscript:end -->",
		]) {
			const editor = makeEditor("# Note");
			const errors: string[] = [];
			replaceSummaryRegion(editor, "unsafe " + marker, (reason) =>
				errors.push(reason),
			);
			expect(editor.text).toBe("# Note");
			expect(errors).toHaveLength(1);
		}
	});

	it("rejects overlapping managed regions without changing the note", () => {
		const original =
			"<!-- YTranscript:start -->\nraw\n<!-- YSummary:start -->\nsummary\n<!-- YTranscript:end -->\n<!-- YSummary:end -->";
		const editor = makeEditor(original);
		const errors: string[] = [];
		replaceSummaryRegion(editor, "new", (reason) => errors.push(reason));
		expect(editor.text).toBe(original);
		expect(errors).toEqual([
			"Transcript and summary regions overlap or are nested.",
		]);
	});

	it("ignores summary examples in frontmatter, fences, and inline code", () => {
		const editor = makeEditor(
			"---\nexample: <!-- YSummary:start -->\n---\n\n```markdown\n<!-- YSummary:start -->\n<!-- YSummary:end -->\n```\n\nUse `<!-- YSummary:start -->` in docs.",
		);
		expect(getSummaryRegionState(editor)).toEqual({ type: "missing" });
	});
});
