---
title: 做饭吧
emoji: 🍲
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 3000
pinned: false
---

# 做饭吧 · Docker Space

这是给 Hugging Face Spaces 用的说明文件（含 Docker 必需的 YAML 头）。

上传整个项目到 Space 仓库即可自动构建运行。

注意：Space 的磁盘是临时的，容器重启后 `data/` 与上传图片会清空。
如需长期保存，请参考 DEPLOY.md 里的「数据持久化」章节。
