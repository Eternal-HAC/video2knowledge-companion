# UPSTREAM.md

## 上游仓库

- **仓库**：https://github.com/lstrzepek/obsidian-yt-transcript
- **当前基线 commit**：24cebbcefab5ea3d320cfa8826e0070a44f487ce
- **当前标签**：1.4.0
- **License**：MIT（完整文本见 LICENSE）
- **原作者**：Łukasz Strzępek

## 关系说明

本项目 Video2Knowledge Companion 是 obsidian-yt-transcript 的 derivative/fork。项目引导阶段已将原上游 remote 命名为 `upstream`，并将其 push URL 设为 `DISABLED`，防止误推。本项目 `origin` 指向 `https://github.com/Eternal-HAC/video2knowledge-companion`，默认分支为 `main`。

## 保留内容

- 上游 LICENSE、完整 Git 历史、源码结构与测试；README.md、manifest.json 和 package.json 已在 v0.6 产品身份迁移阶段改为本项目身份。
- 上游 STYLE.md、CLAUDE.md 作为代码风格与架构参考。

## 变更范围

- 项目文档与 v0.1 Frontmatter 读取、受控区域写入、目标绑定和并发保护。
- 复用上游字幕获取及格式化；新增 adapter 单元测试和 Obsidian mock。
- v0.2 新增官方 Obsidian Web Clipper 可导入模板、导入说明和模板契约测试；未复制或修改 Web Clipper 源码。
- 插件依赖仍沿用现有锁文件，产品阶段的真实网络与本地后端验收记录见 `PROJECT_STATUS.md` 和 `DECISIONS.md`。
