import type { App, TFile } from "obsidian";

import {
	getSourceUrlFromFrontmatter,
	getYouTubeUrlFromFrontmatter,
} from "src/obsidian/frontmatter";

function makeApp(frontmatter: Record<string, unknown> | undefined): App {
	return {
		metadataCache: {
			getFileCache: () => (frontmatter ? { frontmatter } : undefined),
		},
	} as unknown as App;
}

function makeFile(): TFile {
	return {} as TFile;
}

describe("getYouTubeUrlFromFrontmatter", () => {
	it("returns source field when present", () => {
		const app = makeApp({
			source: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		});
		const result = getYouTubeUrlFromFrontmatter(app, makeFile());
		expect(result).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
	});

	it("returns url field when source is missing", () => {
		const app = makeApp({
			url: "https://youtu.be/dQw4w9WgXcQ",
		});
		const result = getYouTubeUrlFromFrontmatter(app, makeFile());
		expect(result).toBe("https://youtu.be/dQw4w9WgXcQ");
	});

	it("prefers source over url", () => {
		const app = makeApp({
			source: "https://www.youtube.com/watch?v=sourceID",
			url: "https://www.youtube.com/watch?v=urlID",
		});
		const result = getYouTubeUrlFromFrontmatter(app, makeFile());
		expect(result).toBe("https://www.youtube.com/watch?v=sourceID");
	});

	it("returns null when file is null", () => {
		const app = makeApp({ source: "https://youtube.com/watch?v=x" });
		const result = getYouTubeUrlFromFrontmatter(app, null);
		expect(result).toBeNull();
	});

	it("returns null when frontmatter is missing", () => {
		const app = makeApp(undefined);
		const result = getYouTubeUrlFromFrontmatter(app, makeFile());
		expect(result).toBeNull();
	});

	it("returns null when no source/url keys exist", () => {
		const app = makeApp({ title: "My note" });
		const result = getYouTubeUrlFromFrontmatter(app, makeFile());
		expect(result).toBeNull();
	});

	it("ignores non-string values", () => {
		const app = makeApp({ source: 123, url: true });
		const result = getYouTubeUrlFromFrontmatter(app, makeFile());
		expect(result).toBeNull();
	});

	it("trims whitespace", () => {
		const app = makeApp({
			source: "  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ",
		});
		const result = getYouTubeUrlFromFrontmatter(app, makeFile());
		expect(result).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
	});

	it("returns null for empty string", () => {
		const app = makeApp({ source: "   " });
		const result = getYouTubeUrlFromFrontmatter(app, makeFile());
		expect(result).toBeNull();
	});
});

describe("getSourceUrlFromFrontmatter", () => {
	it("reads source before url and trims it", () => {
		const app = makeApp({
			source: "  https://www.youtube.com/watch?v=sourceID  ",
			url: "https://youtu.be/urlID",
		});
		expect(getSourceUrlFromFrontmatter(app, makeFile())).toBe(
			"https://www.youtube.com/watch?v=sourceID",
		);
	});

	it("falls back to url when source is not a usable string", () => {
		const app = makeApp({ source: 7, url: "https://youtu.be/urlID" });
		expect(getSourceUrlFromFrontmatter(app, makeFile())).toBe(
			"https://youtu.be/urlID",
		);
	});

	it("returns null when the file is null or frontmatter is missing", () => {
		expect(
			getSourceUrlFromFrontmatter(makeApp({ source: "x" }), null),
		).toBeNull();
		expect(
			getSourceUrlFromFrontmatter(makeApp(undefined), makeFile()),
		).toBeNull();
	});

	it("keeps the compatibility wrapper in sync with the new function", () => {
		const cases: Array<Record<string, unknown> | undefined> = [
			{ source: "https://youtu.be/a" },
			{ url: "https://youtu.be/b" },
			{ source: "  ", url: "https://youtu.be/c" },
			{ title: "nope" },
			undefined,
		];
		for (const frontmatter of cases) {
			const app = makeApp(frontmatter);
			expect(getYouTubeUrlFromFrontmatter(app, makeFile())).toBe(
				getSourceUrlFromFrontmatter(app, makeFile()),
			);
		}
	});
});
