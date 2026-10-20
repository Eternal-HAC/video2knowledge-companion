import { existsSync, readFileSync, statSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const fail = (message) => {
	throw new Error(`Release validation failed: ${message}`);
};

const manifest = readJson("manifest.json");
const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const versions = readJson("versions.json");
const lockRoot = packageLock.packages?.[""];

if (!/^[a-z0-9-]+$/.test(manifest.id)) {
	fail(
		"manifest id must contain only lowercase letters, numbers, and hyphens",
	);
}
if (manifest.id.includes("obsidian") || manifest.id.endsWith("-plugin")) {
	fail("manifest id uses a reserved Obsidian community naming pattern");
}
if (/obsidian/i.test(manifest.name)) {
	fail("manifest name must not contain Obsidian");
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
	fail("manifest version must be a numeric semantic version");
}
if (packageJson.name !== manifest.id) {
	fail("package name and manifest id differ");
}
if (packageJson.version !== manifest.version) {
	fail("package and manifest versions differ");
}
if (
	packageLock.name !== packageJson.name ||
	lockRoot?.name !== packageJson.name
) {
	fail("package-lock name does not match package name");
}
if (
	packageLock.version !== packageJson.version ||
	lockRoot?.version !== packageJson.version
) {
	fail("package-lock version does not match package version");
}
if (versions[manifest.version] !== manifest.minAppVersion) {
	fail("versions.json does not map the current version to minAppVersion");
}
if (!manifest.author || !manifest.description || !manifest.minAppVersion) {
	fail("manifest is missing required release metadata");
}

for (const path of ["main.js", "manifest.json", "styles.css"]) {
	if (!existsSync(path) || statSync(path).size === 0) {
		fail(`${path} is missing or empty`);
	}
}

console.log(
	`Release metadata valid for ${manifest.id} ${manifest.version} (${manifest.minAppVersion}+).`,
);
