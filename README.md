# Video2Knowledge Companion

Video2Knowledge Companion captures video transcripts in your notes. It can fetch public YouTube captions directly, or connect to a local Video2Knowledge service for YouTube and Bilibili transcription and optional DeepSeek summaries.

The plugin preserves user-authored content by writing generated text only inside controlled transcript and summary regions.

Install version 0.7.0 manually from [GitHub Releases](https://github.com/Eternal-HAC/video2knowledge-companion/releases/tag/0.7.0).

## Features

- Read a video URL from the current note's `source` or `url` Frontmatter field.
- Insert public YouTube captions into the current note.
- Keep the original upstream transcript side panel and legacy YouTube commands.
- Use a loopback-only Video2Knowledge service for local transcription.
- Test the local service identity and version from the plugin settings.
- Transcribe supported public YouTube and Bilibili videos through the local service.
- Preview Bilibili parts and explicitly choose which parts to process.
- Insert an optional detailed DeepSeek summary after the transcript.
- Update controlled transcript and summary regions without replacing surrounding note content.
- Use the companion Web Clipper template in `templates/` to create source-linked notes.

## Commands

### Insert YouTube transcript

Fetches public YouTube captions directly. The URL is prefilled from the current note's Frontmatter, selected text, or clipboard, and can be edited before submission.

This command is available on desktop and mobile.

### Insert YouTube transcript using local ASR

Sends the selected YouTube URL to a Video2Knowledge service running on the same computer. This command requires the desktop app and a running local service.

### Insert video transcript using local service

Supports public YouTube and Bilibili URLs. For a multi-part Bilibili video, the plugin asks which parts to process before submitting the task.

This command requires the desktop app and a running local service.

Local-service commands show a persistent progress notice and mirror bounded progress in the desktop status bar. Concurrent tasks are summarized by count so one completed task cannot hide another task that is still running. **Stop waiting** stops only the plugin's polling; it does not claim to cancel work already running in the backend.

### Insert DeepSeek summary using local service

Requests a detailed Markdown note from the local service for a public YouTube or Bilibili video. Multi-part Bilibili videos use the same explicit part-selection flow as local transcription. The plugin sends an empty API-key field; credentials remain owned and resolved by the local service. The command never stores a DeepSeek key or Bilibili cookie in the plugin.

This command requires the desktop app, a running local service, and DeepSeek configured in that service.

## Installation

### Manual release installation

Download `main.js`, `manifest.json`, and `styles.css` from the same release and place them in:

```text
<your-vault>/.obsidian/plugins/video2knowledge-companion/
```

Restart or reload the app, then enable **Video2Knowledge Companion** under Community plugins.

The plugin is not yet listed in the Obsidian Community Plugins directory.

### Development build

```bash
npm ci
npm test -- --runInBand
npm run lint
npm run check-format
npm run build
npm run validate-release
```

The build creates the ignored `main.js` release asset in the repository root.

## Controlled note regions

Transcripts are written between:

```markdown
<!-- YTranscript:start -->

...

<!-- YTranscript:end -->
```

Summaries are written between:

```markdown
<!-- YSummary:start -->

...

<!-- YSummary:end -->
```

Repeated commands update only the corresponding region. Ambiguous, duplicated, reversed, nested, or injected markers cause the write to stop without changing the note.

The `YTranscript` marker name is retained for compatibility with notes created by the upstream plugin and earlier development versions.

## Local service setup

The validated Windows companion is [Video2Knowledge-next](https://github.com/Eternal-HAC/Video2Knowledge-next). The shortest setup path is:

1. Download the Windows portable build from the [v1.4.2-v2k.1 release](https://github.com/Eternal-HAC/Video2Knowledge-next/releases/tag/v1.4.2-v2k.1).
2. Start the portable application and leave its local service running.
3. In Obsidian, open **Video2Knowledge Companion settings** and enter the loopback service URL.
4. Select **Test connection**. A successful check reports the service version without starting a transcription task.

The default URL is:

```text
http://127.0.0.1:8000
```

Only loopback HTTP endpoints are accepted. The plugin does not accept credentials in the URL and does not expose settings for Bilibili cookies or LLM keys.

If port 8000 is already occupied, the backend may select another local port. Enter the actual `127.0.0.1` port shown by the backend, then run **Test connection** again.

The first Whisper transcription may download a model and take longer than later runs. Keep the backend open while the plugin displays task progress. Selecting **Stop waiting** stops local polling only; the backend task may continue and remain available in the backend application.

Local service behavior, media downloads, model storage, provider configuration, and provider costs are managed by Video2Knowledge, outside this plugin.

### Validated compatibility

| Plugin baseline                        | Local service                                       | Validation                                                                                                     |
| -------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 0.6.0 plus current v0.7 hardening work | VideoToNo 1.4.2 / Video2Knowledge-next v1.4.2-v2k.1 | Health, YouTube subtitles, Whisper base ASR, public Bilibili single-part and explicit multi-part transcription |

The client validates the service identity and response shapes. It does not treat an arbitrary HTTP server on the configured port as compatible. Other backend versions may work, but are not part of the current verified matrix.

### Local service troubleshooting

- **URL is invalid**: use plain HTTP with `127.0.0.1`, `localhost`, or `[::1]`; credentials and remote hosts are rejected.
- **Cannot reach the service**: start Video2Knowledge, confirm its local port, then use **Test connection**.
- **Incompatible response**: confirm the port belongs to Video2Knowledge and use a validated backend version.
- **HTTP error**: inspect the backend application locally. The plugin intentionally shows only the status code and does not copy backend details into the note.
- **Task timed out or waiting was stopped**: the backend task may still be running. Check it in Video2Knowledge before submitting a duplicate paid summary request.
- **DeepSeek is not configured**: configure and test DeepSeek inside Video2Knowledge. The plugin never accepts or stores the API key.

## Network and privacy

The plugin has no telemetry or analytics.

Depending on the command, it may:

- request public YouTube pages and caption data to retrieve a transcript;
- connect to the configured loopback Video2Knowledge HTTP service;
- read selected editor text or clipboard text to prefill a video URL;
- write generated Markdown only to the note that initiated the command;
- write copied transcript text to the clipboard when the user uses a copy action.

The plugin does not send API keys, login cookies, tokens, or saved browser credentials. DeepSeek requests and credentials are handled by the separately installed local service. Bilibili login-only, paid, private, and region-restricted content is outside the supported guarantee.

The direct YouTube transcript path uses public YouTube web and Innertube endpoints inherited from the upstream project. Its embedded public client identifier is part of the upstream implementation and is not a user API key.

## Platform support

| Capability                             | Desktop | Mobile |
| -------------------------------------- | ------- | ------ |
| Direct public YouTube transcript       | Yes     | Yes    |
| Transcript side panel                  | Yes     | Yes    |
| Local Video2Knowledge transcription    | Yes     | No     |
| Bilibili part selection                | Yes     | No     |
| DeepSeek summary through local service | Yes     | No     |

Local-service commands are desktop-only because they depend on a service running on the same computer.

## Web Clipper template

The repository includes an importable template under `templates/`. It stores the page URL in `source` and intentionally does not pre-create transcript markers or invoke an Interpreter.

## Release safety

The CI workflow audits the production dependency surface, then runs tests, lint, formatting, build, and release metadata validation. The release workflow is manual and requires an exact version matching `manifest.json`. It builds from `main`, does not edit source files, and does not create commits.

Release artifacts are `main.js`, `manifest.json`, and `styles.css`. A convenience ZIP may be attached in addition to the three required individual files.

## Attribution

This project is derived from [obsidian-yt-transcript](https://github.com/lstrzepek/obsidian-yt-transcript) by Łukasz Strzępek and retains its MIT license and Git history. See [UPSTREAM.md](UPSTREAM.md) for the tracked upstream baseline and relationship. The current project repository is [Eternal-HAC/video2knowledge-companion](https://github.com/Eternal-HAC/video2knowledge-companion).

## License

MIT. See [LICENSE](LICENSE). The original upstream copyright notice is preserved.
