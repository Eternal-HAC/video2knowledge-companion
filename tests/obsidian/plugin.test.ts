jest.mock("obsidian", () => {
	class MockNotice {
		static messages: string[] = [];
		message: string;
		hide = jest.fn();
		constructor(message: string) {
			this.message = message;
			MockNotice.messages.push(message);
		}
	}

	class MockControl<T> {
		value: unknown;
		disabled: boolean[] = [];
		onChangeHandler?: (value: T) => unknown;
		onClickHandler?: () => unknown;
		setValue(value: unknown) {
			this.value = value;
			return this;
		}
		setButtonText(value: string) {
			this.value = value;
			return this;
		}
		addOptions(value: unknown) {
			this.value = value;
			return this;
		}
		onChange(handler: (value: T) => unknown) {
			this.onChangeHandler = handler;
			return this;
		}
		onClick(handler: () => unknown) {
			this.onClickHandler = handler;
			return this;
		}
		setDisabled(value: boolean) {
			this.disabled.push(value);
			return this;
		}
	}

	class MockSetting {
		static instances: MockSetting[] = [];
		name = "";
		description = "";
		text?: MockControl<string>;
		dropdown?: MockControl<string>;
		toggle?: MockControl<boolean>;
		button?: MockControl<void>;
		constructor(_container: unknown) {
			MockSetting.instances.push(this);
		}
		setName(value: string) {
			this.name = value;
			return this;
		}
		setDesc(value: string) {
			this.description = value;
			return this;
		}
		addText(callback: (control: MockControl<string>) => void) {
			this.text = new MockControl<string>();
			callback(this.text);
			return this;
		}
		addDropdown(callback: (control: MockControl<string>) => void) {
			this.dropdown = new MockControl<string>();
			callback(this.dropdown);
			return this;
		}
		addToggle(callback: (control: MockControl<boolean>) => void) {
			this.toggle = new MockControl<boolean>();
			callback(this.toggle);
			return this;
		}
		addButton(callback: (control: MockControl<void>) => void) {
			this.button = new MockControl<void>();
			callback(this.button);
			return this;
		}
	}

	class MockPlugin {
		app: unknown;
		commands: Array<Record<string, unknown>> = [];
		views: Array<{ type: string; factory: unknown }> = [];
		settingTabs: unknown[] = [];
		statusBarItems: Array<{
			text: string;
			style: { display: string };
			attributes: Record<string, string>;
			setText: (value: string) => void;
			setAttribute: (name: string, value: string) => void;
		}> = [];
		mockData: unknown = null;
		savedData: unknown = null;
		constructor(app: unknown) {
			this.app = app;
		}
		addCommand(command: Record<string, unknown>) {
			this.commands.push(command);
			return command;
		}
		registerView(type: string, factory: unknown) {
			this.views.push({ type, factory });
		}
		addSettingTab(tab: unknown) {
			this.settingTabs.push(tab);
		}
		addStatusBarItem() {
			const item = {
				text: "",
				style: { display: "" },
				attributes: {} as Record<string, string>,
				setText(value: string) {
					this.text = value;
				},
				setAttribute(name: string, value: string) {
					this.attributes[name] = value;
				},
			};
			this.statusBarItems.push(item);
			return item;
		}
		async loadData() {
			return this.mockData;
		}
		async saveData(data: unknown) {
			this.savedData = data;
		}
	}

	class MockPluginSettingTab {
		app: unknown;
		plugin: unknown;
		containerEl = {
			empty: jest.fn(),
			createEl: jest.fn(),
		};
		constructor(app: unknown, plugin: unknown) {
			this.app = app;
			this.plugin = plugin;
		}
	}

	return {
		App: class MockApp {},
		Editor: class MockEditor {},
		Notice: MockNotice,
		Plugin: MockPlugin,
		PluginSettingTab: MockPluginSettingTab,
		Setting: MockSetting,
		WorkspaceLeaf: class MockWorkspaceLeaf {},
		Modal: class MockModal {},
		ItemView: class MockItemView {},
		Platform: { isDesktopApp: true },
		ButtonComponent: MockControl,
		TextComponent: MockControl,
		Menu: class MockMenu {},
		setIcon: jest.fn(),
		requestUrl: jest.fn(),
	};
});

import {
	Notice,
	requestUrl,
	Setting,
	type App,
	type WorkspaceLeaf,
} from "obsidian";

import YTranscriptPlugin, {
	DEFAULT_SETTINGS,
	YTranscriptSettingTab,
} from "src/obsidian/plugin";

interface MockControl<T> {
	value: unknown;
	disabled: boolean[];
	onChangeHandler?: (value: T) => unknown;
	onClickHandler?: () => unknown;
}

interface MockSettingRecord {
	name: string;
	description: string;
	text?: MockControl<string>;
	dropdown?: MockControl<string>;
	toggle?: MockControl<boolean>;
	button?: MockControl<void>;
}

interface MockPluginState {
	commands: Array<Record<string, unknown>>;
	views: Array<{ type: string; factory: unknown }>;
	settingTabs: unknown[];
	statusBarItems: Array<{
		text: string;
		style: { display: string };
		attributes: Record<string, string>;
	}>;
	mockData: unknown;
	savedData: unknown;
}

const notices = () => (Notice as unknown as { messages: string[] }).messages;
const settings = () =>
	(Setting as unknown as { instances: MockSettingRecord[] }).instances;

function makeWorkspace() {
	const leaf = {
		setViewState: jest.fn(async () => {}),
		setEphemeralState: jest.fn(),
	} as unknown as WorkspaceLeaf;
	return {
		leaf,
		workspace: {
			getLeftLeaf: jest.fn(() => leaf),
			getRightLeaf: jest.fn(() => leaf),
			getLeaf: jest.fn(() => leaf),
			revealLeaf: jest.fn(),
			detachLeavesOfType: jest.fn(),
			getActiveFile: jest.fn(),
		},
	};
}

function makePlugin() {
	const { workspace, leaf } = makeWorkspace();
	const app = {
		workspace,
		metadataCache: { getFileCache: jest.fn() },
	} as unknown as App;
	const plugin = new YTranscriptPlugin(
		app,
		{} as never,
	) as YTranscriptPlugin & MockPluginState;
	return { app, plugin, workspace, leaf };
}

beforeEach(() => {
	notices().length = 0;
	settings().length = 0;
	jest.mocked(requestUrl).mockReset();
});

describe("YTranscriptPlugin lifecycle", () => {
	it("registers the stable views, commands, and settings tab", async () => {
		const { plugin } = makePlugin();
		await plugin.onload();
		expect(plugin.views.map((entry) => entry.type)).toEqual([
			"transcript-view",
		]);
		expect(plugin.commands.map((entry) => entry.id)).toEqual([
			"transcript-from-text",
			"transcript-from-prompt",
			"insert-youtube-transcript",
			"insert-youtube-transcript-local-asr",
			"insert-video-transcript-local",
			"insert-youtube-deepseek-summary",
		]);
		expect(plugin.settingTabs).toHaveLength(1);
		expect(plugin.settingTabs[0]).toBeInstanceOf(YTranscriptSettingTab);
		expect(plugin.statusBarItems).toHaveLength(1);
		expect(plugin.statusBarItems[0]).toMatchObject({
			text: "",
			style: { display: "none" },
			attributes: { role: "status", "aria-live": "polite" },
		});
	});

	it("merges stored settings with defaults and persists the result", async () => {
		const { plugin } = makePlugin();
		plugin.mockData = { timestampMod: 3, asrUseGpu: true };
		await plugin.loadSettings();
		expect(plugin.settings).toEqual({
			...DEFAULT_SETTINGS,
			timestampMod: 3,
			asrUseGpu: true,
		});
		await plugin.saveSettings();
		expect(plugin.savedData).toEqual(plugin.settings);
	});

	it("detaches only the transcript view on unload", () => {
		const { plugin, workspace } = makePlugin();
		plugin.onunload();
		expect(workspace.detachLeavesOfType).toHaveBeenCalledWith(
			"transcript-view",
		);
	});
});

describe("YTranscriptSettingTab", () => {
	it("renders all settings and performs a bounded connection check", async () => {
		const { app, plugin } = makePlugin();
		plugin.settings = { ...DEFAULT_SETTINGS };
		jest.mocked(requestUrl).mockResolvedValue({
			status: 200,
			text: JSON.stringify({
				status: "ok",
				service: "VideoToNo",
				version: "1.4.2",
			}),
		} as never);
		const tab = new YTranscriptSettingTab(app, plugin);
		tab.display();
		expect(settings().map((setting) => setting.name)).toEqual([
			"Timestamp interval",
			"Language",
			"Country",
			"Open transcript in",
			"Local ASR service URL",
			"Test local service",
			"Local ASR model",
			"Prefer platform subtitles",
			"Use GPU",
		]);

		const connection = settings().find(
			(setting) => setting.name === "Test local service",
		)?.button;
		await connection?.onClickHandler?.();
		expect(connection?.disabled).toEqual([true, false]);
		expect(requestUrl).toHaveBeenCalledWith({
			url: "http://127.0.0.1:8000/api/health",
			method: "GET",
			headers: undefined,
			body: undefined,
			throw: false,
		});
		expect(notices()).toContain("Connected to Video2Knowledge 1.4.2.");
	});

	it("normalizes edited values and saves each setting change", async () => {
		const { app, plugin } = makePlugin();
		plugin.settings = { ...DEFAULT_SETTINGS };
		const save = jest.spyOn(plugin, "saveSettings").mockResolvedValue();
		const tab = new YTranscriptSettingTab(app, plugin);
		tab.display();

		await settings()
			.find((entry) => entry.name === "Timestamp interval")
			?.text?.onChangeHandler?.("invalid");
		await settings()
			.find((entry) => entry.name === "Language")
			?.text?.onChangeHandler?.("zh");
		await settings()
			.find((entry) => entry.name === "Country")
			?.text?.onChangeHandler?.("CN");
		await settings()
			.find((entry) => entry.name === "Open transcript in")
			?.dropdown?.onChangeHandler?.("split");
		await settings()
			.find((entry) => entry.name === "Local ASR service URL")
			?.text?.onChangeHandler?.("http://localhost:8000");
		await settings()
			.find((entry) => entry.name === "Local ASR model")
			?.text?.onChangeHandler?.("  ");
		await settings()
			.find((entry) => entry.name === "Prefer platform subtitles")
			?.toggle?.onChangeHandler?.(false);
		await settings()
			.find((entry) => entry.name === "Use GPU")
			?.toggle?.onChangeHandler?.(true);

		expect(plugin.settings).toMatchObject({
			timestampMod: 5,
			lang: "zh",
			country: "CN",
			openLocation: "split",
			video2KnowledgeBaseUrl: "http://localhost:8000",
			asrWhisperModel: "base",
			asrPreferSubtitles: false,
			asrUseGpu: true,
		});
		expect(save).toHaveBeenCalledTimes(8);
	});
});
