# PROJECT_STATUS.md

## 当前阶段

v0.6 公开仓库基线已建立：产品身份、发布文档、最小权限 CI、人工 Release workflow、依赖审计和静态发布候选均已完成并推送。v0.5 Phase A 离线实现和后端真实契约验收已完成；真实 Obsidian 命令交互仍待验收，真实 DeepSeek 因本机没有已保存 Key 而未发起。

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

## 待确认

- 真实浏览器中的 Web Clipper 模板导入和三类 YouTube URL 手工验收；扩展已安装，但当前自动化不能控制扩展页面。
- 真实 Obsidian 命令交互：时间戳隔离 Vault 已在本机临时目录注册并打开目标笔记；当前自动化未暴露原生 Obsidian 窗口。具体本机路径不写入公开仓库。
- 真实 DeepSeek 摘要验收；当前后端没有为 `api.deepseek.com` 保存 Key，未发起真实 LLM 请求。
- v0.5 Phase A 隔离 Vault 实机验收：多 P Modal、无可转写文字、风控失败和受控区域幂等写入。
- `Video2Knowledge-next` 后续联调前仍需重新冻结 HEAD、状态和接口契约；插件侧不得覆盖外部后端工作。
- v0.6 正式发布：公开仓库与静态发布候选已准备；GitHub Release 和社区目录提交仍待单独授权。
