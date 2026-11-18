# ROADMAP.md

## v0.1 — YouTube 有字幕视频写入当前笔记

- [x] 复用上游字幕获取逻辑，保持 domain/obsidian 分层。
- [x] 在命令中支持"插入当前笔记"作为默认输出目标。
- [x] 验证时间戳格式与链接可用性。
- [x] 本轮安全返工通过 npm test、npm run lint、npm run build、git diff --check 和局部格式检查（129 个测试）。
- [x] 明确验收：读取当前笔记 Frontmatter 的 source/url；支持中文 Unicode 字幕；保持 Frontmatter 有效；重复执行结果稳定；无可用字幕时明确提示用户。

## v0.2 — Web Clipper 模板

- [x] 调研官方 Obsidian Web Clipper 模板变量、导入方式和触发规则。
- [x] 提供可导入的 Video2Knowledge YouTube companion note 模板。
- [x] 用契约测试固定 `source={{url}}`、YouTube 触发器和单一 transcript 所有权。
- [ ] 在真实浏览器和 Obsidian 中完成导入与端到端手工验收（已确认 Chrome 安装官方 Web Clipper 1.7.1；当前自动化安全策略不能控制扩展页面）。

## v0.3 — 无字幕 ASR

- [x] 审计 Video2Knowledge-next 本地 FastAPI 契约（health / transcribe / task / task transcript）。
- [x] 确定集成方式：复用本机 loopback HTTP JSON 服务，插件侧只做纯客户端；desktop-only、显式命令、不自动回退、不传凭据。
- [x] Phase A：新增 src/video2knowledge 客户端与契约测试（不含真实联调）。
- [x] Phase B1：新增 Obsidian requestUrl transport 与转录任务编排器（依赖注入、无真实网络）。
- [x] Phase B2：接入插件显式命令、设置 UI 与受控区域笔记写入（自动化测试，无真实网络）。
- [x] 真实后端联调：平台字幕与强制 Whisper base ASR 均完成端到端验证。
- [x] 真实 Obsidian 与真实后端联合验收：隔离 Vault 中旧 YouTube 本地 ASR 命令通过 base CPU 真实产物写入 4 行时间戳，Frontmatter、正文 canary 与唯一受控区域均保持正确。

## v0.4 — 可选 DeepSeek

- [x] Phase A：新增固定 DeepSeek detailed 摘要客户端、编排器、显式命令与独立受控区域，完成离线自动化验证。
- [x] 使用本机已保存 DeepSeek 配置完成一次真实摘要验收：脱敏配置确认 DPAPI 安全存储与 `deepseek-flash` 模型，连接测试成功；隔离 Vault 仅提交一次 detailed/note/reuse 任务并生成非空 YSummary 区域，原 Transcript、Frontmatter 与正文 canary 保持不变。

## v0.5 — Bilibili

- [x] 审计后端 Bilibili URL、分 P、AI 字幕、ASR 回退、合并与无 Cookie 失败边界。
- [x] 完成公开单 P 视频的无 Cookie `/api/bili-pages` 与 transcript-only 黑盒验证，取得非空带时间戳 Markdown。
- [x] 确认官方开放平台未提供本产品所需的公开字幕下载契约；当前实现依赖可能变化的网页接口与 yt-dlp 适配。
- [x] Phase A：实现平台中立的本地转录命令、Bilibili URL 识别、分 P 预览与显式选择；不接入 Cookie。离线自动化验证 16 suites、402 tests 通过。
- [x] Phase A 后端真实契约验收：公开单 P 与公开多 P 显式选页均完成；多 P P2 返回非空 Markdown 和 7 个时间戳，任务清单记录 selected_pages=[2]、total_pages=2。
- [x] Phase A Obsidian 真实验收：隔离 Vault 已通过多 P Modal、P2 默认选择、真实写入与重复执行幂等；独立 loopback 模拟服务已在原生 UI 重放无可转写文字任务失败与 Bilibili 风控预览 HTTP 失败，固定脱敏提示正确且笔记哈希不变。
- [x] Phase B 离线实现：现有 DeepSeek 摘要命令支持公开 Bilibili URL/BV/av/b23.tv，复用分 P 预览与显式选择，并只向摘要请求附加 `bilibili_pages`；保持无 Cookie、插件侧无凭据、单次提交和独立 YSummary 写入。19 suites、444 tests 通过。
- [x] Phase B 真实联合验收：隔离 Vault 中明确选择 P2 后仅提交一次真实 DeepSeek detailed/note/reuse 任务并完成；唯一 YSummary 区域非空，Transcript、Frontmatter 和正文 canary 保持不变。完整重启后确认摘要选择按钮为 `Summarize selected parts`，随后取消，没有再次提交 provider。

## v0.6 — 发布

- [x] 完成官方发布要求与当前仓库的只读差距审计。
- [x] 移除 Prompt 输入框的 JavaScript 内联样式，改用作用域 CSS。
- [x] 确定正式插件名称、唯一插件 ID、作者署名和首个衍生版本号；仓库地址留作发布前外部闸门。
- [x] 更新 README、manifest、package、package-lock 与 versions.json，并增加完整网络、剪贴板、本地后端和隐私披露。
- [x] 创建公开 GitHub 仓库，并把 CI 改为只读最小权限验证；把 Release 改为人工触发且不自动修改源码、commit 或 push。
- [x] 增加无依赖的发布元数据/资产校验脚本，建立全仓库 Prettier 基线。
- [x] 完成发布候选静态构建、三件套哈希和 ZIP 内容验收。
- [x] 完成隔离 Vault 全部插件命令验收：覆盖直连字幕、旧 YouTube 本地 ASR、平台中立 Bilibili 多 P、本地 DeepSeek 摘要、重复执行、目标切换、歧义 marker、插件重载、失败不写入及双任务状态栏。Web Clipper 属于独立浏览器扩展人工闸门。
- [ ] 创建 GitHub Release、上传资产和提交社区目录；必须单独授权后才能执行。

## v0.7 — Beta Hardening

- [x] 设置页增加 loopback 服务连接测试，返回有限、脱敏的身份和版本结果。
- [x] 本地转录与 DeepSeek 摘要接入持久进度提示和“停止等待”入口；停止等待不发送后端取消。
- [x] 借鉴同类插件的持久状态反馈，增加并发安全的 Obsidian 状态栏任务摘要；Notice 继续承担停止等待操作。
- [x] 进度 UI 不显示后端自由文本、任务 ID、路径或凭据，只显示固定状态与 0–100 的合法百分比。
- [x] 增加插件生命周期、设置迁移、设置保存、连接按钮、进度和本地取消自动化测试。
- [x] README 增加 Windows 便携后端安装、已验证兼容矩阵、首次模型下载和故障排查。
- [x] 在隔离 Vault 中以模拟后端实测连接按钮、进度更新、停止等待、转录及摘要成功写入。
- [x] 隔离 Vault 已通过真实后端联合流程、单任务状态栏和插件重载；独立 loopback 模拟服务已在原生 UI 中稳定保持转录与摘要两个并发任务，验证 2→1→0 状态栏生命周期与 Stop waiting 不发送后端取消。
- [x] 真实 DeepSeek 摘要通过保存配置、单次提交与独立 YSummary 区域完成联合验收。
- [ ] Web Clipper UI 验收仍受浏览器扩展控制策略限制，保留外部人工闸门。

> 各阶段实现方式与优先级可能随审计结果调整。
