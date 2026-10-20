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
- [ ] 真实 Obsidian 命令联调：隔离 Vault 已注册、插件已部署并成功打开目标笔记；当前原生应用控制面不可用，尚未执行命令交互，未触碰现有 Vault 内容。

## v0.4 — 可选 DeepSeek

- [x] Phase A：新增固定 DeepSeek detailed 摘要客户端、编排器、显式命令与独立受控区域，完成离线自动化验证。
- [ ] 使用本机已保存 DeepSeek 配置完成一次真实摘要验收；2026-10-20 脱敏检查确认当前没有可用 DeepSeek Key，因此未发起外部请求。

## v0.5 — Bilibili

- [x] 审计后端 Bilibili URL、分 P、AI 字幕、ASR 回退、合并与无 Cookie 失败边界。
- [x] 完成公开单 P 视频的无 Cookie `/api/bili-pages` 与 transcript-only 黑盒验证，取得非空带时间戳 Markdown。
- [x] 确认官方开放平台未提供本产品所需的公开字幕下载契约；当前实现依赖可能变化的网页接口与 yt-dlp 适配。
- [x] Phase A：实现平台中立的本地转录命令、Bilibili URL 识别、分 P 预览与显式选择；不接入 Cookie。离线自动化验证 16 suites、402 tests 通过。
- [x] Phase A 后端真实契约验收：公开单 P 与公开多 P 显式选页均完成；多 P P2 返回非空 Markdown 和 7 个时间戳，任务清单记录 selected_pages=[2]、total_pages=2。
- [ ] Phase A Obsidian 真实验收：隔离 Vault 中执行平台中立命令，覆盖多 P Modal、无可转写文字、风控失败和受控区域幂等写入。
- [ ] Phase B：在真实 DeepSeek 闸门通过后，允许 Bilibili 复用现有摘要区域。

## v0.6 — 发布

- [x] 完成官方发布要求与当前仓库的只读差距审计。
- [x] 移除 Prompt 输入框的 JavaScript 内联样式，改用作用域 CSS。
- [x] 确定正式插件名称、唯一插件 ID、作者署名和首个衍生版本号；仓库地址留作发布前外部闸门。
- [x] 更新 README、manifest、package、package-lock 与 versions.json，并增加完整网络、剪贴板、本地后端和隐私披露。
- [x] 创建公开 GitHub 仓库，并把 CI 改为只读最小权限验证；把 Release 改为人工触发且不自动修改源码、commit 或 push。
- [x] 增加无依赖的发布元数据/资产校验脚本，建立全仓库 Prettier 基线。
- [x] 完成发布候选静态构建、三件套哈希和 ZIP 内容验收。
- [ ] 完成隔离 Vault 真实命令验收；当前自动化仍无法唯一控制原生 Obsidian 窗口。
- [ ] 创建 GitHub Release、上传资产和提交社区目录；必须单独授权后才能执行。

> 各阶段实现方式与优先级可能随审计结果调整。
