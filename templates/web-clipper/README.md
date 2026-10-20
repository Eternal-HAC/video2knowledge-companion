# Video2Knowledge Web Clipper 模板

`video2knowledge-youtube.json` 是官方 Obsidian Web Clipper 可导入的 YouTube 模板。

## 导入

1. 安装并打开官方 Obsidian Web Clipper。
2. 打开扩展设置，进入任一模板页面。
3. 点击右上角 **Import**，选择 `video2knowledge-youtube.json`；也可以把 JSON 文件拖入模板区域。
4. 保持 `path` 为空，或在 Web Clipper 中按自己的 Vault 结构设置保存目录。

官方导入说明见 [Obsidian Web Clipper Templates](https://github.com/obsidianmd/obsidian-help/blob/master/en/Obsidian%20Web%20Clipper/Templates.md)。

## 标准工作流

1. 在 YouTube 视频页使用 Web Clipper 创建笔记。
2. 打开新笔记，确认属性中存在 `source`，其值为原始 YouTube URL。
3. 运行 Obsidian 命令 **Insert YouTube transcript**。
4. 插件会读取 `source`，在安全受控区域中写入或刷新 transcript；用户正文和 Frontmatter 保持在区域之外。

## 设计边界

- 模板只负责网页元数据、描述和用户笔记骨架。
- 模板不使用 Web Clipper 的 `{{transcript}}`，也不预写插件保留 marker。transcript 只有一个写入责任方。
- 模板不使用 Interpreter prompt variables，不触发 LLM 调用。
- 模板不保存 API key、token 或 Cookie。
- 不建议把 Quick Clip 当作 transcript 生成路径。Web Clipper 的异步 YouTube transcript 提取曾出现保存时序和站点兼容问题，本模板把 transcript 获取留给 Obsidian 插件。

相关上游信息：

- [Web Clipper variables](https://github.com/obsidianmd/obsidian-help/blob/master/en/Obsidian%20Web%20Clipper/Variables.md)
- [官方 Web Clipper 仓库](https://github.com/obsidianmd/obsidian-clipper)
- [社区 YouTube 模板参考](https://github.com/community-archive/web-clipper-templates/blob/main/templates/youtube-with-transcript-clipper.json)
- [Quick Clip 异步 transcript 竞态](https://github.com/obsidianmd/obsidian-clipper/issues/967)
- [YouTube transcript 提取兼容问题](https://github.com/obsidianmd/obsidian-clipper/issues/946)

## 手工验收

仓库测试只能验证 JSON 和模板契约。发布前仍需在真实浏览器中完成：

1. 导入模板并确认没有校验错误。
2. 分别剪藏 `www.youtube.com/watch`、`m.youtube.com/watch` 和 `youtu.be` 页面。
3. 确认生成的笔记含 `source` 属性，且没有自动 transcript 或 `YTranscript` marker。
4. 在 Obsidian 中运行插件命令，确认 transcript 写入受控区域。
5. 再次运行命令，确认只更新受控区域，用户笔记保持不变。
