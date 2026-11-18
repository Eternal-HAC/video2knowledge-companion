# PROJECT_STATUS.md

## 当前阶段

2026-11-18：插件发布版本为 0.7.0，沿用最低 Obsidian 版本 0.15.0。Web Clipper 实机剪藏暂缓，社区目录 PR 待所有者最终确认。后端模型名页脚已在独立工作区修复并通过离线 pytest（951 passed、3 skipped），该修复随对应后端版本交付。

### 2026-10-23 验收时状态

v0.6 公开仓库基线已建立并推送。v0.7 Beta Hardening 的实现仍在未提交工作区；真实后端与隔离 Obsidian 已通过 YouTube 字幕、YouTube base CPU ASR、Bilibili 多 P 显式选择、DeepSeek 摘要、目标切换拒写、歧义 marker 保持原样、幂等更新、插件重载、双任务并发状态栏及失败场景原生 UI 验收。Web Clipper 扩展 UI 仍受自动化安全策略阻塞。

## 上游基线

- 仓库：https://github.com/lstrzepek/obsidian-yt-transcript
- 当前 HEAD：24cebbcefab5ea3d320cfa8826e0070a44f487ce
- 标签：1.4.0
- License：MIT
- 原作者：Łukasz Strzępek

## 已完成

- [x] 目标目录为空，已完整克隆上游 Git 历史。
- [x] origin 已重命名为 upstream。
- [x] 只读检查 README、LICENSE、package.json、测试配置、源码结构、Git 状态。
- [x] 新增最小项目文档（AGENTS.md、PRD.md、ROADMAP.md、PROJECT_STATUS.md、DECISIONS.md、UPSTREAM.md）。
- [x] 文档已明确 v0.1 输入策略（Frontmatter source/url 优先）与写入策略（受控 transcript 区域）。
- [x] 实现 src/obsidian/frontmatter.ts 读取 Frontmatter source/url。
- [x] 实现 src/obsidian/transcript-region.ts 管理受控 transcript 区域。
- [x] 修改 src/obsidian/commands/insert-transcript.ts：Frontmatter 优先、受控区域写入、保持上游回退。
- [x] 新增测试：tests/obsidian/frontmatter.test.ts、tests/obsidian/transcript-region.test.ts、tests/obsidian/commands/insert-transcript.test.ts。
- [x] 新增 tests/**mocks**/obsidian.ts 与 jest moduleNameMapper 以支持 Obsidian API mock。
- [x] v0.1 安全返工后的 npm test、npm run lint、npm run build、git diff --check 和局部 prettier --check 全部通过。
- [x] 新增官方 Web Clipper 可导入的 YouTube companion note 模板与导入说明。
- [x] 模板写入 `source={{url}}`，并把 transcript 写入责任保留给 Obsidian 插件。
- [x] 新增 Web Clipper 模板契约测试。
- [x] v0.2 完成后 9 个测试套件、134 个测试全部通过；lint、build、diff-check 和本阶段文件格式检查通过。
- [x] marker 上下文补强：把带尾随空白的近失 marker 也纳入 fail closed，避免误判为缺失而追加第二个 transcript 区域；新增回归测试后 9 个测试套件、136 个测试全部通过。
- [x] 代码围栏边界补强：关闭围栏要求同字符、长度不少于开启围栏且其后仅允许空格/Tab，避免带语言名或正文的伪关闭行提前结束围栏而暴露块内 marker；新增敌对回归测试后 9 个测试套件、151 个测试全部通过。
- [x] v0.3 Phase A：新增 src/video2knowledge/types.ts、client.ts 与 tests/video2knowledge/client.test.ts，固定 loopback-only 客户端、四 endpoint 最小契约与错误模型；并完成安全返工（health 身份校验、transport 异常不回显原文、JSON 风格敏感字段脱敏、空白 transcript 拒绝）。10 个测试套件、228 个测试全部通过；lint、build、diff-check 和本阶段文件格式检查通过。
- [x] v0.3 Phase B1：新增 src/obsidian/video2knowledge-transport.ts 与 src/video2knowledge/transcription-runner.ts 及对应测试，固定 requestUrl 保留 status/text、编排器 health→start→轮询→transcript 流程与错误模型；12 个测试套件、267 个测试全部通过；lint、build、diff-check 和本阶段文件格式检查通过。
- [x] v0.3 Phase B2：新增命令 insert-youtube-transcript-local-asr（Insert YouTube transcript using local ASR）与四个设置项，桌面限制、URL 优先级、目标快照与并发保护、稳定错误映射与受控区域写入；13 个测试套件、306 个测试全部通过；lint、build、diff-check 和本阶段文件格式检查通过。
- [x] v0.3 真实后端联调：VideoToNo 1.4.2 health 身份校验通过；公开 YouTube 平台字幕路径完成 61 段转录，强制 `prefer_subtitles=false` 的 Whisper base 路径完成 4 段 faster-whisper 转录，两者均返回非空带时间戳 Markdown。
- [x] v0.4 Phase A：新增 `/api/summarize` 固定 DeepSeek 请求、`/api/download/{task_id}` Markdown 读取、SummaryRunner、显式摘要命令与独立 YSummary 受控区域；双区域交叉校验、目标快照、并发与错误脱敏均有回归测试。15 个测试套件、353 个测试全部通过；lint、build 与本阶段文件格式检查通过。
- [x] 隔离 Vault 注册与部署：备份 Obsidian Vault 注册表后只新增 `Video2Knowledge-Obsidian-E2E-20261019-001`，部署当前构建并通过 URI 打开 `Video E2E.md`；窗口标题、workspace 与插件清单均指向隔离 Vault，未读取或修改现有 Vault 内容。
- [x] DeepSeek 缺配置黑盒：`VideoToNo 1.4.2` 健康检查通过，安全存储为 DPAPI；脱敏接口报告 `api.deepseek.com` 没有已保存 Key。固定 detailed/note/reuse 请求在本地任务的“生成笔记”阶段稳定失败，未产生摘要，错误检查未发现 secret marker，未调用外部 DeepSeek。
- [x] Web Clipper 安装核验：Chrome Default Profile 安装官方扩展 ID `cnjifjpddelmedmihgijeibhnjfabmlf`，版本 1.7.1；浏览器安全策略禁止控制扩展页面，因此未执行模板导入或三类 URL 剪藏。
- [x] v0.5 Bilibili 调研：后端已覆盖 BV/av/b23.tv 识别、分 P 预览、AI 字幕、缺字幕逐 P ASR、统一时间轴合并和风控回退；插件首版不得接入 Bilibili Cookie，且多 P 必须显式选择。
- [x] v0.5 Bilibili 真实黑盒：公开视频 `BV1DKbxzjEz9` 在无 Cookie 下识别为单 P、61 秒；`/api/transcribe` 以 base CPU 完成，本地 ASR 返回非空带时间戳 Markdown，任务来源为 `bilibili_multi_page`。
- [x] v0.5 Phase A 离线实现：新增 `insert-video-transcript-local`，支持 YouTube 与公开 Bilibili URL/BV/av/b23.tv；客户端增加 `/api/bili-pages` 严格响应校验和可选 `bilibili_pages`，不发送 Cookie。单 P 自动选择，多 P 通过显式 Modal 选择，默认 previous_pages → URL `?p=N` → 空；沿用目标快照、请求 ID 和受控区域 fail closed。16 个测试套件、402 个测试通过。
- [x] v0.5 Phase B：保留现有 DeepSeek 摘要命令 ID，并扩展为支持公开 YouTube/Bilibili。Bilibili 复用 Phase A 分 P 预览、默认项和显式选择；单 P 自动选择，只向 `/api/summarize` 增加校验后的 `bilibili_pages`。预览/选择期间目标或正文变化会在摘要提交前停止；预览错误使用独立脱敏文案，不误报 DeepSeek 配置。全量 19 suites、444 tests、lint、build、本阶段 Prettier 与 `git diff --check` 通过。
- [x] v0.5 多 P 后端真实验收：公开视频 `BV1LpD3YsETa` 识别为 2 P；无 Cookie 显式只选 P2 后 base CPU 任务完成，返回 373 字符非空 Markdown 和 7 个时间戳，manifest 记录 `bili_selected_pages=[2]`、`bili_total_pages=2`。另一个 5 P 样本验证了 `previous_pages=[2,4]` 复用默认；其中无音轨或无可转写文字的分 P 明确失败，未被误报为成功。
- [x] 后端边界保护：先前发现的外部并发修改已由外部流程形成提交；2026-10-20 Phase A 实现前刷新为干净的 `main@8f1d9ab`。本项目未修改、格式化、暂存或提交后端文件。
- [x] v0.6 发布前审计：官方社区清单已存在上游 `ytranscript`，衍生项目不能沿用该 ID 独立发布；当前暂定名称含 `Obsidian`，不符合社区命名规则。README、manifest、package 与 package-lock 仍保留上游身份或版本，需在产品身份确定后统一迁移。Prompt 输入框的 JavaScript 内联样式已改为作用域 CSS。
- [x] v0.6 产品身份迁移：名称改为 `Video2Knowledge Companion`，ID/package 改为 `video2knowledge-companion`，版本统一为 `0.6.0`，作者使用可验证的本地 Git 署名 `Eternal-HAC`；`versions.json` 与上游发布历史分离，README 补充功能、数据流、网络、剪贴板、loopback 后端、DeepSeek 凭据和上游归属说明。
- [x] v0.6 身份迁移验证：元数据一致性检查、16 个 Jest 套件/402 个测试、lint 和 build 通过；隔离 Vault 已启用新 ID，发布三件套部署哈希一致。旧 `ytranscript` 测试目录保留但不再启用，未执行删除。
- [x] 创建公开仓库 `https://github.com/Eternal-HAC/video2knowledge-companion`；创建时保持空仓库，未自动生成 README、License 或 Git 历史。
- [x] 本地 Git 已配置 `origin` 指向项目仓库，分支从上游 `master` 迁移为本项目 `main`，提交邮箱使用 GitHub noreply；`upstream` 保持只读且 push URL 继续为 `DISABLED`。
- [x] v0.6 发布工程基线：秘密扫描未发现个人密钥、GitHub token、私钥或 AWS 凭据；生产依赖审计为 0 漏洞。Release workflow 不再自动改版本、提交或推送，改为人工触发并先执行完整验证。
- [x] v0.6 依赖审计：在现有版本范围内刷新 lockfile 并以 `npm ci` 验证；critical/high/low 已清零，运行时依赖 0 漏洞。剩余 20 个 moderate 均来自 Jest/ts-jest 开发覆盖率链，未采用会破坏当前测试栈的 `npm audit fix --force`。
- [x] v0.6 发布候选静态验收：构建包只含 `main.js`、`manifest.json`、`styles.css`，三个文件与仓库构建产物 SHA-256 一致；ZIP 内容无多余文件。
- [x] 首个本项目公开基线 `7263ec7` 已推送到 `origin/main`；GitHub CI run `39459466784` 的依赖安装、生产依赖审计、402 项测试、lint、格式、build 和发行校验全部通过。
- [x] GitHub secret scanning 当前为 0 告警；已启用仓库 vulnerability alerts，未启用自动安全修复或自动建 PR。
- [x] Dependabot 告警 #1 已复核：`sprintf-js@1.0.3` 仅由 Jest/ts-jest 开发覆盖率链间接引入，严重度为 moderate，GitHub 当前没有可用修复版本。告警保持开放，未降级测试栈、未关闭或误标告警；生产依赖审计仍为 0。
- [x] 文档证据提交 `b34de40` 的 GitHub CI run `39459806935` 已完成，402 项测试、lint、格式、build、生产依赖审计和发行校验全部通过。
- [x] v0.7 本地服务诊断：设置页增加 Test connection，复用 loopback health 客户端验证服务身份和版本；非法地址、不可达、HTTP 错误和协议不兼容只显示有限脱敏结果，不启动任务、不读取凭据。
- [x] v0.7 长任务交互：本地转录和 DeepSeek 摘要显示持久状态与合法百分比，并提供 Stop waiting；按钮只停止插件轮询，不发送后端取消，进度 UI 不显示 progress_message、step_name、task ID 或错误正文。
- [x] v0.7 同类产品调研与状态栏优化：核对 Media Extended、SpeechKit、LexVoice、YTExtract 和 Audio Timestamp Player 的当前仓库、许可、发布与交互做法；实现共享状态栏摘要，单任务显示有限进度，并发时显示任务数，关闭顺序不会误隐藏其他任务。
- [x] v0.7 兼容性与测试：进度 Notice 不依赖 Obsidian 1.8.7 才公开的 containerEl，保留 minAppVersion 0.15.0；新增插件生命周期、设置迁移/保存、连接按钮、真实 Notice DOM 重绘、进度、取消和状态栏并发测试。全量 19 suites、429 tests 通过，语句覆盖率 72.90%、行覆盖率 73.93%，plugin.ts 行覆盖率为 70.73%，local-task-progress.ts 行覆盖率为 100%。
- [x] v0.7 本地验证：lint、全仓库源码/测试格式检查、build、release metadata 校验、文档格式检查、git diff --check 和生产依赖审计全部通过；生产依赖 0 漏洞。
- [x] v0.7 安装文档：README 指向 Video2Knowledge-next v1.4.2-v2k.1 Windows 便携版，记录已验证兼容矩阵、端口变化、首次 Whisper 下载、停止等待语义和稳定故障排查。

## 待确认

### 2026-10-22 隔离 Vault 真实 UI 验收进展

- 当前 Windows Computer Use 已能定位并操作隔离 Vault 的 Obsidian 1.14.4 窗口；此前原生窗口不可用的阻塞已解除。本轮重新构建并部署 94.5kb 插件，未操作私人 Vault。
- 真实 YouTube 直连命令：六个插件命令正常注册，Frontmatter URL 正确预填，字幕写入成功，生成 13 个时间戳链接，前后正文 canary 与 source 保留。重复执行前后文件 SHA-256 一致：`094068C2BCF6387ABF6BEA66E3E873797B4A2A4D154E74B9676F5D9F82CABF40`。真实字幕产物另存保留。
- 真实插件界面 + 独立 loopback 模拟服务：连接成功提示、转录提交/轮询/写入、摘要独立区域写入、42% 进度 Notice 与状态栏、结束清理均实测通过；后端自由文本测试标记未显示。摘要请求确认 detailed/note/reuse 且 api_key 为空。
- Stop waiting 实测：停止轮询、不发送后端取消、不下载未完成摘要，提示后端可能继续；取消前后笔记 SHA-256 一致：`5AEA3E248EA0D0496CE82FE74C71F795DE508BB455A1B6EB17157856930D45E1`。
- 本轮后端仓库存在外部未提交源码改动，因此未启动或修改该后端；模拟服务已停止，隔离插件地址已恢复 `http://127.0.0.1:8000`。以上模拟路径不计入真实 ASR、Bilibili 或 DeepSeek 服务验收。
- 该日记录的真实后端、多 P、目标切换、歧义 marker、并发状态栏和插件重载缺口已在 2026-10-23 后续验收中关闭；Web Clipper 仍保留外部人工闸门。

### 2026-10-23 真实后端与隔离 Vault 验收补充

- 后端外部脏工作区在测试前后关键文件 SHA-256 保持一致，未检测到并发写入；只读定向回归 75 项通过，完整 pytest 为 796 passed、3 skipped，`git diff --check` 通过。本项目没有修改、格式化、暂存或提交后端源码。
- loopback 服务只监听 `127.0.0.1:8000`。真实 YouTube 平台字幕返回 61 段，强制 `prefer_subtitles=false` 的 base CPU ASR 返回 4 段；两条路径均生成非空带时间戳 Markdown。
- 真实 Bilibili 多 P：`BV1LpD3YsETa` 预览返回 2 P，隔离 Vault Modal 按 URL `?p=2` 只默认勾选 P2；提交后生成 7 行时间戳转录，保留 Frontmatter 与正文 canary。重复执行文件 SHA-256 保持 `225B792FF0A0388E3B578EAB31C2D88DED7033AD4C707B80DF9A09098FB7FBC1`。
- 旧 `Insert YouTube transcript using local ASR` 兼容命令通过真实后端复用 base CPU 产物，写入 4 行时间戳，保留 Frontmatter、正文 canary 和唯一一组 transcript marker。
- 请求中切换笔记显示固定停止提示，目标 A/B 当时哈希均保持原值；重复 transcript marker 的测试笔记保持原哈希 `EF714353CFF8C45C515E9C78FBFC31AE242A2916A44989798DF7EEBE02E9F337`，未覆盖任一区域。
- Obsidian `Ctrl+R` 重载后仍能唯一识别隔离 Vault，六个插件命令全部重新注册。真实任务 Notice 与状态栏显示固定 100% 收尾状态。
- 真实 DeepSeek：脱敏接口确认 DPAPI 安全存储、`api.deepseek.com`、`deepseek-flash` 与已保存 Key，不读取原文；真实连接测试成功，延迟 629 ms。隔离 Vault 仅提交一次 detailed/note/reuse 摘要任务并完成，生成 1105 字符的唯一 YSummary 区域，位于 Transcript 之后。
- 摘要写入后，移除新增 Summary 区域可逐字节重建提交前 SHA-256 `15A5B241BBD3CF08DA9A040F54B4DC73CBB91BBAF494F52EC26DB6F2C89893DB`，证明 Frontmatter、正文 canary 与完整 Transcript 未改变；笔记未发现 Key 形态文本。生成笔记页脚当前显示“deepseek · 未指定模型”，属于结果元数据显示缺口，不影响本次真实链路通过。只读定位确认后端先以空请求字段 `model` 构造 `LLMSummarizer`，构造器已解析为默认模型，但页脚仍使用原空字段；最小修复应改用 `summarizer.model` 并增加默认模型回归测试。目标 `backend/main.py` 与 `tests/test_api.py` 当前均有外部未提交改动，本项目未叠加写入。
- Bilibili Phase B 真实联合验收：隔离 Vault 使用 `BV1LpD3YsETa?p=2`，Modal 明确选择 P2 后仅提交任务 `3703e39a-386b-4d10-ab28-a191754ef9d8` 一次；任务完成且来源为 `bilibili_multi_page`，笔记新增唯一非空 YSummary。写入后 SHA-256 为 `AD7C29330A01C3031456156C2F11ADB12320AEB183D943D3F53BFA2AB39A3D28`；移除该 Summary 区域可重建提交前哈希 `6C6503925CDBCDBA9FEF70AEB0E6D27A4B2C190DDA178DD3B66F6FD20661C4A1`。
- 真实验收发现摘要流程复用的 Modal 按钮仍写成 `Transcribe selected parts`。现已让 Modal 接受调用方文案，摘要流程显示 `Summarize selected parts`；完整退出并重启隔离 Vault 后通过原生 UI 确认，随后点击 Cancel，没有创建第二个付费任务。
- v0.7 双任务状态栏原生 UI 验收：隔离 Vault 同一笔记通过 `127.0.0.1:18765` 独立模拟服务同时保持一条转录和一条摘要任务。状态栏显示 `Video2Knowledge: 2 local tasks running.`；停止转录本地等待后恢复为单条 `DeepSeek summary: processing (42%).`，再停止摘要后状态栏隐藏。模拟服务记录 1 次 `/api/transcribe`、1 次 `/api/summarize`、32/23 次各自轮询，取消/删除/停止路由为 0。
- 双任务停止前后测试笔记保持完整且未生成受控区域，最终 SHA-256 为 `5C673FB98A3B3BAFD7729D7654D8ADE3F78557D65B4610AC95AEE95703B32FC5`。模拟服务已停止，`8000` 与 `18765` 均无监听，隔离插件地址恢复为 `http://127.0.0.1:8000`。
- v0.3 无可转写文字原生 UI 重放：独立模拟任务在首次轮询返回 failed，并携带仅用于验证泄露防护的后端阶段、错误和敏感标记；Obsidian 只显示固定 `Local ASR transcription failed.`。没有请求 transcript 下载，测试笔记 SHA-256 前后均为 `C7D051E7E5CC8F8378331BA847BEB219420E5A305F91D7B19C8D21C0C5555806`。
- v0.5 Bilibili 风控失败原生 UI 重放：`/api/bili-pages` 返回带敏感模拟 detail 的 HTTP 412；Obsidian 只显示 `Local ASR service request failed (HTTP 412).`，没有提交 `/api/transcribe` 或打开分 P Modal。测试笔记 SHA-256 前后均为 `F6C99D32A0AA16183F9CE8AD4CCB607701820613E56B73D253D1A3EE64C53E68`。
- 两类失败场景合计只有 1 次 health、1 次 YouTube transcribe、1 次任务轮询和 1 次 Bilibili preview；没有 transcript/summary 下载。模拟服务已停止，端口恢复为无监听，隔离插件地址恢复 `http://127.0.0.1:8000`。该证据验证真实插件 UI 与失败不写入语义，不扩写为真实后端再次复现风控。
- 隔离 Vault 与验收笔记保留。Chrome Default Profile 确认安装 Web Clipper 1.7.1；扩展 manifest 确认入口为 `popup.html`，快捷键为 `Ctrl+Shift+O`。在新建 YouTube 测试标签页中，页面自动化无法触发该 Chrome 扩展命令；随后对确定的 `chrome-extension://cnjifjpddelmedmihgijeibhnjfabmlf/popup.html` 入口进行一次直接访问，浏览器安全策略明确拒绝并禁止使用其他自动化通道绕过。因此模板导入和三类 URL 剪藏仍是外部人工闸门。

- 真实浏览器中的 Web Clipper 模板导入和三类 YouTube URL 手工验收；扩展已安装，但当前自动化不能控制扩展页面。
- 真实 Obsidian 命令交互已覆盖真实字幕、真实 ASR、Bilibili 多 P、目标切换、歧义 marker、幂等更新、插件重载与模拟后端双任务并发状态栏。
- DeepSeek 重复执行的受控区域幂等性仍由自动化和模拟后端证明；本轮遵守“最多一次真实摘要”约束，没有为重复 UI 验收再次计费。
- Bilibili DeepSeek 摘要真实联合验收已通过；真实重复执行仍受“一次付费提交”边界限制，其幂等性继续由自动化和模拟后端证明。
- v0.5 Phase A 隔离 Vault 已通过多 P Modal、受控区域幂等写入、无可转写文字任务失败和风控预览失败的原生 UI 验收；后两项使用独立模拟服务验证插件行为，真实后端失败证据仍采用既有黑盒结果。
- `Video2Knowledge-next` 后续联调前仍需重新冻结 HEAD、状态和接口契约；插件侧不得覆盖外部后端工作。
- v0.6 正式发布：公开仓库与静态发布候选已准备；GitHub Release 和社区目录提交仍待单独授权。
- v0.7 工作区改动尚未 commit 或 push；形成发布提交、版本提升和远端 CI 仍需单独执行。
