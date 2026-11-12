# 做饭吧 v5 · 部署指南（免费托管）

> 本文所有额度信息来自各平台**官方定价页 / 官方文档**，核实日期：2026-11-12。
> 免费额度变动频繁，正式使用前建议再扫一眼官方页面。

---

## 0. 先看清楚：这个项目需要什么样的托管

它不是纯静态网页，因此**必须**满足两条：

| 需求 | 说明 | 为什么纯静态平台不行 |
|------|------|---------------------|
| 常驻 Node 进程 | `server.js` 持续监听端口，提供 30+ 个 HTTP 接口 | Vercel / Netlify 的 Serverless 是请求驱动，无长驻进程 |
| 可写磁盘 | `data/db.json` 存用户/绑定/订单，`public/uploads/` 存帖子图片 | 静态托管不能写文件 |

结论：**Vercel、Netlify、Cloudflare Pages、GitHub Pages 都不适用**，不要在这上面浪费时间。

---

## 1. 平台对比（按「能不能免费用起来」排序）

| 平台 | 免费额度 | 要绑卡吗 | 常驻进程 | 数据持久 | 休眠 | 结论 |
|------|---------|---------|---------|---------|------|------|
| **Render** | 免费 Web Service：512MB RAM、每月 750 实例小时 | ❌ 不用 | ✅ | ❌ 临时磁盘 | 约 15 分钟无请求休眠，来请求自动唤醒（约 1 分钟） | ⭐ **首选**：官方文档明确写 "No payment is required" |
| **Hugging Face Spaces** | CPU Basic：2 vCPU / 16GB RAM，永久免费 | ❌ 不用 | ✅ Docker | ❌ 重启即丢（可挂 Storage Bucket） | 不休眠 | ⭐ **备选**：配置最高，但页面是公开的 |
| **Railway** | 注册送 $5 试用额度（30 天有效） | ❌ 不用 | ✅ | ❌ | 不休眠 | 短期试用可以；试用后 Free 计划需 $1/月，**不是永久免费** |
| Zeabur | Free 计划额度为 0（daily/monthly quota 均为 0，域名 0） | ❌ 不用 | — | — | — | ⚠️ **免费档无法部署**，实际最低要 Dev $5/月（前 14 天免费） |
| Koyeb | 免费 nano 实例已取消 | 需卡 | ✅ | — | — | ❌ 不推荐 |

> ⚠️ 上一版资料里把 Zeabur 写成「$5 额度/月免费」、把 Railway 写成永久免费，都是**过时信息**。
> 我已按官方定价页更正。

---

## 2. 方案 A：Render 部署（推荐，全程不用绑卡）

### 2.1 准备

1. 注册 Render：https://dashboard.render.com/register
   → 可直接用 GitHub 账号登录，省去单独注册
2. 把项目推到 GitHub（Render 从 Git 仓库拉代码）
   - 新建一个空仓库，把本目录除 `data/db.json` 外的内容推上去
   - 项目已带 `.gitignore`，会自动忽略 `data/db.json` 和用户上传的图片

### 2.2 创建服务

1. 登录后点右上角 **+ New** → **Web Service**
2. 选择你的仓库 → **Connect**
3. 按下表填写（其余留默认）：

| 字段 | 填写内容 |
|------|---------|
| Name | `zuofanba`（决定网址前缀） |
| Language / Runtime | `Node` |
| Branch | `main`（你实际用的分支） |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** ← 关键，别选错 |

4. 环境变量（可选）：`NODE_ENV=production`
5. 点 **Deploy Web Service**

### 2.3 拿到网址

部署完成（状态变 **Live**）后，页面顶部会给你一个：

```
https://zuofanba-xxxx.onrender.com
```

这就是可以直接点开、发给对方的链接。手机浏览器打开后「添加到主屏幕」即可当 App 用。

### 2.4 也可以不连 GitHub，用 Docker 部署

Render 支持 Docker：仓库里已有 `Dockerfile`，创建服务时 Runtime 选 **Docker** 即可，其余不用填。

### 2.5 免费实例的三个真实限制（务必知道）

1. **15 分钟休眠**：没人访问就睡，下一次访问要等约 1 分钟才醒（页面会显示 loading）
   - 想常醒：用 UptimeRobot（https://uptimerobot.com）每 5 分钟 ping 一次你的网址
   - 但注意每月只有 **750 实例小时**，整月不停机约需 720 小时，几乎吃满，没有余量
2. **磁盘是临时的**：每次重新部署 / 重启 / 休眠唤醒，`data/db.json` 和上传的图片都会**清空**
   - 免费实例**不支持挂持久磁盘**（那是付费功能）
3. 带宽：每月 5GB 出站，超出后若无付款方式，免费服务会被暂停到月底

> 如果数据不能丢，看第 4 节「数据持久化」。

---

## 3. 方案 B：Hugging Face Spaces（配置最高，不用绑卡）

免费档给 2 vCPU + 16GB 内存，比 Render 大方得多，缺点是完全公开、且中文用户访问速度一般。

1. 注册：https://huggingface.co/join
2. 新建 Space：https://huggingface.co/new-space
   - **SDK 选 `Docker`**
   - Hardware 选 **CPU basic（Free）**
   - 可见性选 **Public**（免费档只能公开）
3. 上传项目文件，**关键一步**：把 `README-hf-spaces.md` 重命名为 `README.md` 再传
   （里面写了 `sdk: docker` 和 `app_port: 3000`，缺了它 Space 起不来）
4. 点 Commit，等待构建完成
5. 地址形如：
   ```
   https://huggingface.co/spaces/你的用户名/zuofanba
   ```
   实际应用在 `https://用户名-zuofanba.hf.space`

注意事项：
- 容器以 UID 1000 运行，`Dockerfile` 里已用 `node` 用户并 `chown`，无需改
- 默认端口是 7860，本项目用 3000，所以 `app_port: 3000` 必须写
- 磁盘重启即丢；要持久化可挂 **Storage Bucket**（付费），或把 `DATA_DIR` 指向 `/data`

---

## 4. 数据持久化（重要）

免费平台普遍是「临时磁盘 + 重启即丢」。想让账号、绑定、点菜记录、帖子图片长期存在，三条路：

### 4.1 挂持久卷（最省事，但要一点钱）

本项目已支持：把数据目录交给环境变量即可。

| 平台 | 怎么做 | 花费 |
|------|--------|------|
| Render | 服务改成 **Starter** 计划 → Disks → Add Disk，Mount Path 填 `/var/data`；环境变量设 `DATA_DIR=/var/data`、`UPLOAD_DIR=/var/data/uploads` | 约 $7/月 + 磁盘 $0.25/GB/月 |
| HF Spaces | Settings → Storage → 挂 Bucket 到 `/data`；设 `DATA_DIR=/data`、`UPLOAD_DIR=/data/uploads` | 按容量计费 |

已经验证过：设置 `DATA_DIR` / `UPLOAD_DIR` 后，服务会正常读写该目录，且 `/uploads/xxx.jpg` 能正确返回图片（实测 200 + `image/jpeg`）；菜谱库会自动补种到新目录。

### 4.2 换成外部数据库（免费额度更友好）

把 `data/db.json` 换成 MongoDB Atlas 免费档（512MB，https://www.mongodb.com/cloud/atlas/register）。
需要改 `server.js` 里的 `loadDB` / `saveNow` 两个函数，其余代码不用动。

### 4.3 接受重置

如果只是家人之间临时用、数据丢了也无所谓，那免费档直接用就好。

---

## 5. 方案 C：完全免费且不注册 —— 跑在自己电脑上

如果不想注册任何平台，就在自己的电脑上跑，同一个 WiFi 下手机可直接访问：

```bash
# 1. 装 Node.js 18+：https://nodejs.org
# 2. 进入项目目录
cd 做饭吧App-v5
# 3. 启动
npm start
```

- 本机访问：http://localhost:3000
- 手机访问：http://你电脑的局域网IP:3000（如 `192.168.1.5:3000`）
  - Windows 查 IP：`ipconfig`
  - macOS 查 IP：`ifconfig | grep "inet "`
- 想让外网也能访问（临时）：在电脑上装 Cloudflare Tunnel
  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```
  会给你一个 `https://xxx.trycloudflare.com` 的临时公网地址，电脑关了就失效。

这条路的优点：**零成本、零注册、数据完全在自己机器上、不限速不限时**。

---

## 6. 常见问题

**Q：部署后打开是 502 / 一直在 loading？**
A：Render 免费实例在睡着，等 30–60 秒自动唤醒。持续 502 就看 Deploys 页面的日志。

**Q：注册了但数据没了？**
A：免费实例重新部署或休眠唤醒会清空临时磁盘，见第 4 节。

**Q：能不能让它不休眠？**
A：免费实例做不到，这是平台强制的。要么用 UptimeRobot 定时 ping（吃额度），要么付费。

**Q：手机能装成 App 吗？**
A：能。用手机浏览器打开你的网址 → 安卓 Chrome 菜单里「添加到主屏幕」，iOS Safari 分享按钮里「添加到主屏幕」。项目已带 `manifest.webmanifest` 和图标，装出来有独立图标。

**Q：83 道菜谱在哪？**
A：`data/recipes.json`，只读种子数据。即使数据目录换了位置，服务也会自动把它复制过去。

---

## 7. 文件清单

```
做饭吧App v5/
├── server.js              # 后端（零外部依赖，Node 18+）
├── package.json           # npm start / npm test
├── Dockerfile             # Docker / HF Spaces 用
├── render.yaml            # Render 蓝图（可一键部署）
├── README-hf-spaces.md    # HF Spaces 用，需改名成 README.md
├── DEPLOY.md              # 本文件
├── deploy-nav.html        # 可点击的部署导航页（浏览器打开）
├── public/                # 前端
│   ├── index.html
│   ├── app1.js / app2.js
│   ├── styles.css
│   ├── manifest.webmanifest
│   ├── icon-192.png / icon-512.png
│   └── uploads/           # 用户上传图片
├── data/
│   ├── db.json            # 业务数据
│   └── recipes.json       # 83 道菜谱
└── tests/
    ├── test-e2e.js        # 后端 60+ 断言
    └── test-ui.js         # 前端 30+ 操作
```

---

## 8. 环境变量速查

| 变量 | 默认值 | 作用 |
|------|--------|------|
| `PORT` | `3000` | 监听端口（平台会自动注入） |
| `DATA_DIR` | `./data` | 数据目录，指向持久卷可防丢数据 |
| `UPLOAD_DIR` | `./public/uploads` | 图片目录，指向持久卷可防丢图 |
| `NODE_ENV` | — | 设 `production` |

启动日志会打印实际使用的数据文件路径，方便确认有没有生效：

```
做饭吧 v4 已启动: http://localhost:3000
数据文件: /var/data/db.json
```
