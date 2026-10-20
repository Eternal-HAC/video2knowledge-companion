import { extractYouTubeUrlFromText, isValidYouTubeUrl } from "../youtube/url";

export type SupportedVideoSource = "youtube" | "bilibili";

const BILIBILI_VIDEO_ID_PATTERN = /^(?:BV[0-9A-Za-z]{10}|av\d+)$/i;
const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]，。；！？（）【】]+/gi;
const BARE_BILIBILI_ID_PATTERN = /\b(BV[0-9A-Za-z]{10}|av\d+)\b/i;

export function classifySupportedVideoUrl(
	url: string | null | undefined,
): SupportedVideoSource | null {
	if (isValidYouTubeUrl(url)) return "youtube";
	if (isValidBilibiliUrl(url)) return "bilibili";
	return null;
}

export function isValidBilibiliUrl(url: string | null | undefined): boolean {
	if (!url || typeof url !== "string") return false;

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return false;
	}
	if (parsed.username || parsed.password) return false;

	const hostname = parsed.hostname.toLowerCase();
	if (hostname === "b23.tv" || hostname === "www.b23.tv") {
		return parsed.pathname.split("/").some((part) => part.length > 0);
	}
	if (hostname !== "bilibili.com" && !hostname.endsWith(".bilibili.com")) {
		return false;
	}
	const match = parsed.pathname.match(/^\/video\/([^/]+)(?:\/|$)/i);
	return match !== null && BILIBILI_VIDEO_ID_PATTERN.test(match[1]);
}

export function extractSupportedVideoUrlFromText(
	text: string | null | undefined,
): string | null {
	if (!text || typeof text !== "string") return null;

	const youtubeUrl = extractYouTubeUrlFromText(text);
	const candidates = text.match(URL_PATTERN) ?? [];
	for (const rawCandidate of candidates) {
		const candidate = stripTrailingPunctuation(rawCandidate);
		if (isValidYouTubeUrl(candidate)) return candidate;
		if (isValidBilibiliUrl(candidate)) return candidate;
	}
	if (youtubeUrl) return youtubeUrl;

	const bareId = text.match(BARE_BILIBILI_ID_PATTERN)?.[1];
	return bareId
		? "https://www.bilibili.com/video/" + normalizeBilibiliId(bareId)
		: null;
}

export function getBilibiliPageFromUrl(url: string): number | null {
	if (!isValidBilibiliUrl(url)) return null;
	try {
		const rawPage = new URL(url).searchParams.get("p");
		if (!rawPage || !/^\d+$/.test(rawPage)) return null;
		const page = Number(rawPage);
		return Number.isSafeInteger(page) && page > 0 ? page : null;
	} catch {
		return null;
	}
}

function stripTrailingPunctuation(value: string): string {
	return value.replace(/[),.;!?，。；！？）]+$/u, "");
}

function normalizeBilibiliId(value: string): string {
	return value.toLowerCase().startsWith("av")
		? "av" + value.slice(2)
		: "BV" + value.slice(2);
}
