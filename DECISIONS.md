# DECISIONS.md

## 2026-10-08 项目引导

1. **产品名**：暂定 Video2Knowledge Companion for Obsidian。
2. **上游选择**：以 obsidian-yt-transcript 作为字幕、时间戳和 Obsidian 插件基础。
3. **LICENSE 与版权声明**：LICENSE 和上游版权声明不得删除；README、manifest.json、package.json 在正式 adoption 阶段可按产品身份和构建需要修改，当前引导阶段暂未修改。
4. **剪藏策略**：官方 Obsidian Web Clipper 负责网页剪藏，本项目不重写浏览器剪藏器。
5. **v0.1 输入策略**：首选读取当前笔记 Frontmatter 的 source/url；上游已有的选中文本、剪贴板、手动输入仅作为兼容回退，是否保留需经实现审计。
6. **v0.1 写入策略**：将 transcript 写入受控 transcript 区域（或等价非覆盖机制），重复执行不得静默覆盖用户正文。
7. **后续核心候选**：Video2Knowledge-next 作为无字幕 ASR、LLM 和 Markdown 处理核心的候选依赖，实际集成方式尚为 UNKNOWN，必须先审计 CLI/API。
8. **旧仓库处理**：旧 Video2Knowledge 冻结为历史、测试和安全规则来源，不整体迁移源码。
9. **v0.1 目标**：优先完成 YouTube 有字幕视频写入当前 Obsidian 笔记。
10. **阶段顺序**：Web Clipper 模板 → 无字幕 ASR → 可选 DeepSeek → Bilibili → 发布。
11. **数据安全**：原始 transcript 必须保留；LLM 失败不能导致 transcript 丢失；不得静默覆盖用户内容；不得泄露凭据。
12. **不做范围**：抖音登录、小鹅通、Cookie 自动管理、自研下载器、自研 ASR 框架、Agent/MCP、完整浏览器扩展。
13. **文档范围**：只新增 AGENTS.md、PRD.md、ROADMAP.md、PROJECT_STATUS.md、DECISIONS.md、UPSTREAM.md；不新增 TODO.md、PROJECT_SNAPSHOT.md、PROGRAM_MAP.md、CHANGELOG.md。

## 2026-10-08 v0.1 实现

1. **受控 transcript 区域**：使用 HTML 注释标记 `<!-- YTranscript:start -->` 与 `<!-- YTranscript:end -->` 界定 transcript 写入范围；重复执行时只替换区域内内容，不覆盖用户正文。
2. **URL 来源顺序**：`InsertTranscriptCommand` 按以下顺序检测视频 URL 并作为 PromptModal 的初始值：
    1. 当前笔记 Frontmatter 的 `source` 或 `url` 字段；
    2. 编辑器选中文本；
    3. 剪贴板文本；
    4. PromptModal 手动输入（空初始值）。
       用户在 PromptModal 中实际提交的值可以覆盖上述检测到的初始值；因此“检测优先级”只决定预填内容，不决定最终提交值。
3. **保持上游功能**：侧栏 transcript 视图和原有命令 ID 保留；插入命令接口增加明确的目标文件参数。
4. **测试基础设施**：新增 `tests/__mocks__/obsidian.ts` 与 `jest.config.js` 的 `moduleNameMapper`，以支持对依赖 Obsidian API 的模块进行单元测试。
5. **中文 Unicode 字幕**：`parse-captions.ts` 的 XML 解析天然支持 Unicode；v0.1 未引入额外编码转换。

## 2026-10-08 v0.1 验收返工

1. **Marker 上下文安全**：transcript 区域标记仅当独占一行且不在 YAML frontmatter、代码围栏、行内代码内时才被识别为边界；防止用户正文中的示例标记被误判。
2. **并发/目标稳定性**：同一目标笔记的多次请求通过递增 request id 跟踪；只有最新请求的响应才能写入 editor，避免慢请求覆盖新结果。
3. **目标绑定（2026-10-09 修正）**：editorCallback 直接提供 ctx.file；命令必须使用该文件读取 Frontmatter 和设置并发 key，缺失时停止。通过 ctx.file getter 检查等待期间的目标身份与路径；禁止 activeFile、getMostRecentLeaf 和内容长度回退。
4. **Prompt 最终确认**：保留上游 PromptModal 行为，检测到的 URL 仅作为初始值，用户提交值可覆盖。
5. **安全坐标与内容快照**：替换只使用同一组上下文验证的 marker 坐标；缩进 marker fail closed。URL 确认后、fetch 前记录 editor 内容，返回时拒绝写入已改变的笔记。测试使用按 URL 的独立 deferred 响应证明并发行为。

## 2026-10-09 v0.2 Web Clipper 模板

1. **复用官方 Clipper**：只交付 schemaVersion 0.1.0 的可导入 JSON 模板，不开发浏览器扩展或自定义网页抓取器。
2. **桥接字段**：模板唯一的 `source` 属性取值为 `{{url}}`，作为 v0.1 插件读取当前视频 URL 的稳定契约。
3. **单一 transcript 所有权**：模板不使用 `{{transcript}}`，也不预写 `YTranscript` marker。Web Clipper 创建笔记骨架，Obsidian 插件负责 transcript 获取与受控区域更新。
4. **无 Interpreter**：模板不使用 prompt variables，不发起 LLM 调用，也不保存密钥、token 或 Cookie。
5. **路径中立**：模板 `path` 留空，不替用户决定 Vault 目录结构。
6. **验收边界**：仓库自动化验证 JSON 与契约；真实浏览器导入、模板触发和 Obsidian 端到端流程仍需手工验收。

## 2026-10-09 marker 上下文补强

1. **近失 marker 一致 fail closed**：transcript 区域 marker 只在独占 column 0 且不带任何首尾空白时被识别为边界。原先只对缩进（前导空白）fail closed，带尾随空白的 marker 既不匹配也不再被拒绝，会被误判为“无区域”，导致追加第二个 transcript 区域。现改为对正文中任何“去除首尾空白后等于 marker”的行一律判定歧义并 fail closed，正文保持不变。该补强同时覆盖 CRLF 行尾。

## 2026-10-10 v0.3 本地 ASR HTTP 契约

候选后端 Video2Knowledge-next 审计基线：HEAD `d75db8b23198cdff5e4689e0e097a6ca37059ec8`，branch `main`，审计时工作区干净（无 dirty 文件）。该基线是当前源码事实，并非发布稳定 API；真实联调前需按同一 HEAD 复核。

1. **集成方式**：v0.3 复用候选后端的本地 FastAPI 服务，插件侧通过 HTTP JSON 调用；不直接 import Python、不复制下载器/ASR/任务系统、不走 CLI、不通过 MCP/SSE。MCP 仅用于交叉确认接口语义。
2. **范围与回退**：第一版 desktop-only；采用显式 ASR 命令，不在字幕失败后自动下载或转写；不自动回退到其他 provider。
3. **访问边界**：只允许 loopback 后端；客户端请求前自行校验 base URL（仅 http、仅 127.0.0.1 / localhost / ::1、无凭据/路径/query/hash），不传 Cookie、token、API Key。后端 `LocalSecurityMiddleware` 也会拒绝非回环客户端（403；`is_loopback_client` 见 backend/main.py L135，middleware L172；uvicorn 默认 host 127.0.0.1，L3223）。
4. **Endpoint 最小契约**（backend/main.py）：
    - `GET /api/health`：`status` 必须为 `ok`，`service`、`version` 为非空 string（L1585-1604）。
    - `POST /api/transcribe`：请求体 `TranscribeRequest` 只含 `video_url`、`upload_task_id`、`resume_task_id`、`processing_mode`（`reuse`/`restart`，默认 `reuse`）、`prefer_subtitles`（默认 true）、`whisper_model`（默认 `base`）、`use_gpu`（默认 false）和可选 B 站/抖音凭据；刻意没有任何大模型字段（L417-431）。成功响应 `{task_id, reused_task_id}`（L1049）。
    - `GET /api/task/{task_id}`：返回去除下划线私有键的任务快照（L1052-1104）。客户端已知状态限定 `pending`/`queued`/`processing`/`cancelling`/`completed`/`failed`/`cancelled`，未知状态 fail closed；可选 `step_name`/`progress`/`progress_message`/`error`，`progress` 若存在必须是有限 number。
    - `GET /api/task/{task_id}/transcript?output_format=markdown`：成功字段 `task_id`、`title`（可为空）、`format=markdown`、`text`；无转录产物 409，非法任务 ID 400，转录文件不可读 500（L1107-1160）。
5. **客户端契约**：`Video2KnowledgeClient` 只暴露 `health`、`startTranscription`、`getTask`、`getMarkdownTranscript`；本阶段不做轮询/等待/重试/取消/并发。`POST /api/transcribe` 默认显式发送且仅发送 `video_url`、`processing_mode=reuse`、`prefer_subtitles=true`、`whisper_model=base`、`use_gpu=false`。
6. **本地校验与错误模型**：base URL 非法 `invalid-base-url`；空 videoUrl/taskId `invalid-request`；transport 抛错 `transport-error`；非 2xx `http-error`（记录 status，detail 最多 300 字并脱敏）；2xx 非法 JSON `invalid-json`（不回显正文）；结构不符 `protocol-error`。错误消息遮蔽 `sk-`、`Bearer`、`api_key`/`token`/`cookie` 等，且不写入请求 body/URL/headers。

7. **无副作用**：不读环境变量/文件系统/Obsidian 全局/window，不 console 输出，不持久化任务 ID/URL/transcript。
8. **health 服务身份**：`health()` 除要求 `status` 为 `ok`、`version` 非空外，还要求 `service` 精确等于 `VideoToNo`；其他非空 service 一律 `protocol-error`，避免把用户端口上的其他服务误判为目标后端。
9. **transport 异常不回显原文**：transport 抛出的异常只映射为固定文案 `Video2Knowledge transport request failed.`，不再把原始 message（可能含请求 body、video URL 或凭据）写入错误，也不使用正则从任意异常文本中挑选片段。

## 2026-10-10 v0.3 Phase B1（Obsidian transport 与转录编排器）

1. **Obsidian transport**：`src/obsidian/video2knowledge-transport.ts` 实现 `Video2KnowledgeTransport`，使用 `requestUrl` 并显式 `throw: false`，在 HTTP 4xx/5xx 时保留 `status`/`text` 交给 Phase A 客户端统一解释错误；适配器不改写 status/text，`requestUrl` 自身抛错原样向上抛，由客户端转成固定 `transport-error`。`RequestUrlResponse.text` 按类型声明为 string，适配器原样透传，结构异常交由客户端 transport response validation 处理。
2. **编排器**：`src/video2knowledge/transcription-runner.ts` 以依赖注入（client、wait、now）实现 health → startTranscription → 轮询 getTask → completed 后 getMarkdownTranscript；不依赖 Obsidian，不自动重试、不指数退避、不取消后端、不持久化 taskId、不并发去重、不写笔记。
3. **默认参数**：pollIntervalMs 默认 2000，timeoutMs 默认 30 分钟（1800000）。
4. **计时**：`run` 在本地参数校验后、首次取消检查前记录 start，health/start 的耗时计入总预算；`elapsed = max(previousElapsed, now - start)`，now 倒退不降低已观察 elapsed。
5. **取消**：本地取消只停止插件侧等待，不发后端取消；cancelled 错误文案明确 no backend cancellation，不宣称已取消后端任务。

## 2026-10-10 v0.3 Phase B2（显式本地 ASR 命令与设置接线）

1. **命令身份**：新增命令 id `insert-youtube-transcript-local-asr`，name `Insert YouTube transcript using local ASR`；`editorCallback` 传 `editor`、`ctx.file` 与 `() => ctx.file`，在 src/obsidian/plugin.ts 的 onload 注册。
2. **桌面限制**：命令第一项检查 `Platform.isDesktopApp`；非桌面端提示 Local ASR requires Obsidian desktop and a running local Video2Knowledge service. 后停止，不打开 Prompt、不创建 runner、不读剪贴板、不写笔记。移动端字幕功能与 manifest 保持不变。
3. **显式触发**：只有该命令触发本地 ASR，不在字幕失败后自动回退或自动转写。
4. **URL 优先级**：ctx.file Frontmatter source（再 url）→ 选中文本 → 剪贴板 → PromptModal；检测值仅作 Prompt 初值，用户提交值可覆盖；Prompt 取消静默结束；不读 activeFile；Frontmatter 值无效也先进 Prompt，提交后才校验。
5. **设置项**：video2KnowledgeBaseUrl（默认 http://127.0.0.1:8000）、asrWhisperModel（默认 base，空值回退 base，UI 与命令共用 normalizeAsrWhisperModel）、asrPreferSubtitles（默认 true）、asrUseGpu（默认 false）。无凭据字段；旧 settings 通过 Object.assign 默认值兼容。
6. **runner 与请求**：每次 execute 通过 createRunner(baseUrl) 新建 client+runner，坏 base URL 不会让 onload 失败；请求显式为 videoUrl、processingMode=reuse、preferSubtitles、whisperModel、useGpu 五字段；使用 runner 默认 2 秒/30 分钟。
7. **目标快照与并发**：按目标路径维护递增 request id；Prompt 后与 runner 返回后各做一次目标身份/路径/编辑器内容快照校验；runner 的 isCancelled 在上述任一变化或 request 非最新时返回 true；较旧请求不得覆盖新请求，被取代的旧请求静默结束；不同文件可并发。
8. **本地取消语义**：本地取消只停止插件侧等待，不发送后端取消；提示文案明确 backend task may still be running。
9. **稳定错误映射**：invalid-base-url / transport-error / http-error（含 status，不含 detail）/ invalid-json / protocol-error / failed / timeout / cancelled / unknown 分别映射为固定安全文案；不显示 task.error、video URL、请求体、凭据或任意 error.message。
10. **写入**：直接写入受控区域 replaceTranscriptRegion(editor, transcript.text, onError)，原始 Markdown 不摘要不改写；marker 歧义或正文含保留 marker 时 fail closed；成功给简短提示；不写 task id、不持久化 task id。

## 2026-10-19 v0.3 真实后端验收

1. **后端基线**：启动验收时为 main@`343ad84299c5121ea1486a479712a0fa3d3ca8da` 加 8 个既有未提交字幕导入/SRT 改动，全量测试 566 passed、2 skipped；运行期间这些改动由外部流程提交为 `bd14517c142fc95c4495db9603ff35b4f12f46ef`，随后又提交静态媒体类型修复 `e14ce26666bed9c07805876ed3bdf5961f839032`。main@`e14ce26666bed9c07805876ed3bdf5961f839032` 的中间检查工作区干净、全量测试 571 passed、2 skipped；最终黑盒回归后又检测到外部流程正在修改 `PROJECT_STATUS.md`、`TODO.md`、`backend/main.py` 与 `tests/test_api.py`，因此停止继续触碰后端。本项目没有执行后端 commit、reset、格式化或源码修改。
2. **平台字幕路径**：`dQw4w9WgXcQ` 以 restart、prefer_subtitles=true 提交，结果为 platform_subtitle、英文、61 段，并返回非空带时间戳 Markdown。
3. **强制 ASR 路径**：`jNQXAC9IVRw` 以 restart、prefer_subtitles=false、whisper_model=base、use_gpu=false 提交，结果为 faster_whisper、英文、4 段，并返回非空带时间戳 Markdown。
4. **Obsidian UI 边界**：创建隔离临时 Vault 并部署插件产物；未注册 Vault 无法由 URI 安全打开，且自动化无法唯一定位错误窗口，因此停止 UI 输入，没有读取或修改现有 Vault。

## 2026-10-19 v0.4 Phase A（DeepSeek 摘要离线实现）

1. **凭据所有权**：插件不新增 API Key 设置，不读取后端密钥状态；`POST /api/summarize` 固定发送 `llm_config={model_type: deepseek, api_key: ""}`，由 loopback 后端按自身安全存储解析配置。
2. **固定产品范围**：显式命令 `insert-youtube-deepseek-summary` 只生成 `output=note`、`summary_style=detailed`、`processing_mode=reuse`；不提供自由提示词、多风格、自动摘要或真实 LLM 回退。
3. **结果读取**：任务完成后通过 `GET /api/download/{task_id}` 读取非空 Markdown；客户端保留原文空白，不解析或执行返回内容。
4. **摘要区域**：使用 `<!-- YSummary:start -->` / `<!-- YSummary:end -->`；已有 transcript 时插在其后，无 transcript 时追加到文末，重复执行只替换摘要内容。
5. **双区域安全**：Transcript 与 Summary marker 都必须是正文中 column 0 的精确独占行；任一组缺失、重复、反序、近失、重叠、嵌套或生成内容注入任一保留 marker 时全部 fail closed。
6. **目标与并发**：摘要命令沿用 `ctx.file`、目标身份/路径、正文快照和每路径递增 request id；旧请求、切换/重命名目标或编辑正文后不得写入。
7. **验收边界**：只使用模拟客户端验证 DeepSeek 摘要，不读取或调用真实 Key。15 个 Jest 套件、353 个测试通过，lint 与 build 通过；真实 DeepSeek 和真实 Obsidian 仍是独立人工闸门。

## 2026-10-20 真实验收补充

1. **隔离 Vault 注册**：对 `%APPDATA%/obsidian/obsidian.json` 建立保留备份后，只新增临时 Vault `Video2Knowledge-Obsidian-E2E-20261019-001`。URI 成功打开目标笔记，workspace 与 community plugin 清单均来自隔离 Vault；不读取或修改原有 Vault 内容。
2. **Obsidian 自动化边界**：当前计算机控制层未暴露原生应用窗口，不能可靠操作命令面板；不得改用坐标猜测、全局键盘注入或重启整个 Obsidian 进程。真实命令交互继续作为人工闸门。
3. **DeepSeek 配置事实**：后端健康身份为 `VideoToNo 1.4.2`，密钥存储使用 DPAPI，但脱敏接口确认 `api.deepseek.com` 没有已保存 Key。不得读取或补写凭据，也不得发起可能重复计费的模糊请求。
4. **缺配置行为**：固定 detailed/note/reuse 摘要请求可被后端接收，随后在生成笔记阶段稳定失败；没有摘要产物，错误检查未发现 secret marker。该结果只证明安全失败，不算真实 DeepSeek 验收。
5. **Web Clipper 边界**：Chrome 已安装官方 Obsidian Web Clipper 1.7.1，扩展 ID 与官方商店一致。浏览器安全策略禁止打开或控制扩展页面，因此模板导入与真实剪藏不能宣称完成。
6. **后端并发边界**：本轮启动时 `Video2Knowledge-next` 为干净的 `main@f6da679`，最终检查时出现 7 个外部未提交文件。发现后立即正常停止 loopback 服务并停止后端操作；不得把这些改动归因于本项目，也不得在其上执行自动修复、格式化或全量测试。

## 2026-10-20 v0.5 Bilibili 调研与 Phase A 设计

1. **合规与稳定性结论**：Bilibili 官方开放平台以应用认证、账号授权、稿件管理和授权数据为主，没有发现满足本产品所需的公开字幕下载稳定契约。后端当前依赖 `x/web-interface/view`、`x/player/playurl`、`x/player/wbi/v2` 等网页接口及 yt-dlp 适配；这些能力可能受风控和接口变化影响，产品不得承诺长期稳定。
2. **真实可行性证据**：公开单 P 视频 `BV1DKbxzjEz9` 在不带 Cookie 时完成分 P 预览和 transcript-only 任务；61 秒媒体通过本地 base CPU ASR 生成非空带时间戳 Markdown。该证据只覆盖公开单 P 和当前网络条件。
3. **接入边界**：Bilibili 只通过 loopback Video2Knowledge 后端接入。插件不直连 Bilibili API、不复制下载/字幕实现、不增加 SESSDATA、bili_jct、buvid3 或 Cookie 设置。私有、会员、地区限制及必须登录字幕不属于首版保证范围。
4. **命令兼容**：Phase A 新增平台中立的本地转录命令，接受 YouTube 与 Bilibili；现有 `insert-youtube-transcript-local-asr` 及普通 YouTube 直连命令继续保留，避免破坏已有命令 ID 和移动端能力。Bilibili 不进入普通 YouTube 直连命令。
5. **客户端契约**：插件客户端新增只读 `POST /api/bili-pages` 预览能力，并允许本地转录请求携带 `bilibili_pages: number[]`；不得携带 `bilibili_cookie`。URL 层新增平台中立的提取与分类函数，原 YouTube 校验接口继续保留。
6. **分 P 决策**：单 P 自动发送 `[1]`。多 P 必须显示显式选择界面并至少选择一项；默认顺序为后端 `previous_pages`、URL `?p=N`、空选择。全选也必须显式发送完整页码，禁止缺省全量处理。
7. **写入与安全**：返回的原始 Markdown 继续写入 `YTranscript`，沿用 `ctx.file`、目标路径、正文快照、每目标请求 ID、受控 marker 与 fail closed。错误只显示稳定脱敏文案，不回显后端 detail、URL 或凭据提示。
8. **阶段拆分**：Phase A 只实现本地转录、URL 识别和分 P 选择；公开单 P、多 P、无字幕 ASR 与风控失败通过后，Phase B 才允许 Bilibili 复用 DeepSeek 摘要。真实 DeepSeek 闸门未通过前不得把 Phase B 标记完成。
9. **参考证据**：官方开放平台 `https://openhome.bilibili.com/doc`；yt-dlp Bilibili 提取器 `https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/bilibili.py`；官方 Web Clipper 帮助 `https://obsidian.md/help/web-clipper`。
10. **Phase A 实现身份**：新增命令 id `insert-video-transcript-local`，name `Insert video transcript using local service`。旧 `insert-youtube-transcript-local-asr` 实例保持 `youtube-only`，新实例启用 `supported` 模式，共用同一套目标绑定、快照、并发和受控区域写入实现，避免安全逻辑分叉。
11. **契约校验**：默认转录请求继续保持原五字段；只有 Bilibili 明确页选择才附加 `bilibili_pages`。`/api/bili-pages` 必须返回唯一正整数页码、非负时长、与 `total_pages` 一致的页清单，`previous_pages` 只能引用可用页，否则按协议错误停止且不写笔记。
12. **离线验收**：16 个 Jest 套件、402 个测试通过；覆盖旧命令兼容、单 P 自动选择、多 P 默认与取消、预览期间正文变化、协议错误脱敏、URL 分类和客户端无 Cookie 请求。真实 Obsidian UI 仍是独立验收闸门。
13. **多 P 真实契约证据**：公开视频 `BV1LpD3YsETa` 的 `/api/bili-pages` 返回 2 P；显式发送 `bilibili_pages=[2]`、不带 Cookie 后完成 base CPU 转录，Markdown 非空且含 7 个时间戳，manifest 确认只处理 P2。另一个 5 P 样本返回 `previous_pages=[2,4]`，同时暴露无音轨与无可转写文字的内容边界；任务明确失败，插件继续按固定失败文案处理且不写笔记。

## 2026-10-20 v0.6 发布前审计

1. **ID 不可沿用**：官方社区清单中的 `ytranscript` 已归属上游 `lstrzepek/obsidian-yt-transcript`。本项目若作为独立插件发布，必须在首次发布前采用新的唯一 ID；不得冒充上游更新。
2. **名称约束**：社区插件名称不得包含 `Obsidian` 或其变体，因此暂定名 `Video2Knowledge Companion for Obsidian` 不能直接用于 manifest。正式名称、ID、作者和仓库由项目所有者确认后再统一迁移。
3. **版本一致性**：当前 manifest/package 为 `1.4.0`，package-lock 根版本仍是 `1.3.1`，versions.json 属于上游发布历史。身份迁移时必须一次性统一这些文件，不能运行会自动 `git add` 的现有 version script。
4. **发布资产**：正式候选需要根目录 README、LICENSE、manifest 和 versions.json，并在无 `v` 前缀、与 manifest 完全一致的 GitHub Release 上独立上传 `main.js`、`manifest.json`、`styles.css`。发布和社区目录提交仍需单独授权。
5. **披露要求**：README 必须准确披露 YouTube 网络请求、loopback Video2Knowledge 请求、剪贴板读取、本地后端依赖、DeepSeek 由后端持有凭据、无遥测，以及桌面限定功能。当前 README 不满足该要求。
6. **样式整改**：Prompt 输入框不再通过 JavaScript 写入 `style.width`，改用 `yt-transcript__prompt-input` 作用域 CSS；其余发现的 `innerHTML` 只用于拖拽序列化由安全 DOM API 构造的本地 transcript 节点，未用于解析或执行不可信 HTML。

## 2026-10-20 v0.6 产品身份迁移

1. **正式身份**：插件名称采用 `Video2Knowledge Companion`，唯一 ID 与 npm 包名采用 `video2knowledge-companion`，首个衍生版本为 `0.6.0`。
2. **作者署名**：使用当前仓库 Git 配置中可验证的作者名 `Eternal-HAC`；没有可验证的公开作者主页，因此 manifest 不填写 `authorUrl`。
3. **仓库地址闸门**：当前只有只读上游 remote，尚无本项目 origin。README 和 manifest 不猜填未来仓库 URL；创建仓库、添加 remote 和发布仍需明确授权。
4. **版本历史隔离**：`versions.json` 只保留本项目 `0.6.0`，不把上游 `YTranscript` 的版本序列冒充为本项目发布历史。上游基线继续记录在 `UPSTREAM.md` 和 Git 历史中。
5. **兼容性保留**：`YTranscript` 受控区域 marker、旧命令 ID 和内部视图类型继续保留，避免破坏既有笔记和用户配置；只迁移公开产品身份和设置页标题。
6. **版本脚本安全**：package 的 `version` script 只同步 manifest 和 versions，不再自动执行 `git add`。版本发布仍必须经过显式检查与授权。

## 2026-10-21 v0.6 公开仓库与发布工程

1. **公开仓库**：使用 `https://github.com/Eternal-HAC/video2knowledge-companion`，创建时不初始化文件，避免与保留的上游 Git 历史冲突。
   本地默认分支采用 `main`，`origin` 指向本项目；原上游继续命名为 `upstream` 且禁止 push。公开提交使用 GitHub noreply 邮箱，避免泄露本地 QQ 邮箱。
2. **CI 权限**：普通 CI 只授予 `contents: read`，在 Node.js 22 上顺序执行安装、测试、lint、格式检查、构建和发布资产校验。
3. **Release 权限**：Release workflow 仅支持人工触发，输入版本必须与 manifest 完全一致；工作流不修改版本文件、不 commit、不 push 源码，只在全部验证通过后由 GitHub CLI 创建对应 Release。
4. **Action 版本**：采用官方 `actions/checkout` v7.0.1 与 `actions/setup-node` v7.1.0，并固定到 2026-10-21 官方 tag 对应的完整 commit SHA；后续升级需重新核对 tag、SHA 与 runner 兼容性。
5. **秘密审计**：公开前扫描未发现个人 API Key、GitHub token、私钥或 AWS key。源码中的 YouTube Innertube client key 来自保留的公开上游历史，是公开客户端标识，不属于用户凭据；不通过拆分字符串伪装它。
6. **格式基线**：为让公开 CI 从首个提交开始可通过，对 `src/` 与 `tests/` 的 19 个上游存量文件执行一次纯机械 Prettier 格式化；必须在格式化后重新运行完整测试、lint 和 build，确认无行为变化。
7. **依赖审计**：锁文件在既有 semver 范围内更新 39 个包，清除 critical/high/low 报告；生产依赖审计为 0。剩余 20 个 moderate 全部位于 Jest/ts-jest 覆盖率工具链，npm 只给出把 ts-jest 强制降级到 27 的破坏性方案，因此拒绝 `--force`。CI 使用只读 token 且不注入 secrets，并将 `npm audit --omit=dev --audit-level=moderate` 作为发布硬门。
8. **GitHub 安全设置**：公开仓库保留 secret scanning，并启用 vulnerability alerts；不启用自动安全修复，避免在没有人工审查时自动创建依赖 PR。
9. **公开告警处置**：Dependabot 告警 #1 是开发依赖链 `ts-jest -> Jest coverage -> js-yaml -> argparse -> sprintf-js@1.0.3` 中的中危拒绝服务问题（GHSA-hp3w-g68c-fv3c）。该依赖不进入插件运行时或发布资产，生产依赖审计仍为 0；GitHub 当前标记无可用修复版本，因此保持告警开放并等待上游发布，不降级测试栈、不关闭或误标告警。
10. **Runner 基线**：GitHub 在首轮 CI 中提示 `ubuntu-latest` 将迁移到 Ubuntu 26。CI 与人工 Release workflow 固定使用 `ubuntu-24.04`，避免同一源码因托管 runner 自动迁移产生未经审查的环境变化。
