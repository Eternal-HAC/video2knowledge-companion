# AGENTS.md

## 项目规则

- 项目名称：Video2Knowledge Companion for Obsidian（暂定）。
- 上游基础：obsidian-yt-transcript（MIT License，作者 Łukasz Strzępek）。
- 源码目录：src/；构建入口 src/obsidian/plugin.ts。
- 运行目标：Obsidian 桌面端与移动端，TypeScript / esbuild / Jest。
 - LICENSE 和上游版权声明不得删除。
 - README、manifest.json、package.json 可在正式 adoption 阶段按产品身份和构建需要修改；当前引导阶段暂未修改它们。
- 不添加 TODO.md、PROJECT_SNAPSHOT.md、PROGRAM_MAP.md、CHANGELOG.md。
- 不安装依赖、不运行真实 provider 网络调用，除非当前阶段明确授权。
- 不提交、不推送、不创建 fork/PR/tag/branch，除非用户明确授权。

## 开发循环

1. 阅读 PRD.md、ROADMAP.md、PROJECT_STATUS.md、DECISIONS.md、UPSTREAM.md。
2. 小步修改；优先复用上游现有结构与风格（参见 STYLE.md、CLAUDE.md）。
3. 运行 "npm test"、"npm run lint"、"npm run build" 验证。
4. 记录设计决策到 DECISIONS.md；更新 PROJECT_STATUS.md 进度。

## 安全边界

- 原始 transcript 必须保留；LLM 失败不能导致 transcript 丢失。
- 不得静默覆盖用户笔记内容。
- 不得泄露 API keys、tokens、cookies。
- 不处理抖音登录、小鹅通、Cookie 自动管理、自研下载器、自研 ASR 框架、Agent/MCP、完整浏览器扩展。
