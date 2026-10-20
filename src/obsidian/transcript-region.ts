import type { Editor, EditorPosition } from "obsidian";

export const TRANSCRIPT_REGION_START_MARKER = "<!-- YTranscript:start -->";
export const TRANSCRIPT_REGION_END_MARKER = "<!-- YTranscript:end -->";
export const SUMMARY_REGION_START_MARKER = "<!-- YSummary:start -->";
export const SUMMARY_REGION_END_MARKER = "<!-- YSummary:end -->";

interface RegionDefinition {
	label: "Transcript" | "Summary";
	startMarker: string;
	endMarker: string;
}

const TRANSCRIPT_REGION: RegionDefinition = {
	label: "Transcript",
	startMarker: TRANSCRIPT_REGION_START_MARKER,
	endMarker: TRANSCRIPT_REGION_END_MARKER,
};

const SUMMARY_REGION: RegionDefinition = {
	label: "Summary",
	startMarker: SUMMARY_REGION_START_MARKER,
	endMarker: SUMMARY_REGION_END_MARKER,
};

const MANAGED_REGIONS = [TRANSCRIPT_REGION, SUMMARY_REGION];

export type RegionState =
	| { type: "missing" }
	| { type: "valid"; range: TranscriptRegionRange; offsets: MarkerOffsets }
	| { type: "invalid"; reason: string };

interface TranscriptRegionRange {
	from: EditorPosition;
	to: EditorPosition;
}

interface MarkerOffsets {
	start: number;
	end: number;
}

export function getTranscriptRegionState(editor: Editor): RegionState {
	return getRegionState(editor, TRANSCRIPT_REGION);
}

export function getSummaryRegionState(editor: Editor): RegionState {
	return getRegionState(editor, SUMMARY_REGION);
}

function getRegionState(
	editor: Editor,
	definition: RegionDefinition,
): RegionState {
	const text = editor.getValue();
	let offset = 0;
	for (const line of text.split("\n")) {
		if (
			line !== line.trim() &&
			[definition.startMarker, definition.endMarker].includes(
				line.trim(),
			) &&
			getLineContext(text, offset) === "body"
		) {
			return {
				type: "invalid",
				reason:
					definition.label +
					" markers must be exact standalone lines with no surrounding whitespace.",
			};
		}
		offset += line.length + 1;
	}
	const starts = findSafeMarkers(text, definition.startMarker);
	const ends = findSafeMarkers(text, definition.endMarker);

	if (starts.length === 0 && ends.length === 0) {
		return { type: "missing" };
	}

	if (starts.length !== 1 || ends.length !== 1) {
		return {
			type: "invalid",
			reason:
				starts.length === 0
					? definition.label +
						" end marker found without matching start marker."
					: ends.length === 0
						? definition.label +
							" start marker found without matching end marker."
						: "Duplicate or ambiguous " +
							definition.label.toLowerCase() +
							" markers found.",
		};
	}

	const startIndex = starts[0];
	const endIndex = ends[0];

	if (startIndex >= endIndex) {
		return {
			type: "invalid",
			reason: definition.label + " markers are out of order.",
		};
	}

	return {
		type: "valid",
		range: {
			from: offsetToPosition(text, startIndex),
			to: offsetToPosition(text, endIndex + definition.endMarker.length),
		},
		offsets: {
			start: startIndex,
			end: endIndex,
		},
	};
}

export function replaceTranscriptRegion(
	editor: Editor,
	content: string,
	onError?: (reason: string) => void,
): void {
	replaceManagedRegion(editor, content, TRANSCRIPT_REGION, onError);
}

export function replaceSummaryRegion(
	editor: Editor,
	content: string,
	onError?: (reason: string) => void,
): void {
	replaceManagedRegion(editor, content, SUMMARY_REGION, onError);
}

function replaceManagedRegion(
	editor: Editor,
	content: string,
	definition: RegionDefinition,
	onError?: (reason: string) => void,
): void {
	if (contentContainsManagedMarker(content)) {
		onError?.(
			definition.label +
				" content contains reserved marker and cannot be inserted safely.",
		);
		return;
	}

	const transcriptState = getTranscriptRegionState(editor);
	const summaryState = getSummaryRegionState(editor);
	if (transcriptState.type === "invalid") {
		onError?.(transcriptState.reason);
		return;
	}
	if (summaryState.type === "invalid") {
		onError?.(summaryState.reason);
		return;
	}
	if (
		transcriptState.type === "valid" &&
		summaryState.type === "valid" &&
		regionsOverlap(transcriptState, summaryState)
	) {
		onError?.("Transcript and summary regions overlap or are nested.");
		return;
	}

	const state =
		definition === TRANSCRIPT_REGION ? transcriptState : summaryState;
	const trimmed = content.trim();

	if (state.type === "missing") {
		insertNewRegion(
			editor,
			trimmed,
			definition,
			definition === SUMMARY_REGION ? transcriptState : summaryState,
		);
		return;
	}

	const text = editor.getValue();
	const contentFrom = offsetToPosition(
		text,
		state.offsets.start + definition.startMarker.length,
	);
	const contentTo = offsetToPosition(text, state.offsets.end);
	editor.replaceRange("\n" + trimmed + "\n", contentFrom, contentTo);
}

function contentContainsManagedMarker(content: string): boolean {
	return MANAGED_REGIONS.some(
		(region) =>
			content.includes(region.startMarker) ||
			content.includes(region.endMarker),
	);
}

function regionsOverlap(
	first: Extract<RegionState, { type: "valid" }>,
	second: Extract<RegionState, { type: "valid" }>,
): boolean {
	const firstEnd = first.offsets.end + TRANSCRIPT_REGION_END_MARKER.length;
	const secondEnd = second.offsets.end + SUMMARY_REGION_END_MARKER.length;
	return first.offsets.start < secondEnd && second.offsets.start < firstEnd;
}

function insertNewRegion(
	editor: Editor,
	content: string,
	definition: RegionDefinition,
	otherState: RegionState,
): void {
	const text = editor.getValue();
	const regionText =
		definition.startMarker + "\n" + content + "\n" + definition.endMarker;

	if (otherState.type === "valid") {
		const insertOffset =
			definition === SUMMARY_REGION
				? otherState.offsets.end + TRANSCRIPT_REGION_END_MARKER.length
				: otherState.offsets.start;
		const insertPos = offsetToPosition(text, insertOffset);
		const insertion =
			definition === SUMMARY_REGION
				? "\n\n" + regionText
				: regionText + "\n\n";
		editor.replaceRange(insertion, insertPos);
		return;
	}

	const endPos = getLegalEndPosition(editor);
	const prefix = text.length === 0 ? "" : text.endsWith("\n") ? "\n" : "\n\n";
	editor.replaceRange(prefix + regionText + "\n", endPos);
}

function getLegalEndPosition(editor: Editor): EditorPosition {
	const lastLine = editor.lastLine();
	const lastLineText = editor.getLine(lastLine);
	return { line: lastLine, ch: lastLineText.length };
}

function findSafeMarkers(text: string, search: string): number[] {
	const indices: number[] = [];
	let lineStart = 0;
	for (const line of text.split("\n")) {
		// Marker must be the entire line at column 0. Indented markers are treated as
		// pseudo-markers (e.g. inside indented code blocks) and fail closed.
		if (line === search) {
			const context = getLineContext(text, lineStart);
			if (context === "body") {
				indices.push(lineStart);
			}
		}
		lineStart += line.length + 1;
	}
	return indices;
}

type LineContext = "frontmatter" | "codeFence" | "inlineCode" | "body";

function getLineContext(text: string, lineStartOffset: number): LineContext {
	const before = text.slice(0, lineStartOffset);
	const beforeLines = before.split("\n");

	let inFrontmatter = false;
	let openFence: FenceInfo | null = null;
	for (let i = 0; i < beforeLines.length; i++) {
		const line = beforeLines[i];
		if (i === 0 && line.trim() === "---") {
			inFrontmatter = true;
			continue;
		}
		if (inFrontmatter) {
			if (line.trim() === "---") {
				inFrontmatter = false;
			}
			continue;
		}
		if (openFence === null) {
			openFence = getOpeningFence(line);
		} else if (isClosingFence(line, openFence)) {
			openFence = null;
		}
	}
	if (inFrontmatter) {
		return "frontmatter";
	}
	if (openFence !== null) {
		return "codeFence";
	}

	// Inline code: the candidate line itself contains backticks that wrap the marker.
	// This is a conservative single-line check.
	const candidateLine = text.slice(lineStartOffset).split("\n")[0] ?? "";
	if (
		/`[^`]*?Y(?:Transcript|Summary):(?:start|end)[^`]*?`/.test(
			candidateLine,
		)
	) {
		return "inlineCode";
	}

	return "body";
}

interface FenceInfo {
	char: "`" | "~";
	length: number;
}

// Opening fence: optional leading whitespace, then three or more identical
// backtick or tilde characters. An info string may follow (e.g. ```markdown).
function getOpeningFence(line: string): FenceInfo | null {
	const match = line.match(/^\s*(`{3,}|~{3,})/);
	if (!match) return null;
	const fence = match[1];
	const char = fence.charAt(0);
	if (char === "`" || char === "~") {
		return { char, length: fence.length };
	}
	return null;
}

// Closing fence: optional leading whitespace, the same fence character repeated
// at least as many times as the opening fence, and nothing but spaces or tabs
// after it. Pseudo-closing lines such as ```js or ```not-a-close therefore do
// not terminate the block, and a different fence character never closes it.
function isClosingFence(line: string, opening: FenceInfo): boolean {
	const match = line.match(/^\s*(`+|~+)[ \t]*$/);
	if (!match) return false;
	const fence = match[1];
	const char = fence.charAt(0);
	return char === opening.char && fence.length >= opening.length;
}

function offsetToPosition(text: string, offset: number): EditorPosition {
	let line = 0;
	let ch = 0;
	for (let i = 0; i < offset && i < text.length; i++) {
		if (text[i] === "\n") {
			line++;
			ch = 0;
		} else {
			ch++;
		}
	}
	return { line, ch };
}
