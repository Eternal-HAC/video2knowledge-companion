module.exports = {
	transform: { "^.+\\.ts?$": "ts-jest" },
	testEnvironment: "node",
	testRegex: ".*\\.(test|spec)?\\.(ts|tsx)$",
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	moduleDirectories: ["node_modules", "<rootDir>"],
	moduleNameMapper: {
		"^obsidian$": "<rootDir>/tests/__mocks__/obsidian.ts",
	},
};
