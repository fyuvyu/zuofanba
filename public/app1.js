/* 做饭吧 v4 · 前端 */
'use strict';

/* ================= 基础 ================= */
const $ = s => document.querySelector(s);
const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LSKEY = 'cookapp.v4.token';

const S = {
  token: localStorage.getItem(LSKEY) || '',
  me: null, partners: [], orders: { in: [], out: [] }, menus: [],
  recipes: [], categories: [], coreList: [],
  tab: 'home', cart: {}, cartTo: '', note: '',
  unread: 0, needDo: 0, counts: {}, lastSync: 0,
  plazaTab: 'latest', plaza: [], myFollowing: [], myFollowers: [], suggest: [],
  openPost: null
};

/* ================= 网络层 ================= */
async function api(path, opts) {
  opts = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    if (res.status === 401) { logoutLocal(); }
    throw new Error(data.error || ('请求失败 ' + res.status));
  }
  return data;
}

function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('on'), ms || 2000);
}

function logoutLocal() {
  S.token = ''; S.me = null;
  localStorage.removeItem(LSKEY);
  $('#app').style.display = 'none';
  $('#auth').style.display = 'flex';
  closeAll();
  renderAuth();
}

/* ================= 弹层 ================= */
function openSheet(title, bodyHtml, footHtml) {
  $('#shTitle').textContent = title || '';
  $('#shBody').innerHTML = bodyHtml || '';
  const f = $('#shFoot');
  if (footHtml) { f.innerHTML = footHtml; f.style.display = 'flex'; } else { f.innerHTML = ''; f.style.display = 'none'; }
  $('#layer').classList.add('on');
  document.body.classList.add('locked');
}
function closeSheet() {
  $('#layer').classList.remove('on');
  document.body.classList.remove('locked');
  setTimeout(() => {
    if (!$('#layer').classList.contains('on')) {
      $('#shBody').innerHTML = ''; $('#shFoot').innerHTML = '';
      $('#layer').style.pointerEvents = '';
    }
  }, 280);
}
function closeAll() {
  closeSheet();
  $('#modal').classList.remove('on');
  $('#modalBox').innerHTML = '';
}
function openModal(html) {
  $('#modalBox').innerHTML = html;
  $('#modal').classList.add('on');
}
function closeModal() {
  $('#modal').classList.remove('on');
  $('#modalBox').innerHTML = '';
}

/* ================= 登录注册 ================= */
let authMode = 'login';

function renderAuth() {
  const isReg = authMode === 'register';
  $('#authBody').innerHTML = `
    <div class="field"><label>手机号</label>
      <input class="input" id="aPhone" type="tel" inputmode="numeric" maxlength="11" placeholder="11 位手机号" value="">
    </div>
    <div class="field"><label>密码</label>
      <input class="input" id="aPwd" type="password" placeholder="至少 6 位" value="">
    </div>
    ${isReg ? `
    <div class="field"><label>确认密码</label>
      <input class="input" id="aPwd2" type="password" placeholder="再输一次" value="">
    </div>
    <div class="field"><label>昵称</label>
      <input class="input" id="aNick" maxlength="12" placeholder="家人怎么叫你，比如 妈妈 / 小厨阿明">
    </div>
    <div class="field"><label>选个头像</label>
      <div class="grid-c" id="aEmoji"></div>
    </div>` : ''}
    <button class="btn block" id="aSubmit" style="margin-top:6px">${isReg ? '注册并进入' : '登录'}</button>
  `;
  $('#authErr').textContent = '';
  $('#authSwitch').innerHTML = isReg
    ? '已经有账号了？<b id="aToggle">直接登录</b>'
    : '还没有账号？<b id="aToggle">注册一个</b>';

  if (isReg) {
    const list = ['🙂', '👩', '👨', '🧑', '👵', '👴', '🐱', '🍳', '🍲', '🌶', '🍰', '🥢'];
    let cur = '🙂';
    const box = $('#aEmoji');
    box.innerHTML = list.map(e => `<button type="button" data-e="${e}" class="${e === cur ? 'on' : ''}"><span class="e">${e}</span></button>`).join('');
    box.onclick = ev => {
      const b = ev.target.closest('button[data-e]');
      if (!b) return;
      cur = b.dataset.e;
      $$('#aEmoji button').forEach(x => x.classList.toggle('on', x.dataset.e === cur));
    };
  }

  $('#aToggle').onclick = () => { authMode = isReg ? 'login' : 'register'; renderAuth(); };
  $('#aSubmit').onclick = doAuth;
  $('#aPwd').onkeydown = ev => { if (ev.key === 'Enter' && !isReg) doAuth(); };
}

async function doAuth() {
  const phone = ($('#aPhone').value || '').trim();
  const pwd = $('#aPwd').value || '';
  const btn = $('#aSubmit');
  const err = $('#authErr');
  err.textContent = '';
  if (!/^1\d{10}$/.test(phone)) { err.textContent = '手机号要 11 位，1 开头'; return; }
  if (pwd.length < 6) { err.textContent = '密码至少 6 位'; return; }

  let body = { phone, pwd };
  if (authMode === 'register') {
    const pwd2 = $('#aPwd2').value || '';
    const nick = ($('#aNick').value || '').trim();
    if (pwd !== pwd2) { err.textContent = '两次密码不一样'; return; }
    if (!nick) { err.textContent = '请填一个昵称'; return; }
    const sel = $('#aEmoji button.on');
    body = { phone, pwd, nick, emoji: sel ? sel.dataset.e : '🙂' };
  }

  btn.disabled = true; btn.textContent = '请稍候…';
  try {
    const r = await api(authMode === 'register' ? '/register' : '/login', { method: 'POST', body });
    S.token = r.token;
    localStorage.setItem(LSKEY, r.token);
    S.me = r.user;
    await boot();
    toast(authMode === 'register' ? '注册成功，欢迎' : '欢迎回来');
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'register' ? '注册并进入' : '登录';
  }
}

/* ================= 启动 / 同步 ================= */
async function boot() {
  $('#auth').style.display = 'none';
  $('#app').style.display = 'block';
  await loadRecipes();
  await sync();
  applyLook();
  go(S.tab || 'home');
  setInterval(() => { if (S.token && !document.hidden) sync(true); }, 8000);
}

async function loadRecipes() {
  if (S.recipes.length) return;
  try {
    const r = await api('/recipes');
    S.recipes = r.recipes || [];
    S.categories = r.categories || [];
    S.coreList = r.coreList || [];
  } catch (e) { console.warn(e); }
}

async function sync(silent) {
  try {
    const d = await api('/sync');
    S.me = d.user;
    S.partners = d.partners || [];
    S.orders = d.orders || { in: [], out: [] };
    S.menus = d.menus || [];
    S.unread = d.unread || 0;
    S.needDo = d.needDo || 0;
    S.counts = d.counts || {};
    S.lastSync = Date.now();
    applyLook();
    renderTabbar();
    // 有新单子时提醒
    const newNeed = S.needDo;
    if (!silent || document.querySelector('#view').dataset.tab !== 'inbox') {
      if (silent && newNeed > (S._prevNeed || 0)) toast('📥 收到新的点菜单了');
    }
    S._prevNeed = newNeed;
    if (!silent) return;
    // 静默刷新：只在相关页面重绘
    const t = document.querySelector('#view').dataset.tab;
    if (t === 'home' || t === 'inbox' || t === 'menus' || t === 'mine') go(t, true);
  } catch (e) {
    if (!silent) toast(e.message);
  }
}

function applyLook() {
  const u = S.me || {};
  const theme = u.theme || 'sunset';
  const bg = u.bg || 'none';
  const b = document.body;
  b.className = b.className.split(' ').filter(c => !c.startsWith('t-') && !c.startsWith('bg-')).join(' ');
  b.classList.add('t-' + theme, 'bg-' + bg);
  const darkThemes = ['ink'];
  const darkBgs = ['dusk', 'night', 'neon'];
  if (darkThemes.includes(theme) || darkBgs.includes(bg)) b.classList.add('dark');
  else b.classList.remove('dark');
  document.title = (u.icon || '🍲') + ' 做饭吧 · 家里的点菜 App';
}

/* ================= 导航 ================= */
const TABS = [
  { k: 'home', ico: '🏠', label: '首页' },
  { k: 'order', ico: '🍽', label: '点菜' },
  { k: 'inbox', ico: '📥', label: '待做' },
  { k: 'plaza', ico: '🌈', label: '广场' },
  { k: 'menus', ico: '📖', label: '菜单' },
  { k: 'mine', ico: '👤', label: '我的' }
];

function renderTabbar() {
  $('#tabbar').innerHTML = TABS.map(t => {
    let badge = '';
    if (t.k === 'inbox' && S.needDo > 0) badge = `<i class="dot">${S.needDo > 99 ? '99+' : S.needDo}</i>`;
    return `<button data-tab="${t.k}" class="${S.tab === t.k ? 'on' : ''}">
      <span class="ico">${t.ico}</span><span>${t.label}</span>${badge}</button>`;
  }).join('');
}

$('#tabbar').onclick = ev => {
  const b = ev.target.closest('button[data-tab]');
  if (b) go(b.dataset.tab);
};

const TITLES = { home: '首页', order: '点菜', inbox: '待做', plaza: '美食广场', menus: '共享菜单', mine: '我的' };

function go(tab, keepScroll) {
  if (tab !== 'order' && S.tab === 'order' && Object.keys(S.cart).length && !keepScroll) {
    // 离开点菜页保留购物车，不提示
  }
  S.tab = tab;
  const v = $('#view');
  const y = window.scrollY;
  v.dataset.tab = tab;
  $('#pageTitle').textContent = TITLES[tab] || '';
  renderTabbar();
  $('#tbActions').innerHTML = '';
  ({ home: viewHome, order: viewOrder, inbox: viewInbox, plaza: viewPlaza, menus: viewMenus, mine: viewMine }[tab] || viewHome)();
  if (!keepScroll) window.scrollTo(0, 0); else window.scrollTo(0, y);
}

/* ================= 首页 ================= */
function viewHome() {
  const u = S.me || {};
  const inTodo = S.orders.in.filter(o => o.status !== 'done');
  const recentOut = S.orders.out.slice(0, 2);
  const recentIn = S.orders.in.slice(0, 2);

  $('#tbActions').innerHTML = `
    <button class="icon-btn" id="hLook">🎨</button>
    <button class="icon-btn" id="hPlaza">🌈</button>`;

  $('#view').innerHTML = `
    <div class="card" style="background:linear-gradient(135deg,var(--brand),var(--brand2));border:0;color:#fff">
      <div class="row">
        <div class="avatar lg" style="background:rgba(255,255,255,.22)">${esc(u.emoji || '🙂')}</div>
        <div class="grow">
          <div style="font-size:17px;font-weight:850">${esc(u.nick || '')}</div>
          <div style="font-size:12.5px;opacity:.9;margin-top:2px">
            ${S.partners.length ? '已绑定 ' + S.partners.length + ' 人' : '还没绑定家人'} · 关注 ${S.counts.following || 0} · 粉丝 ${S.counts.followers || 0}
          </div>
        </div>
      </div>
      <div class="row" style="margin-top:13px;gap:8px">
        <button class="btn sm" style="background:rgba(255,255,255,.9);color:var(--brand)" id="hOrder">点菜</button>
        <button class="btn sm" style="background:rgba(255,255,255,.22);color:#fff;border:1px solid rgba(255,255,255,.5)" id="hBind">绑定家人</button>
      </div>
    </div>

    ${S.needDo > 0 ? `
    <div class="card" style="border-left:3px solid var(--brand)" id="hTodoCard">
      <div class="row between">
        <div>
          <div style="font-weight:800;font-size:14.5px">📥 有 ${S.needDo} 个单子等着你做</div>
          <div class="small muted" style="margin-top:3px">${esc(inTodo[0] ? inTodo[0].from.nick + ' 点了 ' + inTodo[0].items.length + ' 道菜' : '')}</div>
        </div>
        <button class="btn sm" id="hGoInbox">去看看</button>
      </div>
    </div>` : ''}

    <h2 class="sec">快捷入口</h2>
    <div class="card flat" style="padding:6px 14px">
      <div class="ritem" data-go="menus"><div class="ico">📖</div>
        <div class="grow"><div class="t">共享菜单</div><div class="s">${S.menus.length} 个菜单 · 可自己加菜和做法</div></div><div class="arrow">›</div></div>
      <div class="ritem" data-go="plaza"><div class="ico">🌈</div>
        <div class="grow"><div class="t">美食广场</div><div class="s">发自己的菜，看别人怎么做</div></div><div class="arrow">›</div></div>
      <div class="ritem" id="hFollowRow"><div class="ico">👥</div>
        <div class="grow"><div class="t">关注与粉丝</div><div class="s">关注 ${S.counts.following || 0} · 粉丝 ${S.counts.followers || 0}</div></div><div class="arrow">›</div></div>
    </div>

    ${recentIn.length || recentOut.length ? `
    <h2 class="sec">最近的点菜单</h2>
    ${recentIn.map(o => orderCard(o)).join('')}
    ${recentOut.map(o => orderCard(o)).join('')}
    <div style="text-align:center;margin-top:4px"><button class="btn ghost sm" id="hAllOrders">看全部订单</button></div>` : `
    <div class="empty"><span class="e">🍽</span>还没有点菜单<br>点菜给自己或家人试试</div>`}
  `;

  $('#hLook').onclick = () => go('mine');
  $('#hPlaza').onclick = () => go('plaza');
  $('#hOrder').onclick = () => go('order');
  $('#hBind').onclick = openBindSheet;
  if ($('#hGoInbox')) $('#hGoInbox').onclick = () => go('inbox');
  if ($('#hTodoCard')) $('#hTodoCard').onclick = () => go('inbox');
  if ($('#hAllOrders')) $('#hAllOrders').onclick = () => go('inbox');
  $('#hFollowRow').onclick = openFollowSheet;
  $$('#view [data-go]').forEach(el => el.onclick = () => go(el.dataset.go));
  bindOrderCards();
}

/* ================= 订单卡片 ================= */
const ST_MAP = {
  sent: { t: '待接收', c: 'warn' },
  doing: { t: '正在做', c: '' },
  done: { t: '已完成', c: 'ok' }
};

function orderCard(o) {
  const isIn = o.dir === 'in';
  const st = ST_MAP[o.status] || ST_MAP.sent;
  const who = isIn ? o.from.nick : o.to.nick;
  const self = o.from.id === o.to.id;
  const title = self ? '给自己点的'
    : isIn ? esc(who) + ' 给你点的'
    : '你给 ' + esc(who) + ' 点的';
  return `<div class="card" data-order="${o.id}">
    <div class="row" style="gap:9px;margin-bottom:9px">
      <div class="avatar" style="width:36px;height:36px;font-size:18px">${esc(isIn ? (o.from.emoji || '🙂') : (o.to.emoji || '🙂'))}</div>
      <div class="grow">
        <div style="font-size:14px;font-weight:780">${title}</div>
        <div class="tiny muted" style="margin-top:2px">${fmtTime(o.ts)} · ${o.items.length} 道菜</div>
      </div>
      <span class="pill ${st.c}">${st.t}</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:${o.note || o.reply || isIn ? '10px' : '0'}">
      ${o.items.map(it => `<span class="pill gray" style="font-size:11.5px">${esc(it.emoji || '🍽')} ${esc(it.title)}${it.q > 1 ? ' ×' + it.q : ''}</span>`).join('')}
    </div>
    ${o.note ? `<div class="small muted" style="margin-bottom:8px">留言：${esc(o.note)}</div>` : ''}
    ${o.reply ? `<div class="small" style="background:var(--brand-soft);color:var(--brand);padding:8px 11px;border-radius:10px;margin-bottom:8px">💬 ${esc(o.reply)}</div>` : ''}
    ${isIn ? `<div class="row" style="gap:8px">
      ${o.status === 'sent' ? `<button class="btn sm" data-oact="doing" data-oid="${o.id}">开始做</button>` : ''}
      ${o.status !== 'done' ? `<button class="btn sm" data-oact="done" data-oid="${o.id}">做好了</button>` : ''}
      ${o.status === 'done' ? `<span class="pill ok">已完成</span>` : ''}
      <button class="btn plain sm" data-oact="recipe" data-oid="${o.id}">看做法</button>
    </div>` : `<div class="row" style="gap:8px">
      ${o.status === 'sent' ? '<span class="small muted">等对方接收…</span>' : ''}
      <button class="btn plain sm" data-oact="del" data-oid="${o.id}">删除</button>
    </div>`}
  </div>`;
}

function bindOrderCards() {
  $$('#view [data-oact]').forEach(btn => {
    btn.onclick = async ev => {
      ev.stopPropagation();
      const act = btn.dataset.oact, oid = btn.dataset.oid;
      const o = S.orders.in.concat(S.orders.out).find(x => x.id === oid);
      if (act === 'recipe') return showOrderRecipe(o);
      if (act === 'del') {
        if (!confirm('删除这个点菜单？')) return;
        try { await api('/orders/' + oid + '/del', { method: 'POST' }); await sync(); go(S.tab, true); toast('已删除'); }
        catch (e) { toast(e.message); }
        return;
      }
      if (act === 'doing') {
        try { await api('/orders/' + oid + '/status', { method: 'POST', body: { status: 'doing' } }); await sync(); go(S.tab, true); toast('开始做了'); }
        catch (e) { toast(e.message); }
        return;
      }
      if (act === 'done') {
        openSheet('做好了 · 给个回话', `
          <div class="small muted" style="margin-bottom:10px">说一句，对方手机上马上能看到</div>
          <textarea class="input" id="doneMsg" placeholder="比如：菜在锅里，趁热吃">菜在锅里，趁热吃</textarea>
          <div class="chips" style="margin-top:10px">
            ${['菜在锅里，趁热吃', '刚出锅，快回来', '有点咸了下次少放盐', '今天做得很成功'].map(t => `<button class="chip" data-msg="${esc(t)}">${esc(t)}</button>`).join('')}
          </div>`,
          `<button class="btn plain grow" data-close="1">取消</button><button class="btn grow" id="doneOk">完成并发出</button>`);
        $$('#shBody [data-msg]').forEach(b => b.onclick = () => { $('#doneMsg').value = b.dataset.msg; });
        $('#doneOk').onclick = async () => {
          const reply = ($('#doneMsg').value || '').trim();
          try {
            await api('/orders/' + oid + '/status', { method: 'POST', body: { status: 'done', reply } });
            closeSheet(); await sync(); go(S.tab, true); toast('已发出，对方能看到了');
          } catch (e) { toast(e.message); }
        };
      }
    };
  });
}

function showOrderRecipe(o) {
  const rids = o.items.map(i => i.rid).filter(Boolean);
  const recs = rids.map(id => S.recipes.find(r => r.id === id)).filter(Boolean);
  if (!recs.length) return openSheet('看做法', '<div class="empty"><span class="e">📖</span>这单里的菜没有内置菜谱<br>可以在共享菜单里自己写做法</div>', '<button class="btn block" data-close="1">好</button>');
  openSheet('看做法', recs.map(r => `
    <div style="margin-bottom:20px">
      <div class="row" style="gap:10px;margin-bottom:8px">
        <div class="avatar">${esc(r.emoji || '🍽')}</div>
        <div class="grow"><div style="font-weight:800;font-size:15px">${esc(r.title)}</div>
        <div class="tiny muted">${r.time} 分钟 · ${esc(r.difficulty || '')}</div></div>
      </div>
      <div class="card-title">食材</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px">
        ${(r.ingredients || []).map(s => `<span class="pill gray" style="font-size:11.5px">${esc(s)}</span>`).join('')}
      </div>
      <div class="card-title">做法</div>
      <ol class="steps">${(r.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    </div>`).join(''), '<button class="btn block" data-close="1">知道了</button>');
}

function fmtTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  const p = n => String(n).padStart(2, '0');
  if (same) return '今天 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return '昨天 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ================= 点菜页 ================= */
function viewOrder() {
  const targets = [{ id: 'self', nick: '自己', emoji: S.me.emoji || '🙂', rel: '自己' }]
    .concat(S.partners.map(p => ({ id: p.user.id, nick: p.user.nick, emoji: p.user.emoji, rel: p.rel })));

  if (!S.cartTo || !targets.some(t => t.id === S.cartTo)) S.cartTo = targets[0].id;

  const total = Object.keys(S.cart).reduce((a, k) => a + S.cart[k].q, 0);
  const cat = S._cat || '全部';
  const list = cat === '全部' ? S.recipes : S.recipes.filter(r => r.category === cat);

  $('#tbActions').innerHTML = `<button class="icon-btn" id="oSearch">🔍</button>`;

  $('#view').innerHTML = `
    <div class="card flat" style="padding:12px 14px">
      <div class="card-title" style="margin-bottom:8px">点给谁</div>
      <div class="chips" id="targetChips">
        ${targets.map(t => `<button class="chip ${S.cartTo === t.id ? 'on' : ''}" data-t="${t.id}">
          ${esc(t.emoji)} ${esc(t.nick)}${t.rel && t.rel !== '自己' ? ' · ' + esc(t.rel) : ''}</button>`).join('')}
        ${S.partners.length ? '' : '<button class="chip" id="goBind">＋ 绑定家人</button>'}
      </div>
    </div>

    <div class="chips" id="catChips" style="margin-bottom:12px">
      <button class="chip ${cat === '全部' ? 'on' : ''}" data-c="全部">全部 ${S.recipes.length}</button>
      ${S.categories.map(c => `<button class="chip ${cat === c.name ? 'on' : ''}" data-c="${esc(c.name)}">${esc(c.emoji || '')} ${esc(c.name)}</button>`).join('')}
    </div>

    <div id="dishList">
      ${list.map(r => {
        const q = S.cart[r.id] ? S.cart[r.id].q : 0;
        return `<div class="dish">
          <div class="e">${esc(r.emoji || '🍽')}</div>
          <div class="grow" data-rdetail="${r.id}" style="cursor:pointer">
            <div class="t">${esc(r.title)}</div>
            <div class="s">${r.time} 分钟 · ${esc(r.difficulty || '')}</div>
          </div>
          ${q > 0 ? `<button class="add-btn minus" data-rm="${r.id}">−</button><b style="min-width:16px;text-align:center">${q}</b>` : ''}
          <button class="add-btn" data-add="${r.id}">＋</button>
        </div>`;
      }).join('') || '<div class="empty">这个分类还没有菜</div>'}
    </div>
    ${total ? `<div style="height:66px"></div>` : ''}
    ${total ? `<div class="cartbar">
      <div class="grow"><div style="font-weight:800;font-size:14px">已选 ${total} 道</div>
      <div class="tiny muted">点给 ${esc((targets.find(t => t.id === S.cartTo) || {}).nick || '')}</div></div>
      <button class="btn plain sm" id="cartClear">清空</button>
      <button class="btn" id="cartGo">生成点菜单</button>
    </div>` : ''}
  `;

  $('#oSearch').onclick = openRecipeSearch;
  $$('#targetChips [data-t]').forEach(b => b.onclick = () => { S.cartTo = b.dataset.t; go('order', true); });
  if ($('#goBind')) $('#goBind').onclick = openBindSheet;
  $$('#catChips [data-c]').forEach(b => b.onclick = () => { S._cat = b.dataset.c; go('order', true); });
  $$('#view [data-add]').forEach(b => b.onclick = () => {
    const r = S.recipes.find(x => x.id === b.dataset.add);
    if (!r) return;
    const cur = S.cart[r.id] || { rid: r.id, title: r.title, emoji: r.emoji, q: 0 };
    cur.q += 1; S.cart[r.id] = cur;
    go('order', true);
  });
  $$('#view [data-rm]').forEach(b => b.onclick = () => {
    const id = b.dataset.rm;
    if (!S.cart[id]) return;
    S.cart[id].q -= 1;
    if (S.cart[id].q <= 0) delete S.cart[id];
    go('order', true);
  });
  $$('#view [data-rdetail]').forEach(el => el.onclick = () => showRecipeDetail(el.dataset.rdetail));
  if ($('#cartClear')) $('#cartClear').onclick = () => { S.cart = {}; go('order', true); };
  if ($('#cartGo')) $('#cartGo').onclick = confirmOrder;
}

function showRecipeDetail(rid) {
  const r = S.recipes.find(x => x.id === rid);
  if (!r) return;
  const q = new URLSearchParams({ q: r.title + ' 做法' });
  openSheet(r.title, `
    <div class="row" style="gap:10px;margin-bottom:12px">
      <div class="avatar lg">${esc(r.emoji || '🍽')}</div>
      <div class="grow"><div style="font-weight:850;font-size:16px">${esc(r.title)}</div>
      <div class="tiny muted">${r.time} 分钟 · ${esc(r.difficulty || '')} · ${esc(r.category || '')}</div></div>
    </div>
    <div class="card-title">食材</div>
    <div id="ingBox" style="margin-bottom:14px">
      ${(r.ingredients || []).map((s, i) => `<div class="ritem" data-ing="${i}" style="padding:8px 0">
        <div class="ico" style="width:22px;height:22px;font-size:12px;background:var(--card);border:1.4px solid var(--line)">✓</div>
        <div class="grow small">${esc(s)}</div></div>`).join('')}
    </div>
    <div class="card-title">做法</div>
    <ol class="steps">${(r.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="card-title" style="margin-top:16px">看视频</div>
    <div class="chips">
      <a class="chip" href="https://search.bilibili.com/all?keyword=${encodeURIComponent(r.title)}" target="_blank" rel="noopener">📺 B 站</a>
      <a class="chip" href="https://www.xiachufang.com/search/?keyword=${encodeURIComponent(r.title)}" target="_blank" rel="noopener">🍳 下厨房</a>
      <a class="chip" href="https://www.douguo.com/caipu/${encodeURIComponent(r.title)}" target="_blank" rel="noopener">🥘 豆果</a>
      <a class="chip" href="https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(r.title + ' 做法')}" target="_blank" rel="noopener">📕 小红书</a>
    </div>`, `<button class="btn block" data-close="1">收起</button>`);
  $$('#ingBox [data-ing]').forEach(el => el.onclick = () => {
    el.style.opacity = el.style.opacity === '0.4' ? '1' : '0.4';
  });
}

function openRecipeSearch() {
  openSheet('搜菜', `
    <input class="input" id="rq" placeholder="输入菜名，比如 土豆">
    <div id="rres" style="margin-top:12px"></div>`);
  const box = $('#rres');
  const input = $('#rq');
  const run = () => {
    const q = (input.value || '').trim();
    if (!q) { box.innerHTML = '<div class="empty">输入关键词开始搜</div>'; return; }
    const hits = S.recipes.filter(r => (r.title + ' ' + (r.tags || []).join(' ') + ' ' + (r.ingredients || []).join(' ')).includes(q)).slice(0, 20);
    box.innerHTML = hits.length ? hits.map(r => `<div class="dish" style="margin-bottom:8px">
      <div class="e">${esc(r.emoji || '🍽')}</div>
      <div class="grow"><div class="t">${esc(r.title)}</div><div class="s">${r.time} 分钟 · ${esc(r.category || '')}</div></div>
      <button class="add-btn" data-sadd="${r.id}">＋</button></div>`).join('')
      : '<div class="empty">没找到，去共享菜单自己加一个</div>';
    $$('#rres [data-sadd]').forEach(b => b.onclick = () => {
      const r = S.recipes.find(x => x.id === b.dataset.sadd);
      const cur = S.cart[r.id] || { rid: r.id, title: r.title, emoji: r.emoji, q: 0 };
      cur.q += 1; S.cart[r.id] = cur;
      toast('已加入，共 ' + Object.keys(S.cart).length + ' 道');
    });
  };
  input.oninput = run;
  run();
}

async function confirmOrder() {
  const items = Object.keys(S.cart).map(k => {
    const c = S.cart[k];
    return { rid: c.rid, title: c.title, emoji: c.emoji, q: c.q };
  });
  if (!items.length) return toast('还没选菜');
  const to = S.cartTo;
  const t = to === 'self' ? { nick: '自己' } : (S.partners.find(p => p.user.id === to) || {}).user || {};
  openSheet('确认点菜单', `
    <div class="small muted" style="margin-bottom:10px">点给：<b style="color:var(--text)">${esc(t.nick || '')}</b></div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      ${items.map(i => `<span class="pill">${esc(i.emoji)} ${esc(i.title)}${i.q > 1 ? ' ×' + i.q : ''}</span>`).join('')}
    </div>
    <div class="field"><label>留言（可选）</label>
      <textarea class="input" id="oNote" placeholder="想吃辣一点 / 少放盐">${esc(S.note || '')}</textarea></div>
    <div class="hint">${to === 'self' ? '点给自己，直接进你的待做' : '对方手机上会马上出现并提示'}</div>`,
    `<button class="btn plain grow" data-close="1">再改改</button><button class="btn grow" id="oOk">发出去</button>`);
  $('#oOk').onclick = async () => {
    const note = ($('#oNote').value || '').trim();
    $('#oOk').disabled = true;
    try {
      await api('/orders', { method: 'POST', body: { to, items, note } });
      S.cart = {}; S.note = '';
      closeSheet();
      await sync();
      toast(to === 'self' ? '已发出，去「待做」看' : '已发出，对方收到了');
      go('inbox');
    } catch (e) { toast(e.message); $('#oOk').disabled = false; }
  };
}

/* ================= 待做 / 订单 ================= */
function viewInbox() {
  $('#tbActions').innerHTML = `<button class="icon-btn" id="iRefresh">↻</button>`;
  const ins = S.orders.in;
  const outs = S.orders.out;
  const todo = ins.filter(o => o.status !== 'done');
  const done = ins.filter(o => o.status === 'done');

  $('#view').innerHTML = `
    <div class="chips" style="margin-bottom:12px">
      <button class="chip on">别人点给我的 ${ins.length}</button>
      <button class="chip" id="toOut">我点出去的 ${outs.length}</button>
    </div>
    ${todo.length ? `<h2 class="sec">要做 ${todo.length}</h2>` + todo.map(orderCard).join('') : ''}
    ${done.length ? `<h2 class="sec">已完成 ${done.length}</h2>` + done.map(orderCard).join('') : ''}
    ${!ins.length ? `<div class="empty"><span class="e">📥</span>还没有人给你点菜<br>绑定家人后，他们点的菜会出现在这里</div>` : ''}
    ${todo.length ? `<div style="text-align:center;margin-top:10px"><button class="btn soft sm" id="iShop">🧺 买菜清单</button></div>` : ''}
  `;
  $('#iRefresh').onclick = async () => { await sync(); go('inbox'); toast('已刷新'); };
  $('#toOut').onclick = viewOutOrders;
  if ($('#iShop')) $('#iShop').onclick = openShopList;
  bindOrderCards();
  // 标记已读
  if (S.unread > 0) api('/orders/seen', { method: 'POST' }).catch(() => {});
}

function viewOutOrders() {
  const outs = S.orders.out;
  $('#view').innerHTML = `
    <div class="chips" style="margin-bottom:12px">
      <button class="chip" id="toIn">别人点给我的 ${S.orders.in.length}</button>
      <button class="chip on">我点出去的 ${outs.length}</button>
    </div>
    ${outs.length ? outs.map(orderCard).join('') : `<div class="empty"><span class="e">🍽</span>还没点过菜<br>去点菜页给家人点一道</div>`}
  `;
  $('#toIn').onclick = () => go('inbox');
  bindOrderCards();
}

function openShopList() {
  const todo = S.orders.in.filter(o => o.status !== 'done');
  const map = {};
  todo.forEach(o => {
    o.items.forEach(it => {
      const r = S.recipes.find(x => x.id === it.rid);
      const ings = r ? (r.ingredients || []) : [];
      ings.forEach(s => {
        const name = String(s).replace(/[（(][^）)]*[）)]/g, '').trim().split(/\s+/)[0].replace(/^[0-9０-９\.\/~\-–—\s]+/, '').replace(/[0-9０-９].*$/, '').trim();
        if (!name) return;
        if (!map[name]) map[name] = { name, dishes: {} };
        map[name].dishes[it.title] = 1;
      });
    });
  });
  const items = Object.keys(map).map(k => map[k]);
  openSheet('买菜清单', items.length ? `
    <div class="small muted" style="margin-bottom:10px">按 ${todo.length} 个待做单子自动汇总，共 ${items.length} 样</div>
    ${items.map(i => `<div class="ritem" data-si="${esc(i.name)}">
      <div class="ico" style="width:24px;height:24px;font-size:12px">✓</div>
      <div class="grow"><div class="t" style="font-size:14px">${esc(i.name)}</div>
      <div class="s">${esc(Object.keys(i.dishes).join('、'))}</div></div></div>`).join('')}`
    : '<div class="empty"><span class="e">🧺</span>还没有待做的单子<br>有人给你点菜后这里会自动汇总</div>',
    '<button class="btn block" data-close="1">好</button>');
  $$('#shBody [data-si]').forEach(el => el.onclick = () => {
    el.querySelector('.ico').textContent = el.dataset.done === '1' ? '✓' : '✔';
    el.dataset.done = el.dataset.done === '1' ? '0' : '1';
    el.style.opacity = el.dataset.done === '1' ? '1' : '.45';
  });
}

/* ================= 绑定 ================= */
async function openBindSheet() {
  let d = { code: null };
  try { d = await api('/bind/code', { method: 'POST' }); } catch (e) { return toast(e.message); }
  renderBindSheet(d.code, d.exp);
}

function renderBindSheet(code, exp) {
  const left = Math.max(0, Math.round((exp - Date.now()) / 1000));
  openSheet('绑定家人', `
    <div class="card flat" style="background:var(--brand-soft);border:0;text-align:center;padding:16px">
      <div class="tiny" style="color:var(--brand);font-weight:750">把这 6 个数字念给对方</div>
      <div style="font-size:38px;font-weight:850;letter-spacing:.16em;color:var(--brand);margin:6px 0;font-variant-numeric:tabular-nums" id="codeTxt">${code || '------'}</div>
      <div class="tiny muted" id="codeTtl">剩余 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</div>
      <button class="btn ghost sm" id="codeNew" style="margin-top:9px">换一个</button>
    </div>

    <h2 class="sec" style="margin-top:18px">对方输你的码</h2>
    <div class="small muted" style="margin-bottom:10px">你把上面的码告诉对方，对方在「绑定家人」里输入即可</div>

    <h2 class="sec" style="margin-top:18px">你输对方的码</h2>
    <div class="field"><input class="input code" id="bCode" inputmode="numeric" maxlength="6" placeholder="000000"></div>
    <div class="field"><label>关系</label>
      <div class="chips" id="bRel">
        ${['家人', '情侣', '朋友', '室友', '同事'].map((r, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-r="${r}">${r}</button>`).join('')}
      </div></div>
    <div class="err" id="bErr"></div>
    <button class="btn block" id="bOk">绑定</button>

    <h2 class="sec" style="margin-top:20px">已绑定 ${S.partners.length} 人</h2>
    ${S.partners.length ? S.partners.map(p => `<div class="ritem">
      <div class="avatar">${esc(p.user.emoji || '🙂')}</div>
      <div class="grow"><div class="t">${esc(p.user.nick)}</div>
      <div class="s">${esc(p.rel)} · 绑定于 ${fmtTime(p.since)}</div></div>
      <button class="btn danger xs" data-unbind="${p.id}">解除</button></div>`).join('')
      : '<div class="small muted">还没有绑定的人</div>'}
  `);

  let rel = '家人';
  $$('#bRel [data-r]').forEach(b => b.onclick = () => {
    rel = b.dataset.r;
    $$('#bRel [data-r]').forEach(x => x.classList.toggle('on', x.dataset.r === rel));
  });

  if (code) {
    const tick = setInterval(() => {
      if (!$('#codeTtl')) return clearInterval(tick);
      const s = Math.max(0, Math.round((exp - Date.now()) / 1000));
      $('#codeTtl').textContent = s > 0 ? ('剩余 ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')) : '已过期，点「换一个」';
      if (s <= 0) clearInterval(tick);
    }, 1000);
  }

  $('#codeNew').onclick = async () => {
    try { const d = await api('/bind/code', { method: 'POST' }); renderBindSheet(d.code, d.exp); }
    catch (e) { toast(e.message); }
  };

  $('#bOk').onclick = async () => {
    const c = ($('#bCode').value || '').replace(/\D/g, '');
    if (c.length !== 6) { $('#bErr').textContent = '要输满 6 位数字'; return; }
    $('#bOk').disabled = true;
    try {
      await api('/bind/use', { method: 'POST', body: { code: c, rel } });
      closeSheet();
      await sync();
      toast('绑定成功');
      go(S.tab, true);
    } catch (e) { $('#bErr').textContent = e.message; $('#bOk').disabled = false; }
  };

  $$('#shBody [data-unbind]').forEach(b => b.onclick = async () => {
    if (!confirm('解除绑定？之后互相点菜就收不到了')) return;
    try { await api('/binds/' + b.dataset.unbind, { method: 'DELETE' }); closeSheet(); await sync(); toast('已解除'); go(S.tab, true); }
    catch (e) { toast(e.message); }
  });
}

/* ================= 共享菜单 ================= */
function viewMenus() {
  $('#tbActions').innerHTML = `<button class="icon-btn" id="mNew">＋</button>`;
  const mine = S.menus.filter(m => m.mine);
  const shared = S.menus.filter(m => !m.mine);

  $('#view').innerHTML = `
    ${mine.length ? `<h2 class="sec">我创建的 <span class="cnt">${mine.length}</span></h2>` + mine.map(menuCard).join('') : ''}
    ${shared.length ? `<h2 class="sec">家人共享给我的 <span class="cnt">${shared.length}</span></h2>` + shared.map(menuCard).join('') : ''}
    ${!S.menus.length ? `<div class="empty"><span class="e">📖</span>还没有菜单<br>点右上角 ＋ 新建一个</div>` : ''}
    <div class="card flat small muted" style="margin-top:8px">
      💡 菜单可以自己命名，加自己的菜和做法，再勾选共享给哪些家人。不同家人看到的是你分享给他们的那些，不共享的只有你自己能看到。
    </div>
  `;
  $('#mNew').onclick = openNewMenu;
  $$('#view [data-menu]').forEach(el => el.onclick = () => openMenuDetail(el.dataset.menu));
}

function menuCard(m) {
  return `<div class="card" data-menu="${m.id}" style="cursor:pointer">
    <div class="row" style="gap:11px">
      <div class="avatar" style="background:var(--brand-soft)">${esc(m.emoji || '🍱')}</div>
      <div class="grow">
        <div class="row between"><div style="font-weight:800;font-size:14.5px">${esc(m.name)}</div>
        <span class="pill ${m.mine ? '' : 'gray'}">${m.mine ? '我建的' : esc(m.ownerNick)}</span></div>
        <div class="tiny muted" style="margin-top:3px">${m.count} 道菜 · ${m.members.length ? '共享给 ' + esc(m.members.map(x => x.nick).join('、')) : '仅自己可见'}</div>
      </div>
      <div class="arrow muted">›</div>
    </div>
  </div>`;
}

function openMenuDetail(id) {
  const m = S.menus.find(x => x.id === id);
  if (!m) return;
  const canEdit = m.mine;
  openSheet(m.name, `
    <div class="row" style="gap:10px;margin-bottom:14px">
      <div class="avatar lg">${esc(m.emoji)}</div>
      <div class="grow">
        <div style="font-weight:850;font-size:16px">${esc(m.name)}</div>
        <div class="tiny muted" style="margin-top:2px">${m.count} 道菜 · ${m.mine ? '我创建的' : '由 ' + esc(m.ownerNick) + ' 共享'}</div>
      </div>
      ${canEdit ? `<button class="icon-btn" id="mRename">✏️</button>` : ''}
    </div>

    ${canEdit ? `<div class="row" style="gap:8px;margin-bottom:14px">
      <button class="btn sm grow" id="mAddLib">＋ 从菜谱库加</button>
      <button class="btn ghost sm grow" id="mAddOwn">✍️ 写我的做法</button>
    </div>
    <div class="row" style="gap:8px;margin-bottom:16px">
      <button class="btn plain sm grow" id="mShare">👥 共享设置 (${m.members.length})</button>
      <button class="btn danger sm" id="mDel">删除菜单</button>
    </div>` : ''}

    <div class="card-title">菜品 ${m.count}</div>
    ${m.items.length ? m.items.map(it => `
      <div class="dish" style="align-items:flex-start;margin-bottom:10px">
        <div class="e">${esc(it.emoji)}</div>
        <div class="grow">
          <div class="t">${esc(it.title)} ${it.fromLib ? '<span class="pill gray tiny">菜谱库</span>' : '<span class="pill tiny">我写的</span>'}</div>
          <div class="s">${it.ings && it.ings.length ? it.ings.length + ' 样食材' : ''}${it.steps && it.steps.length ? ' · ' + it.steps.length + ' 步' : ''}${it.note ? ' · ' + esc(it.note) : ''}</div>
          <button class="btn ghost xs" style="margin-top:7px" data-itemview="${it.id}">看做法</button>
          ${canEdit ? `<button class="btn danger xs" style="margin-top:7px" data-itemdel="${it.id}">删</button>` : ''}
        </div>
      </div>`).join('')
      : '<div class="empty" style="padding:20px"><span class="e">🍽</span>还没有菜' + (canEdit ? '<br>上面两个按钮都可以加' : '') + '</div>'}
  `);

  if (canEdit) {
    $('#mRename').onclick = () => openRenameMenu(m);
    $('#mAddLib').onclick = () => openAddFromLib(m);
    $('#mAddOwn').onclick = () => openAddOwnDish(m);
    $('#mShare').onclick = () => openShareMenu(m);
    $('#mDel').onclick = async () => {
      if (!confirm('删除菜单「' + m.name + '」？')) return;
      try { await api('/menus/' + m.id, { method: 'DELETE' }); closeSheet(); await sync(); go('menus'); toast('已删除'); }
      catch (e) { toast(e.message); }
    };
  }

  $$('#shBody [data-itemview]').forEach(b => b.onclick = () => {
    const it = m.items.find(x => x.id === b.dataset.itemview);
    if (it) showMenuItem(it);
  });
  $$('#shBody [data-itemdel]').forEach(b => b.onclick = async () => {
    try { await api('/menus/' + m.id + '/items/' + b.dataset.itemdel, { method: 'DELETE' }); await sync(); openMenuDetail(m.id); }
    catch (e) { toast(e.message); }
  });
}

function showMenuItem(it) {
  openSheet(it.title, `
    <div class="row" style="gap:10px;margin-bottom:12px">
      <div class="avatar lg">${esc(it.emoji)}</div>
      <div class="grow"><div style="font-weight:850;font-size:16px">${esc(it.title)}</div>
      <div class="tiny muted">${it.fromLib ? '来自菜谱库' : '自己写的做法'}</div></div>
    </div>
    ${it.ings && it.ings.length ? `<div class="card-title">食材</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">
        ${it.ings.map(s => `<span class="pill gray" style="font-size:11.5px">${esc(s)}</span>`).join('')}</div>` : ''}
    ${it.steps && it.steps.length ? `<div class="card-title">做法</div>
      <ol class="steps">${it.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    ${it.note ? `<div class="card-title">小提示</div><div class="small muted">${esc(it.note)}</div>` : ''}
    ${!it.ings.length && !it.steps.length ? '<div class="empty">这道菜还没写内容</div>' : ''}
  `, '<button class="btn block" data-close="1">收起</button>');
}

function openNewMenu() {
  const opts = S.partners.map(p => `<button class="chip" data-pm="${p.user.id}">${esc(p.user.emoji)} ${esc(p.user.nick)}</button>`).join('');
  openSheet('新建共享菜单', `
    <div class="field"><label>菜单名字</label>
      <input class="input" id="nmName" placeholder="比如 周末大餐 / 妈妈爱吃的 / 减脂餐" maxlength="20"></div>
    <div class="field"><label>选个图标</label><div class="grid-c" id="nmEmoji">
      ${['🍱', '🍲', '🥘', '🍜', '🥗', '🍰', '🌶', '🥢'].map((e, i) => `<button type="button" data-e="${e}" class="${i === 0 ? 'on' : ''}"><span class="e">${e}</span></button>`).join('')}
    </div></div>
    <div class="field"><label>共享给（不选就是仅自己可见）</label>
      <div class="chips" id="nmMem">${opts || '<span class="small muted">还没绑定家人，先只做给自己</span>'}</div></div>
    <div class="err" id="nmErr"></div>`,
    `<button class="btn plain grow" data-close="1">取消</button><button class="btn grow" id="nmOk">创建</button>`);

  let emoji = '🍱';
  $$('#nmEmoji button').forEach(b => b.onclick = () => {
    emoji = b.dataset.e;
    $$('#nmEmoji button').forEach(x => x.classList.toggle('on', x.dataset.e === emoji));
  });
  $('#nmOk').onclick = async () => {
    const name = ($('#nmName').value || '').trim();
    if (!name) { $('#nmErr').textContent = '给菜单起个名字'; return; }
    const members = $$('#nmMem [data-pm].on').map(b => b.dataset.pm);
    try {
      await api('/menus', { method: 'POST', body: { name, emoji, members } });
      closeSheet(); await sync(); go('menus'); toast('菜单建好了');
    } catch (e) { $('#nmErr').textContent = e.message; }
  };
  $$('#nmMem [data-pm]').forEach(b => b.onclick = () => b.classList.toggle('on'));
}

function openRenameMenu(m) {
  openModal(`
    <h3 style="margin:0 0 12px;font-size:16px">改菜单</h3>
    <div class="field"><label>名字</label><input class="input" id="rnName" value="${esc(m.name)}" maxlength="20"></div>
    <div class="row" style="gap:8px;margin-top:14px">
      <button class="btn plain grow" id="rnCancel">取消</button>
      <button class="btn grow" id="rnOk">保存</button>
    </div>`);
  $('#rnCancel').onclick = closeModal;
  $('#rnOk').onclick = async () => {
    try {
      await api('/menus/' + m.id, { method: 'PATCH', body: { name: ($('#rnName').value || '').trim() } });
      closeModal(); await sync(); openMenuDetail(m.id); toast('已保存');
    } catch (e) { toast(e.message); }
  };
}

function openAddFromLib(m) {
  openSheet('从菜谱库加菜', `
    <input class="input" id="alq" placeholder="搜菜名">
    <div id="alres" style="margin-top:12px"></div>`);
  const box = $('#alres');
  const render = q => {
    const hits = (q ? S.recipes.filter(r => r.title.includes(q)) : S.recipes).slice(0, 30);
    box.innerHTML = hits.length ? hits.map(r => `<div class="dish" style="margin-bottom:8px">
      <div class="e">${esc(r.emoji || '🍽')}</div>
      <div class="grow"><div class="t">${esc(r.title)}</div><div class="s">${r.time} 分钟 · ${esc(r.category || '')}</div></div>
      <button class="btn xs" data-al="${r.id}">加入</button></div>`).join('') : '<div class="empty">没找到</div>';
    $$('#alres [data-al]').forEach(b => b.onclick = async () => {
      try {
        await api('/menus/' + m.id + '/items', { method: 'POST', body: { rid: b.dataset.al } });
        await sync(); openMenuDetail(m.id); toast('已加入菜单');
      } catch (e) { toast(e.message); }
    });
  };
  $('#alq').oninput = () => render(($('#alq').value || '').trim());
  render('');
}

function openAddOwnDish(m) {
  openSheet('写我自己的菜', `
    <div class="field"><label>菜名</label><input class="input" id="odTitle" placeholder="比如 奶奶的糖醋排骨" maxlength="30"></div>
    <div class="field"><label>图标</label><div class="grid-c" id="odEmoji">
      ${['🍲', '🍳', '🥘', '🍜', '🥗', '🍰', '🥢', '🌶'].map((e, i) => `<button type="button" data-e="${e}" class="${i === 0 ? 'on' : ''}"><span class="e">${e}</span></button>`).join('')}
    </div></div>
    <div class="field"><label>食材（一行一样）</label>
      <textarea class="input" id="odIng" placeholder="排骨 500g&#10;冰糖 30g&#10;香醋 2 勺"></textarea></div>
    <div class="field"><label>做法（一行一步）</label>
      <textarea class="input" id="odStep" style="min-height:120px" placeholder="排骨冷水下锅焯水&#10;炒糖色到枣红&#10;加醋和生抽小火炖 30 分钟"></textarea></div>
    <div class="field"><label>小提示（可选）</label><input class="input" id="odNote" placeholder="比如 醋要分两次放" maxlength="60"></div>
    <div class="err" id="odErr"></div>`,
    `<button class="btn plain grow" data-close="1">取消</button><button class="btn grow" id="odOk">加进菜单</button>`);

  let emoji = '🍲';
  $$('#odEmoji button').forEach(b => b.onclick = () => {
    emoji = b.dataset.e;
    $$('#odEmoji button').forEach(x => x.classList.toggle('on', x.dataset.e === emoji));
  });
  $('#odOk').onclick = async () => {
    const title = ($('#odTitle').value || '').trim();
    if (!title) { $('#odErr').textContent = '菜名不能空'; return; }
    const ings = ($('#odIng').value || '').split('\n').map(s => s.trim()).filter(Boolean);
    const steps = ($('#odStep').value || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (!steps.length) { $('#odErr').textContent = '至少写一步做法'; return; }
    try {
      await api('/menus/' + m.id + '/items', {
        method: 'POST', body: { title, emoji, ings, steps, note: ($('#odNote').value || '').trim() }
      });
      closeSheet(); await sync(); openMenuDetail(m.id); toast('已加进菜单');
    } catch (e) { $('#odErr').textContent = e.message; }
  };
}

function openShareMenu(m) {
  const opts = S.partners.map(p => {
    const on = m.members.some(x => x.id === p.user.id);
    return `<button class="chip ${on ? 'on' : ''}" data-sm="${p.user.id}">${esc(p.user.emoji)} ${esc(p.user.nick)}</button>`;
  }).join('');
  openSheet('共享设置', `
    <div class="small muted" style="margin-bottom:12px">勾上的家人能在自己的「菜单」里看到这个菜单。没勾的只有你自己能看到。</div>
    <div class="chips" id="smBox">${opts || '<span class="small muted">还没绑定家人</span>'}</div>`,
    `<button class="btn plain grow" data-close="1">取消</button><button class="btn grow" id="smOk">保存</button>`);
  $$('#smBox [data-sm]').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('#smOk').onclick = async () => {
    const members = $$('#smBox [data-sm].on').map(b => b.dataset.sm);
    try {
      await api('/menus/' + m.id + '/members', { method: 'POST', body: { members } });
      await sync(); openMenuDetail(m.id); toast('共享设置已保存');
    } catch (e) { toast(e.message); }
  };
}

