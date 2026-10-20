import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface TemplateProperty {
	name: string;
	value: string;
	type: string;
}

interface WebClipperTemplate {
	schemaVersion: string;
	name: string;
	behavior: string;
	noteContentFormat: string;
	properties: TemplateProperty[];
	triggers: string[];
	noteNameFormat: string;
	path: string;
}

const templatePath = resolve(
	__dirname,
	"../../templates/web-clipper/video2knowledge-youtube.json",
);
const rawTemplate = readFileSync(templatePath, "utf8");
const template = JSON.parse(rawTemplate) as WebClipperTemplate;

describe("Video2Knowledge Web Clipper template", () => {
	it("uses the supported import shape", () => {
		expect(Object.keys(template).sort()).toEqual(
			[
				"schemaVersion",
				"name",
				"behavior",
				"noteContentFormat",
				"properties",
				"triggers",
				"noteNameFormat",
				"path",
			].sort(),
		);
		expect(template.schemaVersion).toBe("0.1.0");
		expect(template.behavior).toBe("create");
		expect(template.path).toBe("");
		expect(template.noteNameFormat).toContain("safe_name");
	});

	it("creates exactly one source property from the clipped URL", () => {
		const sourceProperties = template.properties.filter(
			(property) => property.name === "source",
		);
		expect(sourceProperties).toEqual([
			{ name: "source", value: "{{url}}", type: "text" },
		]);
	});

	it("covers the supported YouTube URL forms", () => {
		expect(template.triggers).toEqual(
			expect.arrayContaining([
				"https://www.youtube.com/watch",
				"https://m.youtube.com/watch",
				"https://youtu.be/",
			]),
		);
	});

	it("leaves transcript ownership to the Obsidian plugin", () => {
		expect(template.noteContentFormat).toContain(
			"Insert YouTube transcript",
		);
		expect(rawTemplate).not.toContain("{{transcript}}");
		expect(rawTemplate).not.toContain("YTranscript:start");
		expect(rawTemplate).not.toContain("YTranscript:end");
		expect(rawTemplate).not.toMatch(/\{\{\s*"/);
	});

	it("does not embed credentials or browser session data", () => {
		expect(rawTemplate).not.toMatch(
			/(api[_ -]?key|access[_ -]?token|authorization|cookie)/i,
		);
	});
});
