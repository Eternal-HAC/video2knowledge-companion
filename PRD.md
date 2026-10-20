# PRD.md

## 产品目标

Video2Knowledge Companion 帮助用户把 YouTube 或公开 Bilibili 视频的字幕、时间戳和可选摘要安全写入当前 Obsidian 笔记。

## 核心原则

- 官方 Obsidian Web Clipper 负责网页剪藏，本项目不重写浏览器剪藏器。
- 以 obsidian-yt-transcript 作为字幕、时间戳和 Obsidian 插件基础。
- 原始 transcript 必须保留；LLM 失败不能导致 transcript 丢失。
- 不得静默覆盖用户内容；不得泄露凭据。

## v0.1 范围

- 首选读取当前笔记 Frontmatter 中的 source/url 字段作为视频来源，并将其作为 PromptModal 的初始值。
- 若 Frontmatter 未指定，再以上游已有的 URL 检测作为兼容回退（选中文本、剪贴板）；检测到的 URL 同样作为 PromptModal 初始值。
- PromptModal 中用户实际提交的值可以覆盖预填的检测值。
- 保留上游选中文本、剪贴板回退与 Prompt 最终确认。
- 获取可用字幕（优先用户指定语言，回退可用语言）；无字幕时向用户明确提示，不静默失败。
- 将 transcript 与时间戳写入受控 transcript 区域（或等价非覆盖机制），重复执行不得静默覆盖用户正文。
- 保持原有侧栏命令与面板功能不变。

## v0.2 范围

- 提供官方 Obsidian Web Clipper 可导入的 YouTube companion note 模板。
- 模板将原始页面 URL 写入 `source` 属性，供插件读取。
- 模板负责元数据、描述和笔记骨架；transcript 由 Obsidian 插件写入受控区域。
- 不使用 Web Clipper Interpreter、`{{transcript}}` 或自定义浏览器脚本。
- Frontmatter、并发 key 和 editor 绑定 editorCallback 的 ctx.file；缺失目标文件时明确提示并停止。
- URL 确认后保存内容快照；字幕返回时目标文件或内容变化则拒绝写入并提示。
- 区域 marker 仅允许 column 0 独占行且不得带首尾空白；缩进或带尾随空白的近失 marker 一律 fail closed，不追加新区域。只使用上下文检查得到的安全坐标。

## v0.3 范围

- 桌面端通过显式命令调用本机 loopback Video2Knowledge 服务，不在普通字幕失败后自动触发下载或 ASR。
- 只传视频 URL、复用策略、字幕优先、Whisper 模型和 GPU 开关，不传凭据。
- 等待期间绑定 `ctx.file`、目标路径与正文快照；本地停止等待不宣称已经取消后端任务。
- 后端返回的原始带时间戳 Markdown 仍写入受控 transcript 区域。

## v0.4 范围

- 提供显式 DeepSeek 摘要命令，复用本机 Video2Knowledge 服务已保存的 DeepSeek 配置；插件不接收、不保存 API Key。
- 固定生成 detailed 摘要，不在本阶段提供自由提示词、改写或多风格选择。
- 摘要写入当前笔记独立 `YSummary` 受控区域，默认位于 transcript 区域之后。
- 摘要失败、取消或目标变化不得修改原始 transcript 和用户正文。

## v0.5 范围

- Bilibili 只通过本机 loopback Video2Knowledge 服务接入，不扩展上游 YouTube 直连字幕命令。
- 首版只保证公开、无需登录的 `bilibili.com/video`、BV/av 分享文本与 `b23.tv` 链接；私有、会员、地区限制和必须登录的字幕不属于保证范围。
- 插件不接收、保存或发送 SESSDATA、bili_jct、buvid3 等 Bilibili 凭据；无 Cookie 不可用时显示稳定错误并停止。
- Phase A 先提供平台中立的本地转录命令，同时保留现有 YouTube 命令和命令 ID；Bilibili 摘要在转录路径真实验收后再接入。
- 平台中立命令固定为 `insert-video-transcript-local`（Insert video transcript using local service）；YouTube 请求保持原五字段，Bilibili 先调用 `/api/bili-pages`，转录时只额外发送明确选择的 `bilibili_pages`。
- Bilibili 多 P 必须先调用本地后端预览页清单，并由用户显式选择至少一个分 P；上次明确选择优先，其次采用 URL 的 `?p=N`，其余情况默认不选择。
- 后端返回的带时间戳 Markdown 继续写入现有 `YTranscript` 受控区域，沿用目标快照、并发保护和 fail closed 规则。
- Bilibili 网页接口属于可能变化的非发布契约；插件只依赖本地后端稳定 JSON 契约，不直接调用 Bilibili API 或复制 yt-dlp 逻辑。

## 后续阶段

1. v0.3/v0.5 隔离 Vault 真实 Obsidian 命令验收。
2. v0.4 真实 DeepSeek 验收。
3. v0.5 Bilibili Phase B 可选 DeepSeek 摘要。
4. v0.6 发布候选、GitHub Release 与社区目录提交。

## 明确不做

- 抖音登录、小鹅通、Cookie 自动管理。
- 自研下载器、自研 ASR 框架。
- Agent/MCP、完整浏览器扩展。
- 重写 Obsidian Web Clipper。
