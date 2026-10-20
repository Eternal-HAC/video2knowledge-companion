# Video2Knowledge Companion

Video2Knowledge Companion captures video transcripts in your notes. It can fetch public YouTube captions directly, or connect to a local Video2Knowledge service for YouTube and Bilibili transcription and optional DeepSeek summaries.

The plugin preserves user-authored content by writing generated text only inside controlled transcript and summary regions.

> Status: pre-release. The repository is public for review, but no GitHub Release or Obsidian Community Plugins submission has been published yet.

## Features

- Read a video URL from the current note's `source` or `url` Frontmatter field.
- Insert public YouTube captions into the current note.
- Keep the original upstream transcript side panel and legacy YouTube commands.
- Use a loopback-only Video2Knowledge service for local transcription.
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

### Insert DeepSeek summary using local service

Requests a detailed Markdown note from the local service. The plugin sends an empty API-key field; credentials remain owned and resolved by the local service. The command never stores a DeepSeek key in the plugin.

This command requires the desktop app, a running local service, and DeepSeek configured in that service.

## Installation

### Manual release installation

After a release is published, download `main.js`, `manifest.json`, and `styles.css` from the same release and place them in:

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

Install and run Video2Knowledge separately, then configure the service URL in the plugin settings. The default is:

```text
http://127.0.0.1:8000
```

Only loopback HTTP endpoints are accepted. The plugin does not accept credentials in the URL and does not expose settings for Bilibili cookies or LLM keys.

Local service behavior, media downloads, model storage, provider configuration, and provider costs are managed by Video2Knowledge, outside this plugin.

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
