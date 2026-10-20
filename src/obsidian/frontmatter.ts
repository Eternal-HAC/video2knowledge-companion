import type { App, TFile } from "obsidian";

const FRONTMATTER_SOURCE_KEYS = ["source", "url"];

export function getSourceUrlFromFrontmatter(
	app: App,
	file: TFile | null,
): string | null {
	if (!file) return null;

	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter;
	if (!frontmatter || typeof frontmatter !== "object") return null;

	for (const key of FRONTMATTER_SOURCE_KEYS) {
		const value = frontmatter[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}

	return null;
}

export function getYouTubeUrlFromFrontmatter(
	app: App,
	file: TFile | null,
): string | null {
	return getSourceUrlFromFrontmatter(app, file);
}
