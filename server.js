/**
 * 做饭吧 v4 · 后端服务（零外部依赖，Node 18+）
 * 启动：node server.js      默认 http://localhost:3000
 * 环境变量：PORT 端口
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
// DATA_DIR 可指向持久卷（如 Render Disk / HF Spaces /data），避免免费平台重启丢数据
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const PUB = path.join(ROOT, 'public');
// UPLOAD_DIR 同理，图片可落到持久卷；对外仍以 /uploads/ 访问
const UP = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(PUB, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UP, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'db.json');
const RECIPE_FILE = path.join(DATA_DIR, 'recipes.json');

/* ---------------- 数据层 ---------------- */
const EMPTY = () => ({ users: [], binds: [], codes: [], orders: [], menus: [], posts: [], tokens: {}, seq: 1000 });

function loadDB() {
  try {
    const d = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return Object.assign(EMPTY(), d);
  } catch (e) {
    return EMPTY();
  }
}
function loadLocalDB() {
  try { return Object.assign(EMPTY(), JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); }
  catch (e) { return EMPTY(); }
}

// 内存态始终是 db 对象；持久化后端二选一：
//   MONGODB_URI 有值 → 写入 MongoDB（整份文档 upsert），重启/换机不丢数据
//   否则            → 写入本地 data/db.json（持久卷挂载时同样可靠）
const MONGO_URI = process.env.MONGODB_URI || '';
const MONGO_DB_NAME = process.env.MONGODB_DB || 'zuofanba';
const MONGO_COLL = process.env.MONGODB_COLLECTION || 'appstate';
let db = loadDB();
let mongoClient = null, mongoCol = null, mongoReady = false;

function writeLocal() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); }
  catch (e) { console.error('[store] 本地写入失败:', e.message); }
}

async function writeMongoNow() {
  if (!mongoReady || !mongoCol) return;
  try {
    await mongoCol.updateOne(
      { _id: 'singleton' },
      { $set: { data: db, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (e) { console.error('[store] MongoDB 写入失败:', e.message); }
}

async function initStore() {
  if (!MONGO_URI) {
    console.log('[store] 使用本地 JSON 文件：' + DB_FILE);
    return;
  }
  let MongoClient;
  try {
    // 懒加载：未安装 mongodb 包时，只要有 URI 也不会崩溃，直接回退本地
    ({ MongoClient } = require('mongodb'));
  } catch (e) {
    console.warn('[store] 已设置 MONGODB_URI 但未安装 mongodb 包（npm install），回退本地 JSON');
    return;
  }
  try {
    mongoClient = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_TIMEOUT || 8000),
      connectTimeoutMS: Number(process.env.MONGODB_TIMEOUT || 8000)
    });
    await mongoClient.connect();
    mongoCol = mongoClient.db(MONGO_DB_NAME).collection(MONGO_COLL);
    const doc = await mongoCol.findOne({ _id: 'singleton' });
    if (doc && doc.data && Object.keys(doc.data).length) {
      db = Object.assign(EMPTY(), doc.data);
      mongoReady = true;
      console.log('[store] MongoDB 已连接，数据已从云端载入（' + MONGO_DB_NAME + '.' + MONGO_COLL + '）');
    } else {
      // 云端还没有数据：把本地已有的（或空的）作为初始数据写上去
      const local = loadLocalDB();
      db = local;
      mongoReady = true;
      await writeMongoNow();
      console.log('[store] MongoDB 已连接，已创建初始数据（' + MONGO_DB_NAME + '.' + MONGO_COLL + '）');
    }
  } catch (e) {
    mongoReady = false;
    console.warn('[store] MongoDB 连接失败，回退本地 JSON：' + e.message);
  }
}

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (mongoReady) writeMongoNow(); else writeLocal();
  }, 120);
}
function saveNow() {
  if (mongoReady) { writeMongoNow(); return; }
  writeLocal();
}
// 退出前尽量把最后一次改动落盘
async function flushAndExit(code) {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    if (mongoReady) await writeMongoNow(); else writeLocal();
  } catch (e) {}
  try { if (mongoClient) await mongoClient.close(); } catch (e) {}
  process.exit(code);
}
process.on('SIGINT', () => { flushAndExit(0); });
process.on('SIGTERM', () => { flushAndExit(0); });

function nid(p) { db.seq += 1; return (p || 'id') + db.seq.toString(36) + crypto.randomBytes(2).toString('hex'); }
function token() { return crypto.randomBytes(24).toString('hex'); }
function hashPwd(pwd, salt) {
  return crypto.scryptSync(String(pwd), salt, 32).toString('hex');
}
function pick(arr, n) { const o = {}; (arr || []).forEach(k => { o[k] = 1; }); return o; }
function num(v, d) { const n = Number(v); return isFinite(n) ? n : d; }

/* ---------------- 83 道菜谱（只读库） ---------------- */
let LIB = { recipes: [], categories: [] };
// 菜谱库是只读种子数据：优先 DATA_DIR，其次项目自带 data/；持久卷为空时自动补种
const RECIPE_SEED = path.join(ROOT, 'data', 'recipes.json');
(function loadLib() {
  const tries = [RECIPE_FILE, RECIPE_SEED];
  for (const f of tries) {
    try {
      LIB = JSON.parse(fs.readFileSync(f, 'utf8'));
      // 若读的是项目自带种子且 DATA_DIR 是别处（持久卷），把种子复制过去，方便后续一致读取
      if (f === RECIPE_SEED && path.resolve(RECIPE_SEED) !== path.resolve(RECIPE_FILE)) {
        try { fs.copyFileSync(RECIPE_SEED, RECIPE_FILE); } catch (e2) {}
      }
      return;
    } catch (e) {}
  }
  console.warn('recipes.json 未找到，菜谱库为空');
})();
const RECIPE_BY_ID = {};
LIB.recipes.forEach(r => { RECIPE_BY_ID[r.id] = r; });

/* ---------------- HTTP 工具 ---------------- */
function send(res, code, obj) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 14 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};

function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  // UPLOAD_DIR 指向持久卷时，/uploads/* 直接由该目录响应
  if (p.startsWith('/uploads/') && path.resolve(UP) !== path.resolve(path.join(PUB, 'uploads'))) {
    const upFile = path.join(UP, path.normalize(p.slice('/uploads/'.length)).replace(/^(\.\.[\/\\])+/, ''));
    if (!upFile.startsWith(path.resolve(UP))) { res.writeHead(403); return res.end('forbidden'); }
    return fs.readFile(upFile, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      out200(req, res, path.extname(upFile).toLowerCase(), buf);
    });
  }
  const full = path.join(PUB, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!full.startsWith(PUB)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(full, (err, buf) => {
    if (err) {
      // SPA 回退
      fs.readFile(path.join(PUB, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); return res.end('not found'); }
        out200(req, res, '.html', html);
      });
      return;
    }
    out200(req, res, path.extname(full).toLowerCase(), buf);
  });
}

/* 文本资源一律 gzip 传输：公网隧道对大响应会截断，压缩后每包都很小 */
const GZ = {};
function out200(req, res, ext, buf) {
  const type = MIME[ext] || 'application/octet-stream';
  const compressible = /^\.(html|js|css|json|svg|webmanifest|txt)$/.test(ext);
  const ae = String(req.headers['accept-encoding'] || '');
  if (compressible && /\bgzip\b/.test(ae) && buf.length > 800) {
    let g = GZ[ext + ':' + buf.length];
    if (!g) { g = require('zlib').gzipSync(buf, { level: 9 }); GZ[ext + ':' + buf.length] = g; }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Encoding': 'gzip',
      'Content-Length': g.length,
      'Cache-Control': 'no-store',
      'Vary': 'Accept-Encoding'
    });
    return res.end(g);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
  res.end(buf);
}

/* ---------------- 鉴权 ---------------- */
function authUser(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : (req.headers['x-token'] || '');
  if (!t) return null;
  const uid = db.tokens[t];
  if (!uid) return null;
  return db.users.find(u => u.id === uid) || null;
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, nick: u.nick, emoji: u.emoji || '🙂', bio: u.bio || '',
    phoneMask: u.phone ? u.phone.slice(0, 3) + '****' + u.phone.slice(-4) : '',
    followers: countFollowers(u.id), following: (u.following || []).length,
    posts: db.posts.filter(p => p.author === u.id).length,
    theme: u.theme || 'sunset', icon: u.icon || '🍲', bg: u.bg || 'none'
  };
}
function countFollowers(uid) { return db.users.filter(u => (u.following || []).includes(uid)).length; }

function bindsOf(uid) {
  return db.binds.filter(b => b.a === uid || b.b === uid);
}
function partnerIds(uid) {
  return bindsOf(uid).map(b => (b.a === uid ? b.b : b.a));
}

/* ---------------- 业务逻辑 ---------------- */

function register(body) {
  const phone = String(body.phone || '').replace(/\s/g, '');
  const pwd = String(body.pwd || '');
  const nick = String(body.nick || '').trim();
  if (!/^1\d{10}$/.test(phone)) return { error: '手机号格式不对（11 位，1 开头）' };
  if (pwd.length < 6) return { error: '密码至少 6 位' };
  if (!nick) return { error: '请填一个昵称' };
  if (nick.length > 12) return { error: '昵称最多 12 个字' };
  if (db.users.some(u => u.phone === phone)) return { error: '这个手机号已经注册过了，直接登录吧' };
  const salt = crypto.randomBytes(8).toString('hex');
  const u = {
    id: nid('u'), phone, salt, pwd: hashPwd(pwd, salt), nick,
    emoji: String(body.emoji || '🙂').slice(0, 4),
    bio: '', following: [], createdAt: Date.now(),
    theme: 'sunset', icon: '🍲', bg: 'none'
  };
  db.users.push(u);
  // 默认给新用户建一个「我的私房菜单」
  db.menus.push({
    id: nid('m'), owner: u.id, name: '我的私房菜单', emoji: '🍱',
    members: [], items: [], createdAt: Date.now()
  });
  const t = token();
  db.tokens[t] = u.id;
  saveNow();
  return { token: t, user: publicUser(u) };
}

function login(body) {
  const phone = String(body.phone || '').replace(/\s/g, '');
  const pwd = String(body.pwd || '');
  const u = db.users.find(x => x.phone === phone);
  if (!u) return { error: '这个手机号还没注册' };
  if (hashPwd(pwd, u.salt) !== u.pwd) return { error: '密码不对' };
  const t = token();
  db.tokens[t] = u.id;
  saveNow();
  return { token: t, user: publicUser(u) };
}

/* --- 随机 6 位绑定码，5 分钟有效 --- */
function makeCode(uid) {
  db.codes = db.codes.filter(c => c.exp > Date.now());
  let code = '';
  do { code = String(crypto.randomInt(100000, 1000000)); }
  while (db.codes.some(c => c.code === code));
  const rec = { code, owner: uid, exp: Date.now() + 5 * 60 * 1000, createdAt: Date.now() };
  db.codes.push(rec);
  save();
  return { code, exp: rec.exp, ttl: 300 };
}

function useCode(uid, rawCode, rel) {
  const code = String(rawCode || '').replace(/\D/g, '');
  if (code.length !== 6) return { error: '请输入 6 位数字验证码' };
  db.codes = db.codes.filter(c => c.exp > Date.now());
  const rec = db.codes.find(c => c.code === code);
  if (!rec) return { error: '验证码不对，或者已经过期了（有效期 5 分钟），让对方重新生成' };
  if (rec.owner === uid) return { error: '不能绑定自己' };
  const exists = db.binds.find(b =>
    (b.a === uid && b.b === rec.owner) || (b.b === uid && b.a === rec.owner));
  if (exists) return { error: '你们已经绑定过了' };
  const b = {
    id: nid('b'), a: uid, b: rec.owner, rel: String(rel || '家人').slice(0, 6),
    since: Date.now(), by: uid
  };
  db.binds.push(b);
  db.codes = db.codes.filter(c => c.code !== code);
  saveNow();
  return { bind: bindView(b, uid) };
}

function bindView(b, me) {
  const other = db.users.find(u => u.id === (b.a === me ? b.b : b.a));
  return {
    id: b.id, rel: b.rel, since: b.since,
    user: other ? publicUser(other) : { id: b.a, nick: '已注销', emoji: '🙂' }
  };
}

/* --- 订单 --- */
function createOrder(uid, body) {
  let to = body.to;
  if (to === 'self') to = uid;
  const target = db.users.find(u => u.id === to);
  if (!target) return { error: '接收人不存在' };
  if (to !== uid && !partnerIds(uid).includes(to)) return { error: '只能点给已绑定的家人，或点给自己' };
  const items = (body.items || []).map(it => ({
    rid: String(it.rid || ''), title: String(it.title || '').slice(0, 40),
    emoji: String(it.emoji || '🍽').slice(0, 4), q: Math.max(1, num(it.q, 1))
  })).filter(it => it.title);
  if (!items.length) return { error: '还没选菜' };
  const o = {
    id: nid('o'), from: uid, to, items,
    note: String(body.note || '').slice(0, 200),
    ts: Date.now(), status: 'sent', reply: '', repliedAt: 0, seenByTo: false
  };
  db.orders.push(o);
  saveNow();
  return { order: orderView(o, uid) };
}

function orderView(o, me) {
  const f = db.users.find(u => u.id === o.from);
  const t = db.users.find(u => u.id === o.to);
  // 自己点给自己的单子，对本人来说永远是「我要做」（in），否则没法做好并回话
  const dir = (o.from === me && o.to !== me) ? 'out' : 'in';
  return {
    id: o.id, dir: dir,
    from: f ? { id: f.id, nick: f.nick, emoji: f.emoji } : { id: o.from, nick: '已注销', emoji: '🙂' },
    to: t ? { id: t.id, nick: t.nick, emoji: t.emoji } : { id: o.to, nick: '已注销', emoji: '🙂' },
    items: o.items, note: o.note, ts: o.ts,
    status: o.status, reply: o.reply, repliedAt: o.repliedAt, seenByTo: o.seenByTo
  };
}

function visibleMenus(uid) {
  return db.menus.filter(m => m.owner === uid || (m.members || []).includes(uid));
}
function menuView(m, uid) {
  const owner = db.users.find(u => u.id === m.owner);
  return {
    id: m.id, name: m.name, emoji: m.emoji, owner: m.owner,
    ownerNick: owner ? owner.nick : '已注销',
    mine: m.owner === uid,
    members: (m.members || []).map(id => {
      const u = db.users.find(x => x.id === id);
      return u ? { id: u.id, nick: u.nick, emoji: u.emoji } : { id, nick: '已注销', emoji: '🙂' };
    }),
    items: m.items, count: m.items.length, createdAt: m.createdAt
  };
}

function postView(p, uid) {
  const a = db.users.find(u => u.id === p.author);
  return {
    id: p.id, title: p.title, text: p.text, steps: p.steps, photos: p.photos || [],
    author: a ? { id: a.id, nick: a.nick, emoji: a.emoji } : { id: p.author, nick: '已注销', emoji: '🙂' },
    createdAt: p.createdAt,
    likeCount: (p.likes || []).length, liked: (p.likes || []).includes(uid),
    favCount: (p.favorites || []).length, faved: (p.favorites || []).includes(uid),
    commentCount: (p.comments || []).length,
    comments: (p.comments || []).slice(-20).map(c => {
      const cu = db.users.find(u => u.id === c.uid);
      return { id: c.id, nick: cu ? cu.nick : '已注销', emoji: cu ? cu.emoji : '🙂', text: c.text, ts: c.ts };
    }),
    followingAuthor: (db.users.find(u => u.id === uid)?.following || []).includes(p.author),
    isMine: p.author === uid
  };
}

function syncPayload(uid) {
  const me = db.users.find(u => u.id === uid);
  const partners = bindsOf(uid).map(b => bindView(b, uid));
  const inOrders = db.orders.filter(o => o.to === uid).sort((a, b) => b.ts - a.ts).slice(0, 60);
  const outOrders = db.orders.filter(o => o.from === uid && o.to !== uid).sort((a, b) => b.ts - a.ts).slice(0, 60);
  const unread = inOrders.filter(o => !o.seenByTo).length;
  const needDo = inOrders.filter(o => o.status !== 'done').length;
  return {
    user: publicUser(me),
    partners,
    orders: { in: inOrders.map(o => orderView(o, uid)), out: outOrders.map(o => orderView(o, uid)) },
    unread, needDo,
    menus: visibleMenus(uid).map(m => menuView(m, uid)),
    plaza: {
      latest: db.posts.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map(p => postView(p, uid))
    },
    counts: {
      followers: countFollowers(uid), following: (me.following || []).length,
      posts: db.posts.filter(p => p.author === uid).length,
      binds: partners.length
    },
    serverTime: Date.now()
  };
}

/* ---------------- 路由 ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  if (!p.startsWith('/api/')) return serveStatic(req, res);

  let body = {};
  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
    try { body = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
  }

  const me = authUser(req);
  const need = () => { send(res, 401, { error: '请先登录' }); return null; };

  try {
    /* ---- 无需登录 ---- */
    if (p === '/api/register' && req.method === 'POST') {
      const r = register(body);
      return send(res, r.error ? 400 : 200, r);
    }
    if (p === '/api/login' && req.method === 'POST') {
      const r = login(body);
      return send(res, r.error ? 400 : 200, r);
    }
    if (p === '/api/health') return send(res, 200, { ok: true, users: db.users.length, ts: Date.now() });

    if (p === '/api/recipes' && req.method === 'GET') {
      return send(res, 200, { recipes: LIB.recipes, categories: LIB.categories || [], coreList: LIB.coreList || [] });
    }

    /* ---- 需要登录 ---- */
    if (p === '/api/sync') { if (!me) return need(); return send(res, 200, syncPayload(me.id)); }
    if (p === '/api/me' && req.method === 'GET') { if (!me) return need(); return send(res, 200, { user: publicUser(me) }); }

    if (p === '/api/me' && req.method === 'PATCH') {
      if (!me) return need();
      ['nick', 'emoji', 'bio', 'theme', 'icon', 'bg'].forEach(k => {
        if (body[k] !== undefined) me[k] = String(body[k]).slice(0, k === 'bio' ? 60 : 20);
      });
      save();
      return send(res, 200, { user: publicUser(me) });
    }

    if (p === '/api/pwd' && req.method === 'POST') {
      if (!me) return need();
      if (hashPwd(String(body.oldPwd || ''), me.salt) !== me.pwd) return send(res, 400, { error: '当前密码不对' });
      const np = String(body.newPwd || '');
      if (np.length < 6) return send(res, 400, { error: '新密码至少 6 位' });
      me.salt = crypto.randomBytes(8).toString('hex');
      me.pwd = hashPwd(np, me.salt);
      // 踢掉所有旧 token，只保留当前会话
      const cur = (req.headers.authorization || '').slice(7);
      Object.keys(db.tokens).forEach(t => { if (db.tokens[t] === me.id && t !== cur) delete db.tokens[t]; });
      saveNow();
      return send(res, 200, { ok: true });
    }

    if (p === '/api/logout' && req.method === 'POST') {
      if (!me) return need();
      Object.keys(db.tokens).forEach(t => { if (db.tokens[t] === me.id) delete db.tokens[t]; });
      saveNow();
      return send(res, 200, { ok: true });
    }

    /* ---- 绑定：随机 6 位码 5 分钟 ---- */
    if (p === '/api/bind/code' && req.method === 'POST') {
      if (!me) return need();
      return send(res, 200, makeCode(me.id));
    }
    if (p === '/api/bind/code' && req.method === 'GET') {
      if (!me) return need();
      db.codes = db.codes.filter(c => c.exp > Date.now());
      const c = db.codes.filter(x => x.owner === me.id).sort((a, b) => b.createdAt - a.createdAt)[0];
      return send(res, 200, c ? { code: c.code, exp: c.exp, ttl: Math.max(0, Math.round((c.exp - Date.now()) / 1000)) } : { code: null });
    }
    if (p === '/api/bind/use' && req.method === 'POST') {
      if (!me) return need();
      const r = useCode(me.id, body.code, body.rel);
      return send(res, r.error ? 400 : 200, r);
    }
    if (p === '/api/binds' && req.method === 'GET') {
      if (!me) return need();
      return send(res, 200, { partners: bindsOf(me.id).map(b => bindView(b, me.id)) });
    }
    if (p.startsWith('/api/binds/') && req.method === 'DELETE') {
      if (!me) return need();
      const id = p.split('/')[3];
      const b = db.binds.find(x => x.id === id && (x.a === me.id || x.b === me.id));
      if (!b) return send(res, 404, { error: '绑定不存在' });
      db.binds = db.binds.filter(x => x.id !== id);
      saveNow();
      return send(res, 200, { ok: true });
    }

    /* ---- 订单 ---- */
    if (p === '/api/orders' && req.method === 'POST') {
      if (!me) return need();
      const r = createOrder(me.id, body);
      return send(res, r.error ? 400 : 200, r);
    }
    if (p === '/api/orders' && req.method === 'GET') {
      if (!me) return need();
      const ins = db.orders.filter(o => o.to === me.id).sort((a, b) => b.ts - a.ts).map(o => orderView(o, me.id));
      const outs = db.orders.filter(o => o.from === me.id && o.to !== me.id).sort((a, b) => b.ts - a.ts).map(o => orderView(o, me.id));
      return send(res, 200, { in: ins, out: outs });
    }
    if (p === '/api/orders/seen' && req.method === 'POST') {
      if (!me) return need();
      db.orders.forEach(o => { if (o.to === me.id) o.seenByTo = true; });
      save();
      return send(res, 200, { ok: true });
    }
    const om = p.match(/^\/api\/orders\/([^\/]+)\/(status|reply|del)$/);
    if (om && req.method === 'POST') {
      if (!me) return need();
      const o = db.orders.find(x => x.id === om[1] && (x.to === me.id || x.from === me.id));
      if (!o) return send(res, 404, { error: '订单不存在' });
      if (om[2] === 'del') {
        if (o.from !== me.id && o.to !== me.id) return send(res, 403, { error: '无权操作' });
        db.orders = db.orders.filter(x => x.id !== o.id);
        saveNow();
        return send(res, 200, { ok: true });
      }
      if (om[2] === 'status') {
        if (o.to !== me.id) return send(res, 403, { error: '只有接收人可以改状态' });
        const st = String(body.status || '');
        if (!['sent', 'doing', 'done'].includes(st)) return send(res, 400, { error: '状态不对' });
        o.status = st;
        if (st === 'done' && body.reply) { o.reply = String(body.reply).slice(0, 200); o.repliedAt = Date.now(); }
        saveNow();
        return send(res, 200, { order: orderView(o, me.id) });
      }
      if (om[2] === 'reply') {
        o.reply = String(body.reply || '').slice(0, 200);
        o.repliedAt = Date.now();
        saveNow();
        return send(res, 200, { order: orderView(o, me.id) });
      }
    }

    /* ---- 共享菜单 ---- */
    if (p === '/api/menus' && req.method === 'GET') {
      if (!me) return need();
      return send(res, 200, { menus: visibleMenus(me.id).map(m => menuView(m, me.id)) });
    }
    if (p === '/api/menus' && req.method === 'POST') {
      if (!me) return need();
      const name = String(body.name || '').trim();
      if (!name) return send(res, 400, { error: '给菜单起个名字' });
      const members = (body.members || []).filter(id => partnerIds(me.id).includes(id));
      const m = {
        id: nid('m'), owner: me.id, name: name.slice(0, 20),
        emoji: String(body.emoji || '🍱').slice(0, 4),
        members, items: [], createdAt: Date.now()
      };
      db.menus.push(m);
      saveNow();
      return send(res, 200, { menu: menuView(m, me.id) });
    }
    const mm = p.match(/^\/api\/menus\/([^\/]+)(?:\/(items|members|share))?$/);
    if (mm) {
      if (!me) return need();
      const m = db.menus.find(x => x.id === mm[1]);
      if (!m) return send(res, 404, { error: '菜单不存在' });
      const canEdit = m.owner === me.id;

      if (!mm[2] && req.method === 'GET') {
        if (!(canEdit || (m.members || []).includes(me.id))) return send(res, 403, { error: '无权查看' });
        return send(res, 200, { menu: menuView(m, me.id) });
      }
      if (!mm[2] && req.method === 'PATCH') {
        if (!canEdit) return send(res, 403, { error: '只有创建者能改名' });
        if (body.name) m.name = String(body.name).slice(0, 20);
        if (body.emoji) m.emoji = String(body.emoji).slice(0, 4);
        if (body.members) m.members = body.members.filter(id => partnerIds(me.id).includes(id));
        saveNow();
        return send(res, 200, { menu: menuView(m, me.id) });
      }
      if (!mm[2] && req.method === 'DELETE') {
        if (!canEdit) return send(res, 403, { error: '只有创建者能删除' });
        db.menus = db.menus.filter(x => x.id !== m.id);
        saveNow();
        return send(res, 200, { ok: true });
      }
      // 添加菜品（自己写的做法 / 从菜谱库加入）
      if (mm[2] === 'items' && req.method === 'POST') {
        if (!canEdit) return send(res, 403, { error: '只有创建者能加菜' });
        let item;
        if (body.rid && RECIPE_BY_ID[body.rid]) {
          const r = RECIPE_BY_ID[body.rid];
          item = {
            id: nid('i'), rid: r.id, title: r.title, emoji: r.emoji || '🍽',
            ings: (r.ingredients || []).slice(0, 30),
            steps: (r.steps || []).slice(0, 30), note: '', fromLib: true
          };
        } else {
          const title = String(body.title || '').trim();
          if (!title) return send(res, 400, { error: '菜名不能空' });
          item = {
            id: nid('i'), rid: '', title: title.slice(0, 30),
            emoji: String(body.emoji || '🍲').slice(0, 4),
            ings: (body.ings || []).map(s => String(s).slice(0, 60)).slice(0, 40),
            steps: (body.steps || []).map(s => String(s).slice(0, 300)).slice(0, 40),
            note: String(body.note || '').slice(0, 200), fromLib: false
          };
        }
        if (m.items.some(x => x.title === item.title)) return send(res, 400, { error: '这个菜已经在菜单里了' });
        m.items.push(item);
        saveNow();
        return send(res, 200, { menu: menuView(m, me.id), item });
      }
      const im = p.match(/^\/api\/menus\/([^\/]+)\/items\/([^\/]+)$/);
      if (im && req.method === 'DELETE') {
        if (!canEdit) return send(res, 403, { error: '只有创建者能删菜' });
        m.items = m.items.filter(x => x.id !== im[2]);
        saveNow();
        return send(res, 200, { menu: menuView(m, me.id) });
      }
      if (mm[2] === 'members' && req.method === 'POST') {
        if (!canEdit) return send(res, 403, { error: '只有创建者能设置共享' });
        const ids = (body.members || []).filter(id => partnerIds(me.id).includes(id));
        m.members = ids;
        saveNow();
        return send(res, 200, { menu: menuView(m, me.id) });
      }
    }

    /* ---- 美食广场 ---- */
    if (p === '/api/plaza' && req.method === 'GET') {
      if (!me) return need();
      const tab = url.searchParams.get('tab') || 'latest';
      let list = db.posts.slice();
      if (tab === 'following') {
        const f = me.following || [];
        list = list.filter(x => f.includes(x.author));
      }
      if (tab === 'fav') list = list.filter(x => (x.favorites || []).includes(me.id));
      if (tab === 'mine') list = list.filter(x => x.author === me.id);
      list.sort((a, b) => b.createdAt - a.createdAt);
      return send(res, 200, { posts: list.slice(0, 50).map(x => postView(x, me.id)) });
    }

    if (p === '/api/plaza' && req.method === 'POST') {
      if (!me) return need();
      const title = String(body.title || '').trim();
      if (!title) return send(res, 400, { error: '给这道菜起个名字' });
      const photos = [];
      (body.photos || []).slice(0, 4).forEach(b64 => {
        const m2 = String(b64).match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
        if (!m2) return;
        const ext = m2[1].toLowerCase() === 'jpeg' ? 'jpg' : m2[1].toLowerCase();
        const buf = Buffer.from(m2[2], 'base64');
        if (buf.length > 3.5 * 1024 * 1024) return;
        const name = nid('p') + '.' + ext;
        try { fs.writeFileSync(path.join(UP, name), buf); photos.push('/uploads/' + name); } catch (e) {}
      });
      const post = {
        id: nid('g'), author: me.id, title: title.slice(0, 40),
        text: String(body.text || '').slice(0, 800),
        steps: (body.steps || []).map(s => String(s).slice(0, 400)).slice(0, 40),
        photos, createdAt: Date.now(), likes: [], favorites: [], comments: []
      };
      db.posts.push(post);
      saveNow();
      return send(res, 200, { post: postView(post, me.id) });
    }

    const gm = p.match(/^\/api\/plaza\/([^\/]+)(?:\/(like|fav|comment|del))?$/);
    if (gm) {
      if (!me) return need();
      const post = db.posts.find(x => x.id === gm[1]);
      if (!post) return send(res, 404, { error: '内容不存在' });
      const act = gm[2];
      if (!act && req.method === 'GET') return send(res, 200, { post: postView(post, me.id) });
      if (act === 'like' && req.method === 'POST') {
        post.likes = post.likes || [];
        const i = post.likes.indexOf(me.id);
        if (i >= 0) post.likes.splice(i, 1); else post.likes.push(me.id);
        saveNow();
        return send(res, 200, { post: postView(post, me.id) });
      }
      if (act === 'fav' && req.method === 'POST') {
        post.favorites = post.favorites || [];
        const i = post.favorites.indexOf(me.id);
        if (i >= 0) post.favorites.splice(i, 1); else post.favorites.push(me.id);
        saveNow();
        return send(res, 200, { post: postView(post, me.id) });
      }
      if (act === 'comment' && req.method === 'POST') {
        const text = String(body.text || '').trim();
        if (!text) return send(res, 400, { error: '评论不能空' });
        post.comments = post.comments || [];
        post.comments.push({ id: nid('c'), uid: me.id, text: text.slice(0, 300), ts: Date.now() });
        saveNow();
        return send(res, 200, { post: postView(post, me.id) });
      }
      if (act === 'del' && req.method === 'POST') {
        if (post.author !== me.id) return send(res, 403, { error: '只能删自己的' });
        db.posts = db.posts.filter(x => x.id !== post.id);
        saveNow();
        return send(res, 200, { ok: true });
      }
    }

    /* ---- 关注 / 粉丝（与绑定独立） ---- */
    const fu = p.match(/^\/api\/follow\/([^\/]+)$/);
    if (fu && req.method === 'POST') {
      if (!me) return need();
      const target = db.users.find(u => u.id === fu[1]);
      if (!target) return send(res, 404, { error: '用户不存在' });
      if (target.id === me.id) return send(res, 400, { error: '不能关注自己' });
      me.following = me.following || [];
      const i = me.following.indexOf(target.id);
      if (i >= 0) me.following.splice(i, 1); else me.following.push(target.id);
      saveNow();
      return send(res, 200, {
        following: i < 0,
        target: publicUser(target),
        counts: { following: (me.following || []).length, followers: countFollowers(me.id) }
      });
    }
    if (p === '/api/following' && req.method === 'GET') {
      if (!me) return need();
      return send(res, 200, { users: (me.following || []).map(id => publicUser(db.users.find(u => u.id === id))).filter(Boolean) });
    }
    if (p === '/api/followers' && req.method === 'GET') {
      if (!me) return need();
      return send(res, 200, { users: db.users.filter(u => (u.following || []).includes(me.id)).map(publicUser) });
    }
    if (p === '/api/suggest' && req.method === 'GET') {
      if (!me) return need();
      const f = me.following || [];
      const list = db.users.filter(u => u.id !== me.id && !f.includes(u.id))
        .sort((a, b) => countFollowers(b.id) - countFollowers(a.id)).slice(0, 20)
        .map(u => Object.assign(publicUser(u), { isPartner: partnerIds(me.id).includes(u.id) }));
      return send(res, 200, { users: list });
    }

    /* ---- 用户主页 ---- */
    const um = p.match(/^\/api\/users\/([^\/]+)$/);
    if (um && req.method === 'GET') {
      if (!me) return need();
      const u = db.users.find(x => x.id === um[1]);
      if (!u) return send(res, 404, { error: '用户不存在' });
      const pf = publicUser(u);
      const myFollow = (me.following || []).includes(u.id);
      const followsMe = (u.following || []).includes(me.id);
      return send(res, 200, {
        user: pf,
        isPartner: partnerIds(me.id).includes(u.id),
        following: myFollow,
        followsMe,
        mutual: myFollow && followsMe,
        posts: db.posts.filter(x => x.author === u.id).sort((a, b) => b.createdAt - a.createdAt).map(x => postView(x, me.id))
      });
    }

    return send(res, 404, { error: 'no such api' });
  } catch (e) {
    console.error('ERR', p, e);
    return send(res, 500, { error: e.message || 'server error' });
  }
});

initStore().finally(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('做饭吧 v5 已启动: http://localhost:' + PORT);
    console.log('存储后端: ' + (mongoReady ? ('MongoDB (' + MONGO_DB_NAME + '.' + MONGO_COLL + ')') : ('本地文件 ' + DB_FILE)));
  });
});
