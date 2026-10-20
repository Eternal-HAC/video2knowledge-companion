import {
	classifySupportedVideoUrl,
	extractSupportedVideoUrlFromText,
	getBilibiliPageFromUrl,
	isValidBilibiliUrl,
} from "src/video2knowledge/video-url";

describe("video2knowledge/video-url", () => {
	it.each([
		"https://www.bilibili.com/video/BV1DKbxzjEz9",
		"https://m.bilibili.com/video/BV1DKbxzjEz9?p=2",
		"http://bilibili.com/video/av170001",
		"https://b23.tv/abc123",
	])("accepts supported Bilibili URL %s", (url) => {
		expect(isValidBilibiliUrl(url)).toBe(true);
		expect(classifySupportedVideoUrl(url)).toBe("bilibili");
	});

	it.each([
		"https://example.com/video/BV1DKbxzjEz9",
		"https://evilbilibili.com/video/BV1DKbxzjEz9",
		"https://www.bilibili.com/read/BV1DKbxzjEz9",
		"https://www.bilibili.com/video/not-an-id",
		"https://user:pass@b23.tv/abc123",
		"https://b23.tv/",
		"ftp://www.bilibili.com/video/BV1DKbxzjEz9",
		"BV1DKbxzjEz9",
	])("rejects unsupported or malformed Bilibili URL %s", (url) => {
		expect(isValidBilibiliUrl(url)).toBe(false);
	});

	it("continues to classify YouTube URLs", () => {
		expect(
			classifySupportedVideoUrl(
				"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			),
		).toBe("youtube");
	});

	it("extracts the first supported URL and strips share punctuation", () => {
		expect(
			extractSupportedVideoUrlFromText(
				"链接：https://www.bilibili.com/video/BV1DKbxzjEz9?p=2，欢迎观看",
			),
		).toBe("https://www.bilibili.com/video/BV1DKbxzjEz9?p=2");
	});

	it.each([
		["视频 BV1DKbxzjEz9", "https://www.bilibili.com/video/BV1DKbxzjEz9"],
		["经典 av170001", "https://www.bilibili.com/video/av170001"],
	])("canonicalizes a bare Bilibili id in share text", (text, expected) => {
		expect(extractSupportedVideoUrlFromText(text)).toBe(expected);
	});

	it("preserves a YouTube URL found in text", () => {
		expect(
			extractSupportedVideoUrlFromText("https://youtu.be/dQw4w9WgXcQ"),
		).toBe("https://youtu.be/dQw4w9WgXcQ");
	});

	it.each([
		["https://www.bilibili.com/video/BV1DKbxzjEz9?p=2", 2],
		["https://www.bilibili.com/video/BV1DKbxzjEz9?p=0003", 3],
		["https://www.bilibili.com/video/BV1DKbxzjEz9", null],
		["https://www.bilibili.com/video/BV1DKbxzjEz9?p=0", null],
		["https://www.bilibili.com/video/BV1DKbxzjEz9?p=1.5", null],
		["https://youtu.be/dQw4w9WgXcQ?p=2", null],
	])("reads an explicit Bilibili p query from %s", (url, expected) => {
		expect(getBilibiliPageFromUrl(url)).toBe(expected);
	});
});
