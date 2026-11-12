/* ================= 美食广场 ================= */
function viewPlaza() {
  $('#tbActions').innerHTML = `<button class="icon-btn" id="pNew">✏️</button>`;
  const tabs = [
    { k: 'latest', t: '最新' }, { k: 'following', t: '关注' },
    { k: 'fav', t: '收藏' }, { k: 'mine', t: '我的' }
  ];
  $('#view').innerHTML = `
    <div class="chips" style="margin-bottom:12px">
      ${tabs.map(x => `<button class="chip ${S.plazaTab === x.k ? 'on' : ''}" data-pt="${x.k}">${x.t}</button>`).join('')}
    </div>
    <div id="plazaList"><div class="empty"><span class="e">🌈</span>正在加载…</div></div>
  `;
  $('#pNew').onclick = openNewPost;
  $$('#view [data-pt]').forEach(b => b.onclick = () => { S.plazaTab = b.dataset.pt; loadPlaza(); go('plaza', true); });
  loadPlaza();
}

async function loadPlaza() {
  try {
    const d = await api('/plaza?tab=' + encodeURIComponent(S.plazaTab));
    S.plaza = d.posts || [];
    const box = $('#plazaList');
    if (!box) return;
    box.innerHTML = S.plaza.length ? S.plaza.map(postCard).join('')
      : `<div class="empty"><span class="e">🌈</span>${S.plazaTab === 'following' ? '关注的 人还没发内容<br>去「最新」看看，关注喜欢的' : S.plazaTab === 'fav' ? '还没有收藏<br>看到喜欢的点收藏' : S.plazaTab === 'mine' ? '你还没发过<br>点右上角笔写发一个' : '广场还很安静<br>发第一个吧'}</div>`;
    bindPostCards();
  } catch (e) { toast(e.message); }
}

function postCard(p) {
  return `<div class="post" data-post="${p.id}">
    <div class="p-head">
      <div class="avatar" data-user="${p.author.id}" style="cursor:pointer">${esc(p.author.emoji)}</div>
      <div class="grow" data-user="${p.author.id}" style="cursor:pointer">
        <div style="font-size:13.5px;font-weight:800">${esc(p.author.nick)}</div>
        <div class="tiny muted">${fmtTime(p.createdAt)}</div>
      </div>
      ${p.isMine ? `<button class="btn danger xs" data-pdel="${p.id}">删除</button>` : ''}
    </div>
    <div class="p-title">${esc(p.title)}</div>
    ${p.text ? `<div class="p-text">${esc(p.text)}</div>` : ''}
    ${p.photos && p.photos.length ? `<div class="photos">${p.photos.map(u => `<img src="${esc(u)}" data-img="${esc(u)}" loading="lazy" alt="">`).join('')}</div>` : ''}
    ${p.steps && p.steps.length ? `<div style="padding:10px 14px"><ol class="steps" style="margin:0">
      ${p.steps.slice(0, 6).map(s => `<li style="font-size:12.5px;padding-bottom:10px">${esc(s)}</li>`).join('')}</ol>
      ${p.steps.length > 6 ? `<div class="tiny muted">还有 ${p.steps.length - 6} 步…</div>` : ''}</div>` : ''}
    <div class="p-foot">
      <button data-like="${p.id}" class="${p.liked ? 'on' : ''}">${p.liked ? '❤️' : '🤍'} ${p.likeCount}</button>
      <button data-cmt="${p.id}">💬 ${p.commentCount}</button>
      <button data-fav="${p.id}" class="${p.faved ? 'on' : ''}">${p.faved ? '⭐' : '☆'} ${p.favCount}</button>
      ${p.isMine ? '' : `<button data-follow="${p.author.id}" class="${p.followingAuthor ? 'on' : ''}">${p.followingAuthor ? '已关注' : '＋关注'}</button>`}
    </div>
    ${p.comments && p.comments.length ? `<div class="comments">
      ${p.comments.map(c => `<div class="comment">
        <div class="avatar xs">${esc(c.emoji)}</div>
        <div class="cbody"><b style="font-size:12px">${esc(c.nick)}</b>
        <div style="margin-top:2px">${esc(c.text)}</div></div></div>`).join('')}
    </div>` : ''}
  </div>`;
}

function bindPostCards() {
  $$('#view [data-like]').forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    try {
      const d = await api('/plaza/' + b.dataset.like + '/like', { method: 'POST' });
      patchPost(d.post);
    } catch (e) { toast(e.message); }
  });
  $$('#view [data-fav]').forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    try {
      const d = await api('/plaza/' + b.dataset.fav + '/fav', { method: 'POST' });
      patchPost(d.post);
      toast(d.post.faved ? '已收藏' : '已取消收藏');
    } catch (e) { toast(e.message); }
  });
  $$('#view [data-cmt]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const p = S.plaza.find(x => x.id === b.dataset.cmt);
    if (p) openComment(p);
  });
  $$('#view [data-follow]').forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    try {
      const d = await api('/follow/' + b.dataset.follow, { method: 'POST' });
      toast(d.following ? '已关注' : '已取消关注');
      loadPlaza();
    } catch (e) { toast(e.message); }
  });
  $$('#view [data-pdel]').forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    if (!confirm('删除这条？')) return;
    try { await api('/plaza/' + b.dataset.pdel + '/del', { method: 'POST' }); loadPlaza(); toast('已删除'); }
    catch (e) { toast(e.message); }
  });
  $$('#view [data-img]').forEach(img => img.onclick = () => openModal(
    `<img src="${esc(img.dataset.img)}" style="width:100%;border-radius:12px;display:block">` +
    `<button class="btn ghost block" style="margin-top:12px" id="imgClose">关闭</button>`));
  $$('#view [data-user]').forEach(el => el.onclick = () => openUser(el.dataset.user));
}

function patchPost(p) {
  const i = S.plaza.findIndex(x => x.id === p.id);
  if (i >= 0) S.plaza[i] = p;
  const el = document.querySelector('#view [data-post="' + p.id + '"]');
  if (el) {
    const tmp = document.createElement('div');
    tmp.innerHTML = postCard(p);
    el.replaceWith(tmp.firstElementChild);
    bindPostCards();
  }
}

function openComment(p) {
  openSheet('评论 · ' + p.title, `
    <div id="cmList">${p.comments && p.comments.length ? p.comments.map(c => `<div class="comment">
      <div class="avatar xs">${esc(c.emoji)}</div>
      <div class="cbody"><b style="font-size:12px">${esc(c.nick)}</b>
      <div style="margin-top:2px">${esc(c.text)}</div></div></div>`).join('') : '<div class="small muted">还没有评论，说点什么</div>'}</div>`,
    `<input class="input" id="cmInput" placeholder="写句评论…" style="flex:1">
     <button class="btn" id="cmSend">发送</button>`);
  $('#cmSend').onclick = async () => {
    const text = ($('#cmInput').value || '').trim();
    if (!text) return;
    try {
      const d = await api('/plaza/' + p.id + '/comment', { method: 'POST', body: { text } });
      patchPost(d.post);
      openComment(d.post);
      toast('评论成功');
    } catch (e) { toast(e.message); }
  };
  $('#cmInput').onkeydown = ev => { if (ev.key === 'Enter') $('#cmSend').click(); };
}

function openNewPost() {
  openSheet('发布我的美食', `
    <div class="field"><label>菜名</label><input class="input" id="npTitle" placeholder="今天做了什么" maxlength="40"></div>
    <div class="field"><label>说两句</label><textarea class="input" id="npText" placeholder="味道怎么样、哪里可以改进" maxlength="800"></textarea></div>
    <div class="field"><label>做法（一行一步，可空）</label>
      <textarea class="input" id="npSteps" style="min-height:100px" placeholder="热锅冷油&#10;下葱姜爆香&#10;加水炖 20 分钟"></textarea></div>
    <div class="field"><label>照片（最多 4 张）</label>
      <input type="file" id="npFile" accept="image/*" multiple style="display:none">
      <button class="btn plain block" id="npPick">📷 选照片</button>
      <div id="npPrev" style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px"></div>
    </div>
    <div class="err" id="npErr"></div>`,
    `<button class="btn plain grow" data-close="1">取消</button><button class="btn grow" id="npOk">发布</button>`);

  const photos = [];
  $('#npPick').onclick = () => $('#npFile').click();
  $('#npFile').onchange = async ev => {
    const files = Array.prototype.slice.call(ev.target.files || []).slice(0, 4 - photos.length);
    for (const f of files) {
      const b64 = await compressImage(f);
      if (b64) photos.push(b64);
    }
    $('#npPrev').innerHTML = photos.map((p, i) => `<div style="position:relative">
      <img src="${p}" style="width:66px;height:66px;object-fit:cover;border-radius:10px">
      <button class="icon-btn" data-prm="${i}" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;font-size:11px;border-radius:50%">✕</button></div>`).join('');
    $$('#npPrev [data-prm]').forEach(b => b.onclick = () => { photos.splice(+b.dataset.prm, 1); $('#npFile').onchange({ target: { files: [] } }); $('#npPrev').innerHTML = photos.map((p, i) => `<img src="${p}" style="width:66px;height:66px;object-fit:cover;border-radius:10px">`).join(''); });
  };

  $('#npOk').onclick = async () => {
    const title = ($('#npTitle').value || '').trim();
    if (!title) { $('#npErr').textContent = '给这道菜起个名字'; return; }
    const steps = ($('#npSteps').value || '').split('\n').map(s => s.trim()).filter(Boolean);
    $('#npOk').disabled = true; $('#npOk').textContent = '发布中…';
    try {
      await api('/plaza', {
        method: 'POST',
        body: { title, text: ($('#npText').value || '').trim(), steps, photos }
      });
      closeSheet(); S.plazaTab = 'mine'; go('plaza'); toast('已发布，大家都看得到');
    } catch (e) { $('#npErr').textContent = e.message; $('#npOk').disabled = false; $('#npOk').textContent = '发布'; }
  };
}

function compressImage(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1000;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          const s = max / Math.max(w, h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => resolve(null);
      img.src = r.result;
    };
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}

/* ================= 关注 / 粉丝 ================= */
async function openFollowSheet() {
  try {
    const [f1, f2, f3] = await Promise.all([api('/following'), api('/followers'), api('/suggest')]);
    S.myFollowing = f1.users || [];
    S.myFollowers = f2.users || [];
    S.suggest = f3.users || [];
  } catch (e) { return toast(e.message); }

  const rowU = (u, right) => `<div class="ritem">
    <div class="avatar" data-user="${u.id}">${esc(u.emoji || '🙂')}</div>
    <div class="grow" data-user="${u.id}"><div class="t">${esc(u.nick)} ${u.isPartner ? '<span class="pill tiny">已绑定</span>' : ''}</div>
    <div class="s">${u.posts || 0} 篇 · 粉丝 ${u.followers || 0}</div></div>
    ${right || ''}</div>`;

  openSheet('关注与粉丝', `
    <div class="chips" style="margin-bottom:14px">
      <button class="chip on" data-ft="following">关注 ${S.myFollowing.length}</button>
      <button class="chip" data-ft="followers">粉丝 ${S.myFollowers.length}</button>
      <button class="chip" data-ft="suggest">推荐 ${S.suggest.length}</button>
    </div>
    <div id="ftBox"></div>
    <div class="card flat small muted" style="margin-top:8px">
      💡 关注是「看谁的内容」，绑定是「互相点菜」，两者互不影响。可以关注不认识的人，也可以只看不关注。
    </div>
  `);

  const render = k => {
    const box = $('#ftBox');
    if (k === 'following') {
      box.innerHTML = S.myFollowing.length ? S.myFollowing.map(u => rowU(u,
        `<button class="btn plain xs" data-unf="${u.id}">已关注</button>`)).join('')
        : '<div class="empty"><span class="e">👥</span>还没关注任何人<br>去「推荐」看看</div>';
      $$('#ftBox [data-unf]').forEach(b => b.onclick = async () => {
        try { await api('/follow/' + b.dataset.unf, { method: 'POST' }); openFollowSheet(); }
        catch (e) { toast(e.message); }
      });
    } else if (k === 'followers') {
      const ids = S.myFollowing.map(u => u.id);
      box.innerHTML = S.myFollowers.length ? S.myFollowers.map(u => rowU(u,
        ids.includes(u.id) ? '<span class="pill">互相关注</span>' : `<button class="btn xs" data-fb="${u.id}">回关</button>`)).join('')
        : '<div class="empty"><span class="e">🙂</span>还没有粉丝<br>发点内容到广场</div>';
      $$('#ftBox [data-fb]').forEach(b => b.onclick = async () => {
        try { await api('/follow/' + b.dataset.fb, { method: 'POST' }); openFollowSheet(); toast('已回关'); }
        catch (e) { toast(e.message); }
      });
    } else {
      box.innerHTML = S.suggest.length ? S.suggest.map(u => rowU(u,
        `<button class="btn xs" data-fs="${u.id}">关注</button>`)).join('')
        : '<div class="empty"><span class="e">🌱</span>暂时没有推荐<br>等更多人来注册</div>';
      $$('#ftBox [data-fs]').forEach(b => b.onclick = async () => {
        try { await api('/follow/' + b.dataset.fs, { method: 'POST' }); openFollowSheet(); toast('已关注'); }
        catch (e) { toast(e.message); }
      });
    }
    $$('#ftBox [data-user]').forEach(el => el.onclick = () => openUser(el.dataset.user));
  };

  $$('#shBody [data-ft]').forEach(b => b.onclick = () => {
    $$('#shBody [data-ft]').forEach(x => x.classList.toggle('on', x === b));
    render(b.dataset.ft);
  });
  render('following');
  await sync();
}

async function openUser(uid) {
  try {
    const d = await api('/users/' + uid);
    const u = d.user;
    openSheet(u.nick, `
      <div class="row" style="gap:12px;margin-bottom:14px">
        <div class="avatar lg" style="width:62px;height:62px;font-size:32px">${esc(u.emoji)}</div>
        <div class="grow">
          <div style="font-weight:850;font-size:17px">${esc(u.nick)}</div>
          <div class="tiny muted" style="margin-top:3px">${d.isPartner ? '<span class="pill tiny">已绑定</span> ' : ''}${d.mutual ? '互相关注' : d.followsMe ? '关注了你' : ''}</div>
        </div>
      </div>
      ${u.bio ? `<div class="small" style="margin-bottom:12px">${esc(u.bio)}</div>` : ''}
      <div class="stats" style="margin-bottom:14px">
        <div><div class="n">${u.posts}</div><div class="l">作品</div></div>
        <div><div class="n">${u.followers}</div><div class="l">粉丝</div></div>
        <div><div class="n">${u.following}</div><div class="l">关注</div></div>
      </div>
      <div class="row" style="gap:8px;margin-bottom:16px">
        <button class="btn ${d.following ? 'plain' : ''} grow" id="uFollow">${d.following ? '已关注' : '＋ 关注'}</button>
      </div>
      <div class="card-title">TA 的美食</div>
      ${d.posts.length ? d.posts.map(p => `<div class="dish" style="align-items:flex-start">
        <div class="e">${esc((p.photos && p.photos[0]) ? '🖼' : '🍲')}</div>
        <div class="grow"><div class="t">${esc(p.title)}</div>
        <div class="s">${fmtTime(p.createdAt)} · ❤️ ${p.likeCount} · 💬 ${p.commentCount}</div></div></div>`).join('')
        : '<div class="empty" style="padding:20px">还没发过内容</div>'}
    `, '<button class="btn block" data-close="1">收起</button>');
    $('#uFollow').onclick = async () => {
      try {
        const r = await api('/follow/' + uid, { method: 'POST' });
        toast(r.following ? '已关注' : '已取消关注');
        openUser(uid);
      } catch (e) { toast(e.message); }
    };
  } catch (e) { toast(e.message); }
}

/* ================= 我的 ================= */
function viewMine() {
  const u = S.me || {};
  $('#tbActions').innerHTML = '';
  $('#view').innerHTML = `
    <div class="card">
      <div class="row" style="gap:12px">
        <div class="avatar lg" style="width:60px;height:60px;font-size:30px">${esc(u.emoji || '🙂')}</div>
        <div class="grow">
          <div style="font-weight:850;font-size:17px">${esc(u.nick || '')}</div>
          <div class="tiny muted" style="margin-top:3px">${esc(u.phoneMask || '')}</div>
        </div>
        <button class="icon-btn" id="meEdit">✏️</button>
      </div>
      <div class="stats" style="margin-top:14px">
        <div id="meFollowers"><div class="n">${S.counts.followers || 0}</div><div class="l">粉丝</div></div>
        <div id="meFollowing"><div class="n">${S.counts.following || 0}</div><div class="l">关注</div></div>
        <div><div class="n">${S.counts.posts || 0}</div><div class="l">作品</div></div>
        <div><div class="n">${S.counts.binds || 0}</div><div class="l">绑定</div></div>
      </div>
    </div>

    <h2 class="sec">外观</h2>
    <div class="card flat" style="padding:6px 14px">
      <div class="ritem" data-go="look"><div class="ico">🎨</div>
        <div class="grow"><div class="t">主题 · 背景 · 图标</div>
        <div class="s">当前：${themeName(u.theme)} / ${bgName(u.bg)} / ${esc(u.icon || '🍲')}</div></div><div class="arrow">›</div></div>
    </div>

    <h2 class="sec">绑定关系 ${S.partners.length} 人</h2>
    <div class="card flat" style="padding:6px 14px">
      ${S.partners.map(p => `<div class="ritem">
        <div class="avatar sm">${esc(p.user.emoji || '🙂')}</div>
        <div class="grow"><div class="t">${esc(p.user.nick)}</div><div class="s">${esc(p.rel)}</div></div>
        <button class="btn plain xs" data-orderfor="${p.user.id}">点菜</button></div>`).join('')
        || '<div class="ritem" id="meBindEmpty"><div class="ico">👨‍👩‍👧</div><div class="grow"><div class="t">还没绑定家人</div><div class="s">绑定后能互相点菜</div></div><div class="arrow">›</div></div>'}
      <div class="ritem" id="meBind"><div class="ico">＋</div>
        <div class="grow"><div class="t">添加绑定</div><div class="s">6 位随机码，5 分钟内有效</div></div><div class="arrow">›</div></div>
    </div>

    <h2 class="sec">设置</h2>
    <div class="card flat" style="padding:6px 14px">
      <div class="ritem" id="meShop"><div class="ico">🧺</div>
        <div class="grow"><div class="t">买菜清单</div><div class="s">按待做的单子自动汇总</div></div><div class="arrow">›</div></div>
      <div class="ritem" id="meInstall"><div class="ico">📲</div>
        <div class="grow"><div class="t">添加到手机桌面</div><div class="s">安卓 / 苹果安装方法</div></div><div class="arrow">›</div></div>
      <div class="ritem" id="meShare"><div class="ico">🔗</div>
        <div class="grow"><div class="t">分享给家人</div><div class="s">把链接发出去</div></div><div class="arrow">›</div></div>
      <div class="ritem" id="mePwd"><div class="ico">🔒</div>
        <div class="grow"><div class="t">修改密码</div><div class="s">定期换一下更安全</div></div><div class="arrow">›</div></div>
    </div>

    <button class="btn plain block" id="meOut" style="margin-top:16px;color:var(--danger)">退出登录</button>
    <div class="tiny muted" style="text-align:center;margin:16px 0 6px;line-height:1.7">
      ${S.recipes.length} 道菜谱 · 数据存在自己的服务器上<br>换手机登录同一账号就能看到全部
    </div>
  `;

  $$('#view [data-go]').forEach(el => el.onclick = () => openLookSheet());
  $('#meEdit').onclick = openEditProfile;
  $('#meBind').onclick = openBindSheet;
  if ($('#meBindEmpty')) $('#meBindEmpty').onclick = openBindSheet;
  $('#meShop').onclick = openShopList;
  $('#meInstall').onclick = openInstall;
  $('#meShare').onclick = () => {
    const url = location.origin;
    if (navigator.share) navigator.share({ title: '做饭吧', text: '家里的点菜 App', url }).catch(() => {});
    else { navigator.clipboard.writeText(url).then(() => toast('链接已复制')).catch(() => toast(url)); }
  };
  $('#mePwd').onclick = openChangePwd;
  $('#meOut').onclick = async () => {
    if (!confirm('退出登录？')) return;
    try { await api('/logout', { method: 'POST' }); } catch (e) {}
    logoutLocal();
  };
  const fo = $('#meFollowers'), fg = $('#meFollowing');
  if (fo) fo.onclick = openFollowSheet;
  if (fg) fg.onclick = openFollowSheet;
  $$('#view [data-orderfor]').forEach(b => b.onclick = () => {
    S.cartTo = b.dataset.orderfor;
    go('order');
  });
}

const THEMES = [
  { k: 'sunset', n: '暖阳橙', e: '🍊', c: '#ff7a45' },
  { k: 'sakura', n: '樱花粉', e: '🌸', c: '#f0679a' },
  { k: 'mint', n: '薄荷绿', e: '🌿', c: '#16b292' },
  { k: 'ocean', n: '海洋蓝', e: '🌊', c: '#2b84e8' },
  { k: 'grape', n: '葡萄紫', e: '🍇', c: '#8b5cf6' },
  { k: 'matcha', n: '抹茶', e: '🍵', c: '#7fa63c' },
  { k: 'coffee', n: '咖啡棕', e: '☕', c: '#9c6b46' },
  { k: 'butter', n: '奶油黄', e: '🧈', c: '#e0a01c' },
  { k: 'ink', n: '水墨', e: '🖋', c: '#3b3b3b' }
];
const BGS = [
  { k: 'none', n: '默认' }, { k: 'aurora', n: '晨光' }, { k: 'sakura', n: '落樱' },
  { k: 'sea', n: '海面' }, { k: 'forest', n: '林间' }, { k: 'cream', n: '奶油' },
  { k: 'dusk', n: '暮色' }, { k: 'night', n: '夜幕' }, { k: 'neon', n: '霓虹' },
  { k: 'dots', n: '圆点' }, { k: 'grid', n: '网格' }, { k: 'kraft', n: '牛皮纸' }
];
const ICONS = ['🍲', '🍜', '🥘', '🍳', '🍱', '🥗', '🍚', '🍙', '🍞', '🥟', '🍗', '🍖', '🍤', '🍰', '🧁', '🍩', '☕', '🍵', '🍺', '🥢', '🔪', '🏠', '💕', '🐱', '🌟', '❤️', '🔥'];

function themeName(k) { const t = THEMES.find(x => x.k === k); return t ? t.n : '暖阳橙'; }
function bgName(k) { const b = BGS.find(x => x.k === k); return b ? b.n : '默认'; }

async function openLookSheet() {
  const u = S.me || {};
  openSheet('外观', `
    <div class="card-title">主题配色 ${THEMES.length} 套</div>
    <div class="grid-c" style="margin-bottom:18px">
      ${THEMES.map(t => `<button data-th="${t.k}" class="${(u.theme || 'sunset') === t.k ? 'on' : ''}">
        <span class="swatch" style="background:linear-gradient(135deg,${t.c},${t.c}99)"></span>${t.n}</button>`).join('')}
    </div>

    <div class="card-title">背景 ${BGS.length} 款</div>
    <div class="grid-c" style="margin-bottom:18px">
      ${BGS.map(b => `<button data-bg="${b.k}" class="${(u.bg || 'none') === b.k ? 'on' : ''}">
        <span class="swatch bg-${b.k}" style="border:1px solid var(--line)"></span>${b.n}</button>`).join('')}
    </div>

    <div class="card-title">App 图标 ${ICONS.length} 个</div>
    <div class="grid-c" style="margin-bottom:8px">
      ${ICONS.map(e => `<button data-ic="${e}" class="${(u.icon || '🍲') === e ? 'on' : ''}"><span class="e">${e}</span></button>`).join('')}
    </div>
  `, '<button class="btn block" data-close="1">好了</button>');

  const patch = async body => {
    try {
      const d = await api('/me', { method: 'PATCH', body });
      S.me = d.user;
      applyLook();
      toast('已保存');
    } catch (e) { toast(e.message); }
  };
  $$('#shBody [data-th]').forEach(b => b.onclick = async () => {
    await patch({ theme: b.dataset.th });
    $$('#shBody [data-th]').forEach(x => x.classList.toggle('on', x === b));
  });
  $$('#shBody [data-bg]').forEach(b => b.onclick = async () => {
    await patch({ bg: b.dataset.bg });
    $$('#shBody [data-bg]').forEach(x => x.classList.toggle('on', x === b));
  });
  $$('#shBody [data-ic]').forEach(b => b.onclick = async () => {
    await patch({ icon: b.dataset.ic });
    $$('#shBody [data-ic]').forEach(x => x.classList.toggle('on', x === b));
  });
}

function openEditProfile() {
  const u = S.me || {};
  openModal(`
    <h3 style="margin:0 0 14px;font-size:16px">编辑资料</h3>
    <div class="field"><label>昵称</label><input class="input" id="epNick" value="${esc(u.nick || '')}" maxlength="12"></div>
    <div class="field"><label>一句话介绍</label><input class="input" id="epBio" value="${esc(u.bio || '')}" maxlength="60" placeholder="比如 爱吃辣，不会做甜品"></div>
    <div class="field"><label>头像</label><div class="grid-c" id="epEmoji">
      ${['🙂', '👩', '👨', '🧑', '👵', '👴', '🐱', '🍳', '🍲', '🌶', '🍰', '🥢'].map(e => `<button type="button" data-e="${e}" class="${(u.emoji || '🙂') === e ? 'on' : ''}"><span class="e">${e}</span></button>`).join('')}
    </div></div>
    <div class="row" style="gap:8px;margin-top:16px">
      <button class="btn plain grow" id="epCancel">取消</button>
      <button class="btn grow" id="epOk">保存</button>
    </div>`);
  let emoji = u.emoji || '🙂';
  $$('#epEmoji button').forEach(b => b.onclick = () => {
    emoji = b.dataset.e;
    $$('#epEmoji button').forEach(x => x.classList.toggle('on', x.dataset.e === emoji));
  });
  $('#epCancel').onclick = closeModal;
  $('#epOk').onclick = async () => {
    try {
      const d = await api('/me', {
        method: 'PATCH',
        body: { nick: ($('#epNick').value || '').trim(), bio: ($('#epBio').value || '').trim(), emoji }
      });
      S.me = d.user; closeModal(); await sync(); go('mine'); toast('已保存');
    } catch (e) { toast(e.message); }
  };
}

function openChangePwd() {
  openModal(`
    <h3 style="margin:0 0 14px;font-size:16px">修改密码</h3>
    <div class="field"><label>当前密码</label><input class="input" type="password" id="cpOld"></div>
    <div class="field"><label>新密码</label><input class="input" type="password" id="cpNew" placeholder="至少 6 位"></div>
    <div class="err" id="cpErr"></div>
    <div class="row" style="gap:8px;margin-top:10px">
      <button class="btn plain grow" id="cpCancel">取消</button>
      <button class="btn grow" id="cpOk">保存</button>
    </div>
    <div class="tiny muted" style="margin-top:12px">修改后用新密码重新登录一次</div>`);
  $('#cpCancel').onclick = closeModal;
  $('#cpOk').onclick = async () => {
    const oldP = $('#cpOld').value || '', newP = $('#cpNew').value || '';
    if (newP.length < 6) { $('#cpErr').textContent = '新密码至少 6 位'; return; }
    try {
      await api('/pwd', { method: 'POST', body: { oldPwd: oldP, newPwd: newP } });
      closeModal(); toast('密码已改，请重新登录'); setTimeout(logoutLocal, 900);
    } catch (e) { $('#cpErr').textContent = e.message; }
  };
}

function openInstall() {
  openSheet('添加到手机桌面', `
    <div class="card-title">🤖 安卓（Chrome / 夸克 / 华为 / 小米）</div>
    <ol class="steps" style="margin-bottom:18px">
      <li>用手机浏览器打开本页</li>
      <li>点右上角「⋮」菜单</li>
      <li>选「添加到主屏幕」（有的显示「安装应用」）</li>
      <li>桌面出现图标，点开是全屏，没有地址栏</li>
    </ol>
    <div class="card-title">🍎 苹果（必须用 Safari）</div>
    <ol class="steps" style="margin-bottom:18px">
      <li>用 Safari 打开本页</li>
      <li>点底部中间的「分享」按钮</li>
      <li>往下滑，选「添加到主屏幕」</li>
      <li>右上角「添加」→ 桌面出现图标</li>
    </ol>
    <div class="card flat small" style="background:var(--brand-soft);border:0;color:var(--brand)">
      装到桌面后，点开就是 App 的样子，跟应用商店下载的体验一样。
    </div>
  `, '<button class="btn block" data-close="1">知道了</button>');
}

/* ================= 全局事件 ================= */
document.addEventListener('click', ev => {
  if (ev.target.closest('#layer [data-close]')) { closeSheet(); return; }
  if (ev.target.closest('#modal [data-mclose]')) { closeModal(); return; }
  if (ev.target.id === 'imgClose') { closeModal(); return; }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.token) sync(true);
});

/* ================= 启动 ================= */
(async function init() {
  await loadRecipes();
  if (S.token) {
    try {
      const d = await api('/sync');
      S.me = d.user;
      await boot();
      return;
    } catch (e) {
      localStorage.removeItem(LSKEY); S.token = '';
    }
  }
  $('#auth').style.display = 'flex';
  renderAuth();
})();
