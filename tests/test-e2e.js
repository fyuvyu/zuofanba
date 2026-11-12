#!/usr/bin/env node
/* 端到端接口验证：两个账号 → 随机码绑定(5min) → 直接收单 → 共享菜单 → 广场互动 → 关注粉丝 */
const B = 'http://localhost:3000/api';
let fails = 0;
function ok(cond, label, extra) {
  console.log((cond ? '  ✅ ' : '  ❌ ') + label + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
}
async function call(path, method, body, token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(B + path, { method: method || 'GET', headers: h, body: body ? JSON.stringify(body) : undefined });
  let d = {};
  try { d = await r.json(); } catch (e) {}
  return { code: r.status, d };
}

(async () => {
  const stamp = Date.now().toString().slice(-6);
  const A = { phone: '138' + stamp + '00', pwd: 'abc123456', nick: '阿明' + stamp, emoji: '🍳' };
  const C = { phone: '139' + stamp + '00', pwd: 'abc123456', nick: '阿珍' + stamp, emoji: '🌶' };

  console.log('\n【1】注册两个账号');
  const ra = await call('/register', 'POST', A);
  ok(ra.code === 200 && ra.d.user, '注册 A（' + A.nick + '）');
  const rc = await call('/register', 'POST', C);
  ok(rc.code === 200 && rc.d.user, '注册 C（' + C.nick + '）');
  const ta = ra.d.token, tc = rc.d.token;
  const idA = ra.d.user.id, idC = rc.d.user.id;

  console.log('\n【2】重复注册应被拒');
  const dup = await call('/register', 'POST', A);
  ok(dup.code === 400, '同手机号二次注册被拦', dup.d.error || '');

  console.log('\n【3】登录 + 错密码');
  const lg = await call('/login', 'POST', { phone: A.phone, pwd: A.pwd });
  ok(lg.code === 200 && lg.d.token, '正确密码登录成功');
  const bad = await call('/login', 'POST', { phone: A.phone, pwd: 'wrong999' });
  ok(bad.code === 400, '错密码被拒', bad.d.error || '');

  console.log('\n【4】随机 6 位绑定码 + 有效期 5 分钟');
  const c1 = await call('/bind/code', 'POST', {}, ta);
  ok(c1.code === 200 && /^\d{6}$/.test(c1.d.code), 'A 生成 6 位码', '码=' + c1.d.code);
  ok(c1.d.ttl === 300, '有效期 300 秒（5 分钟）', 'ttl=' + c1.d.ttl);
  const c1b = await call('/bind/code', 'POST', {}, ta);
  ok(c1b.d.code !== c1.d.code, '重新生成得到不同的随机码', c1.d.code + ' → ' + c1b.d.code);
  const c1c = await call('/bind/code', 'POST', {}, ta);
  ok(c1c.d.code !== c1b.d.code, '第三次又是新的随机码', c1b.d.code + ' → ' + c1c.d.code);

  console.log('\n【5】C 用 A 的码绑定（无需复制粘贴）');
  const bind = await call('/bind/use', 'POST', { code: c1c.d.code, rel: '情侣' }, tc);
  ok(bind.code === 200 && bind.d.bind, 'C 输入 A 的码绑定成功', '关系=' + (bind.d.bind ? bind.d.bind.rel : ''));
  const reuse = await call('/bind/use', 'POST', { code: c1c.d.code, rel: '家人' }, tc);
  ok(reuse.code === 400, '码用一次即失效（防重放）', reuse.d.error || '');
  const wrong = await call('/bind/use', 'POST', { code: '000000', rel: '家人' }, ta);
  ok(wrong.code === 400, '错误码被拒', wrong.d.error || '');
  const selfCode = await call('/bind/code', 'POST', {}, ta);
  const selfUse = await call('/bind/use', 'POST', { code: selfCode.d.code, rel: '家人' }, ta);
  ok(selfUse.code === 400, '不能绑定自己', selfUse.d.error || '');

  console.log('\n【6】双方都看到绑定关系');
  const sA = await call('/sync', 'GET', null, ta);
  const sC = await call('/sync', 'GET', null, tc);
  ok(sA.d.partners.length === 1 && sA.d.partners[0].user.id === idC, 'A 看到已绑定 C');
  ok(sC.d.partners.length === 1 && sC.d.partners[0].user.id === idA, 'C 看到已绑定 A');

  console.log('\n【7】A 给 C 点菜 → C 直接收到（无需复制粘贴）');
  const rec = await call('/recipes', 'GET');
  ok(rec.d.recipes.length >= 80, '菜谱库加载', rec.d.recipes.length + ' 道');
  const r1 = rec.d.recipes[0], r2 = rec.d.recipes[1];
  const ord = await call('/orders', 'POST', {
    to: idC,
    items: [{ rid: r1.id, title: r1.title, emoji: r1.emoji, q: 1 }, { rid: r2.id, title: r2.title, emoji: r2.emoji, q: 2 }],
    note: '少放点辣椒'
  }, ta);
  ok(ord.code === 200 && ord.d.order, 'A 下单成功', '2 道菜');
  const sC2 = await call('/sync', 'GET', null, tc);
  ok(sC2.d.orders.in.length === 1, 'C 端同步直接看到这单');
  ok(sC2.d.orders.in[0].from.id === idA && sC2.d.orders.in[0].dir === 'in', '订单方向正确（in）');
  ok(sC2.d.orders.in[0].note === '少放点辣椒', '留言随单送达');
  ok(sC2.d.needDo === 1 && sC2.d.unread === 1, 'C 有待做 1 · 未读 1');
  const oid = ord.d.order.id;

  console.log('\n【8】未绑定的人不能点菜');
  const R3 = await call('/register', 'POST', { phone: '137' + stamp + '00', pwd: 'abc123456', nick: '陌生人' + stamp });
  const stranger = await call('/orders', 'POST', { to: idC, items: [{ title: 'x', q: 1 }] }, R3.d.token);
  ok(stranger.code === 400, '陌生人给 C 点菜被拒', stranger.d.error || '');

  console.log('\n【9】C 开始做 → 做好了带回话 → A 端可见');
  const doing = await call('/orders/' + oid + '/status', 'POST', { status: 'doing' }, tc);
  ok(doing.code === 200 && doing.d.order.status === 'doing', 'C 标记开始做');
  const done = await call('/orders/' + oid + '/status', 'POST', { status: 'done', reply: '菜在锅里，趁热吃' }, tc);
  ok(done.code === 200 && done.d.order.status === 'done', 'C 标记做好了');
  const sA2 = await call('/sync', 'GET', null, ta);
  ok(sA2.d.orders.out[0].status === 'done', 'A 端看到状态变已完成');
  ok(sA2.d.orders.out[0].reply === '菜在锅里，趁热吃', 'A 端看到回话', sA2.d.orders.out[0].reply);
  const notMine = await call('/orders/' + oid + '/status', 'POST', { status: 'doing' }, ta);
  ok(notMine.code === 403, '非接收人不能改状态');

  console.log('\n【10】共享菜单：自定义命名 + 自建菜 + 分组共享');
  const m1 = await call('/menus', 'POST', { name: '周末大餐', emoji: '🥘', members: [idC] }, ta);
  ok(m1.code === 200 && m1.d.menu.name === '周末大餐', 'A 建菜单「周末大餐」');
  const m1id = m1.d.menu.id;
  const m2 = await call('/menus', 'POST', { name: '我的减脂餐', emoji: '🥗', members: [] }, ta);
  ok(m2.code === 200, 'A 建菜单「我的减脂餐」（不共享）');
  const m2id = m2.d.menu.id;

  const own = await call('/menus/' + m1id + '/items', 'POST', {
    title: '奶奶的糖醋排骨', emoji: '🍖',
    ings: ['排骨 500g', '冰糖 30g', '香醋 2 勺'],
    steps: ['排骨冷水下锅焯水', '炒糖色到枣红', '加醋和生抽小火炖 30 分钟'],
    note: '醋分两次放'
  }, ta);
  ok(own.code === 200 && own.d.item.title === '奶奶的糖醋排骨', 'A 写自己的菜和做法');
  ok(own.d.item.steps.length === 3, '做法 3 步已存', own.d.item.steps.length + ' 步');
  ok(own.d.item.ings.length === 3, '食材 3 样已存');

  const fromLib = await call('/menus/' + m1id + '/items', 'POST', { rid: r1.id }, ta);
  ok(fromLib.code === 200, '从菜谱库加菜进菜单', r1.title);

  console.log('\n【11】不同关联用户看到不同共享菜单');
  const sC3 = await call('/sync', 'GET', null, tc);
  const namesC = sC3.d.menus.map(x => x.name);
  ok(namesC.includes('周末大餐'), 'C 能看到共享给他的「周末大餐」');
  ok(!namesC.includes('我的减脂餐'), 'C 看不到未共享的「我的减脂餐」');
  const sA3 = await call('/sync', 'GET', null, ta);
  const namesA = sA3.d.menus.map(x => x.name);
  ok(namesA.includes('周末大餐') && namesA.includes('我的减脂餐'), 'A 两个菜单都看得到', namesA.join('/'));
  const cEdit = await call('/menus/' + m1id + '/items', 'POST', { title: 'C 偷偷加菜' }, tc);
  ok(cEdit.code === 403, '非创建者不能改别人的菜单');

  console.log('\n【12】共享范围可调整');
  const share = await call('/menus/' + m2id + '/members', 'POST', { members: [idC] }, ta);
  ok(share.code === 200, 'A 把「我的减脂餐」也共享给 C');
  const sC4 = await call('/sync', 'GET', null, tc);
  ok(sC4.d.menus.some(x => x.name === '我的减脂餐'), 'C 现在能看到它了');
  await call('/menus/' + m2id + '/members', 'POST', { members: [] }, ta);
  const sC5 = await call('/sync', 'GET', null, tc);
  ok(!sC5.d.menus.some(x => x.name === '我的减脂餐'), '取消共享后 C 又看不到了');

  console.log('\n【13】美食广场：发布 + 点赞 + 评论 + 收藏');
  const post = await call('/plaza', 'POST', {
    title: '第一次做红烧肉成功', text: '颜色很正，就是有点咸',
    steps: ['五花肉切块焯水', '炒糖色', '小火炖 40 分钟'],
    photos: []
  }, ta);
  ok(post.code === 200 && post.d.post, 'A 发布美食');
  const pid = post.d.post.id;
  const sC6 = await call('/plaza?tab=latest', 'GET', null, tc);
  ok(sC6.d.posts.some(x => x.id === pid), '其他注册用户 C 能看到这条');
  const like = await call('/plaza/' + pid + '/like', 'POST', {}, tc);
  ok(like.code === 200 && like.d.post.likeCount === 1 && like.d.post.liked, 'C 点赞成功');
  const unlike = await call('/plaza/' + pid + '/like', 'POST', {}, tc);
  ok(unlike.d.post.likeCount === 0, '再点取消赞');
  await call('/plaza/' + pid + '/like', 'POST', {}, tc);
  const cmt = await call('/plaza/' + pid + '/comment', 'POST', { text: '看着好香，求配方' }, tc);
  ok(cmt.code === 200 && cmt.d.post.commentCount === 1, 'C 评论成功');
  ok(cmt.d.post.comments[0].text === '看着好香，求配方', '评论内容正确');
  const fav = await call('/plaza/' + pid + '/fav', 'POST', {}, tc);
  ok(fav.d.post.faved && fav.d.post.favCount === 1, 'C 收藏成功');
  const favTab = await call('/plaza?tab=fav', 'GET', null, tc);
  ok(favTab.d.posts.length === 1, '收藏列表里有这条');
  const delOther = await call('/plaza/' + pid + '/del', 'POST', {}, tc);
  ok(delOther.code === 403, '不能删别人的内容');

  console.log('\n【14】关注 / 粉丝（与绑定独立）');
  const R4 = await call('/register', 'POST', { phone: '136' + stamp + '00', pwd: 'abc123456', nick: '路人' + stamp });
  const idD = R4.d.user.id, td = R4.d.token;
  const f1 = await call('/follow/' + idA, 'POST', {}, td);
  ok(f1.code === 200 && f1.d.following, 'D 关注 A（不是绑定关系）');
  const fA = await call('/followers', 'GET', null, ta);
  ok(fA.d.users.some(u => u.id === idD), 'A 的粉丝列表出现 D');
  const f2 = await call('/follow/' + idD, 'POST', {}, ta);
  ok(f2.d.following, 'A 回关 D');
  const uA = await call('/users/' + idA, 'GET', null, td);
  ok(uA.d.mutual === true, '双方互相关注（mutual）');
  ok(uA.d.isPartner === false, '互关但未绑定（不混淆）');
  const selfF = await call('/follow/' + idD, 'POST', {}, td);
  ok(selfF.code === 400, '不能关注自己');
  const sA4 = await call('/sync', 'GET', null, ta);
  ok(sA4.d.counts.following === 1 && sA4.d.counts.followers === 1, 'A 关注 1 · 粉丝 1');
  const followTab = await call('/plaza?tab=following', 'GET', null, td);
  ok(Array.isArray(followTab.d.posts), '关注流可加载', followTab.d.posts.length + ' 条');

  console.log('\n【15】其他接口');
  const patched = await call('/me', 'PATCH', { nick: '阿明改名', theme: 'ocean', bg: 'sea', icon: '🍜' }, ta);
  ok(patched.d.user.nick === '阿明改名' && patched.d.user.theme === 'ocean', '改昵称+外观已保存');
  const pwd1 = await call('/pwd', 'POST', { oldPwd: 'wrong', newPwd: 'new123456' }, ta);
  ok(pwd1.code === 400, '改密码需验旧密码');
  const pwd2 = await call('/pwd', 'POST', { oldPwd: 'abc123456', newPwd: 'new123456' }, ta);
  ok(pwd2.code === 200, '正确旧密码可改');
  const relog = await call('/login', 'POST', { phone: A.phone, pwd: 'new123456' });
  ok(relog.code === 200, '新密码能登录');
  const noAuth = await call('/sync', 'GET');
  ok(noAuth.code === 401, '未登录访问被拦');
  const unbind = await call('/binds/' + sA.d.partners[0].id, 'DELETE', null, ta);
  ok(unbind.code === 200, '可解除绑定');

  console.log('\n' + (fails === 0 ? '🎉 全部通过' : '⚠️ 失败 ' + fails + ' 项'));
  process.exit(fails ? 1 : 0);
})();
