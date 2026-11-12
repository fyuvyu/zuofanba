# 吃饭吧 v6 · MongoDB 接入说明

> 对应 `server.js` 中的 `initStore()` / `writeMongoNow()` / `save()` / `saveNow()`。
> 设计原则：**MongoDB 是可选的**。不配 `MONGODB_URI` 时行为与 v5 完全一致（写本地 JSON），
> 配了就自动切到云端，代码无需改动、接口无需改动。

---

## 1. 它是怎么工作的

服务启动时 `initStore()` 按顺序判断：

```
有 MONGODB_URI ?
├─ 没有            → 用本地 data/db.json（和以前一样）
└─ 有
   ├─ 装没装 mongodb 包 ?
   │  ├─ 没装      → 打警告，回退本地（不会崩溃）
   │  └─ 装了      → 尝试连接
   │     ├─ 连不上 → 打警告，回退本地（不会崩溃）
   │     └─ 连上了 → 从云端载入数据
   │        ├─ 云端已有数据 → 直接用
   │        └─ 云端是空的   → 把本地现有数据作为初始值传上去
```

**关键点：任何一步失败都不会让网站打不开**，只会退回到本地文件，并在启动日志里说清楚。

## 2. 存储结构

不用建集合、不用建索引、不用设计表结构。整份业务数据作为一个文档存：

| 项 | 值 |
|----|-----|
| 数据库 | `zuofanba`（可用 `MONGODB_DB` 改） |
| 集合 | `appstate`（可用 `MONGODB_COLLECTION` 改） |
| 文档 `_id` | `"singleton"`（固定单文档） |
| 业务数据字段 | `data` |
| 更新时间 | `updatedAt` |

文档长这样：

```json
{
  "_id": "singleton",
  "data": {
    "users": [], "binds": [], "codes": [], "orders": [],
    "menus": [], "posts": [], "tokens": {}, "seq": 1000
  },
  "updatedAt": "2026-11-12T01:00:00.000Z"
}
```

**为什么这么设计**：原项目所有接口都在读写内存里的同一个 `db` 对象，改成「整份文档 upsert」后，
**30 多个接口一行都不用改**。写入做 120ms 防抖合并，避免频繁请求把免费额度打爆。

代价是：数据量大到几十万条时会有性能压力。家务级应用（一家几口、几百条记录）完全够用。
真要上规模，再按集合拆表。

## 3. 配置步骤

### 3.1 注册 MongoDB Atlas（免费，不用绑卡）

1. 打开 https://www.mongodb.com/cloud/atlas/register
2. 用邮箱或 Google 账号注册
3. 创建集群时选 **M0 Free**（512MB 存储，永久免费）
4. 区域选 **Singapore** 或 **Hong Kong**（离国内近，延迟低）

### 3.2 开放网络访问

左侧 **Network Access** → **Add IP Address** → 选 **Allow Access from Anywhere**（`0.0.0.0/0`）

> 说明：免费托管平台的出口 IP 不固定，只能放开全部。安全性由数据库密码保证，
> 密码请用强密码，不要用 `123456`。

### 3.3 创建数据库用户

左侧 **Database Access** → **Add New Database User**
- Authentication Method：**Password**
- Username：如 `zuofanba`
- Password：点 **Autogenerate Secure Password** 生成，**复制保存下来**

### 3.4 拿到连接串

左侧 **Database** → 集群卡片上点 **Connect** → **Drivers** → 复制那串：

```
mongodb+srv://zuofanba:<db_password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

把 `<db_password>` 换成你刚才的密码。**注意密码里的特殊字符要 URL 编码**
（`@` → `%40`，`#` → `%23`，`/` → `%2F`，`:` → `%3A`）。

### 3.5 填到托管平台

在 Render / HF Spaces 的环境变量里加：

| 变量名 | 值 | 必填 |
|--------|-----|------|
| `MONGODB_URI` | 上面那串连接串 | ✅ |
| `MONGODB_DB` | `zuofanba` | 可选，默认就是它 |
| `MONGODB_COLLECTION` | `appstate` | 可选，默认就是它 |
| `MONGODB_TIMEOUT` | `8000` | 可选，连接超时毫秒数 |

### 3.6 确认生效

部署后看启动日志，出现这句就成功了：

```
[store] MongoDB 已连接，数据已从云端载入（zuofanba.appstate）
做饭吧 v5 已启动: http://localhost:3000
存储后端: MongoDB (zuofanba.appstate)
```

如果看到回退提示，说明连接有问题：

```
[store] MongoDB 连接失败，回退本地 JSON：<具体原因>
```

常见原因见第 5 节。

## 4. 本地测试

```bash
# 不带 URI：走本地文件
npm start

# 带 URI：走 MongoDB
MONGODB_URI="mongodb+srv://user:pass@cluster0.xxx.mongodb.net/?retryWrites=true" npm start
```

需要先装依赖（`mongodb` 在 `optionalDependencies` 里，一般会自动装；
若被跳过就手动装）：

```bash
npm install mongodb
```

## 5. 排错

| 现象 | 原因 | 解决 |
|------|------|------|
| `MongoServerSelectionError: connect ETIMEDOUT` | Network Access 没放行 | 加 `0.0.0.0/0` |
| `Authentication failed` | 密码错 / 特殊字符没编码 | 重新生成密码，特殊字符 URL 编码 |
| `querySrv ENOTFOUND` | 连接串写错 / 用的是 `mongodb+srv` 但 DNS 不通 | 检查连接串；或改用 `mongodb://` 直连串 |
| `Cannot find module 'mongodb'` | 依赖没装 | `npm install mongodb` |
| 日志显示连上了，但数据没变 | 看的是别的库/集合 | 核对 `MONGODB_DB`、`MONGODB_COLLECTION` |
| 数据偶尔回退到旧状态 | 免费集群被暂停（M0 长期无访问会暂停） | Atlas 控制台点 **Resume**，或定期访问 |

## 6. 和持久磁盘方案怎么选

| 方案 | 成本 | 适合 |
|------|------|------|
| **MongoDB Atlas M0** | 免费 512MB | ⭐ 推荐。免费、换平台不用迁数据、不用绑卡 |
| Render 持久磁盘 | 约 $7/月 + $0.25/GB | 想全留在一个平台、不想依赖外部服务 |
| 本地 JSON | 免费 | 只在自己电脑上跑，或只是试用 |

**注意**：图片（`public/uploads/`）仍然存在本地磁盘。
要用 MongoDB 时，建议同时设 `UPLOAD_DIR` 指向持久卷；
或者图片丢了也无所谓（帖子图片属于可再发的数据）。

## 7. 安全提醒

- 连接串含密码，**不要提交到公开 GitHub 仓库**。本项目已用环境变量读取，代码里没有硬编码。
- 如果连接串泄露了，去 Atlas 控制台改密码即可，代码不用动。
- Atlas 免费档有 500 连接上限，M0 共享集群。本项目只在启动时建一个连接，完全够用。

---

## 8. 实测记录（2026-11-12 已验证）

用真实 Atlas 免费集群（M0）完成端到端验证，结论如下：

| 检查项 | 结果 |
|--------|------|
| 连接 | ✅ 成功（MongoDB Server 8.0.37） |
| 建库建集合 | ✅ 自动创建 `zuofanba.appstate`，无需手工建表 |
| 写入 | ✅ upsert 成功 |
| 回读 | ✅ 内容一致 |
| 服务启动日志 | ✅ `[store] MongoDB 已连接，数据已从云端载入` |
| 注册接口落库 | ✅ 注册后能直接在云端查到该用户 |
| 换机读取 | ✅ 服务重启后从云端载入，数据仍在 |
| 无 URI 回退 | ✅ 自动用本地 JSON |
| URI 无效回退 | ✅ 打警告、回退本地、网站照常打开 |

一个注意点：服务进程在内存里持有 `db` 对象，改动会以 120ms 防抖写回云端。
如果手工清空了云端文档但服务还在跑，下次有写入动作时会把内存里的旧数据重新写回去。
要彻底重置，先停服务、再清云端文档、最后启服务（顺序很重要）。
