#!/usr/bin/env node
/* 前端真实 DOM 验证：用 jsdom 加载 index.html，执行 app1.js/app2.js，打真实接口，模拟点击 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const PUB = '/mnt/work/v4/public/';
let fails = 0;
const errs = [];
function ok(c, label, extra) {
  console.log((c ? '  ✅ ' : '  ❌ ') + label + (extra ? '  ' + extra : ''));
  if (!c) fails++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function html() {
  let h = fs.readFileSync(PUB + 'index.html', 'utf8');
  h = h.replace(/<script src="[^"]*"><\/script>/g, '');
  return h;
}

(async () => {
  const dom = new JSDOM(html(), {
    url: 'http://localhost:3000/',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : 'http://localhost:3000' + u, o);
  window.alert = () => {};
  window.confirm = () => true;
  window.scrollTo = () => {};
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });

  window.addEventListener('error', e => errs.push('ERR: ' + e.message));
  window.addEventListener('unhandledrejection', e => errs.push('REJ: ' + (e.reason && e.reason.message || e.reason)));

  // 执行前端两段脚本（合并执行，模拟同页面两个 <script> 共享全局作用域）
  try {
    const combined = fs.readFileSync(PUB + 'app1.js', 'utf8') + '\n;\n' + fs.readFileSync(PUB + 'app2.js', 'utf8');
    window.eval(combined);
  } catch (e) {
    ok(false, '前端脚本执行', e.message);
    console.log(errs.join('\n'));
    process.exit(1);
  }
  ok(true, '前端脚本加载无异常');
  await sleep(900);

  const $ = s => window.document.querySelector(s);
  const $$ = s => Array.from(window.document.querySelectorAll(s));
  const click = el => { if (!el) return false; el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return true; };

  console.log('\n【UI-1】登录页渲染');
  ok($('#auth') && $('#auth').style.display === 'flex', '显示登录页');
  ok(!!$('#aPhone') && !!$('#aPwd'), '手机号+密码输入框存在');
  ok($('#aPhone').placeholder.includes('手机号'), '手机号占位文案正确');

  console.log('\n【UI-2】切换到注册');
  click($('#aToggle'));
  await sleep(150);
  ok(!!$('#aNick') && !!$('#aPwd2'), '注册模式出现昵称和确认密码');
  ok($$('#aEmoji button').length === 12, '头像可选 12 个', $$('#aEmoji button').length + ' 个');

  console.log('\n【UI-3】表单校验');
  $('#aPhone').value = '123';
  click($('#aSubmit'));
  await sleep(200);
  ok($('#authErr').textContent.includes('11 位'), '手机号不足 11 位被拦', $('#authErr').textContent);

  const PHONE = '135' + String(Date.now()).slice(-8);
  $('#aPhone').value = PHONE;
  $('#aPwd').value = '123';
  click($('#aSubmit'));
  await sleep(200);
  ok($('#authErr').textContent.includes('6 位'), '密码过短被拦', $('#authErr').textContent);

  $('#aPwd').value = 'abc123456';
  $('#aPwd2').value = 'abc123456';
  $('#aNick').value = '小厨UI';
  const emojiBtn = $$('#aEmoji button').find(b => b.dataset.e === '🍳');
  click(emojiBtn);
  await sleep(120);
  ok(emojiBtn.classList.contains('on'), '选中头像 🍳 高亮');

  console.log('\n【UI-4】真实注册 → 进入首页');
  click($('#aSubmit'));
  await sleep(2200);
  if ($('#app').style.display !== 'block') console.log('   ↳ 注册失败原因: ' + ($('#authErr') ? $('#authErr').textContent : '?'));
  ok($('#app').style.display === 'block', '注册成功进入主界面');
  ok($('#auth').style.display === 'none', '登录页已隐藏');
  ok($$('#tabbar button').length === 6, '底部导航 6 个入口', $$('#tabbar button').length + ' 个');
  const tabs = $$('#tabbar button').map(b => b.dataset.tab);
  ok(['home', 'order', 'inbox', 'plaza', 'menus', 'mine'].every(k => tabs.includes(k)), '六个页面齐全：' + tabs.join('/'));
  ok($('#view').innerHTML.includes('小厨UI'), '首页显示昵称');

  console.log('\n【UI-5】切到点菜页，菜谱已加载');
  click($$('#tabbar button').find(b => b.dataset.tab === 'order'));
  await sleep(600);
  const dishes = $$('#view .dish');
  ok(dishes.length > 40, '点菜页渲染菜品列表', dishes.length + ' 道可见');
  ok($$('#catChips .chip').length > 5, '分类筛选有多个品类', $$('#catChips .chip').length + ' 个');

  console.log('\n【UI-6】加菜到购物车');
  click($('#view .dish .add-btn'));
  await sleep(500);
  ok($('#view').innerHTML.includes('已选 1 道'), '购物车计数变 1');
  ok(!!$('#cartGo'), '出现「生成点菜单」按钮');

  console.log('\n【UI-7】确认弹层 → 点给自己');
  click($('#cartGo'));
  await sleep(500);
  ok($('#layer').classList.contains('on'), '确认弹层打开');
  ok($('#shBody').innerHTML.includes('点给'), '显示接收人');
  ok(!!$('#oNote'), '有留言输入框');
  click($('#oOk'));
  await sleep(1600);
  ok(!$('#layer').classList.contains('on'), '弹层已关闭');
  ok($('#view').dataset.tab === 'inbox', '自动跳到待做页', $('#view').dataset.tab);
  ok($('#view').innerHTML.includes('给自己点的'), '待做页显示自己点的单（标题：给自己点的）');

  console.log('\n【UI-8】待做页：做好了流程');
  const doneBtn = $$('#view [data-oact="done"]')[0];
  ok(!!doneBtn, '找到「做好了」按钮');
  click(doneBtn);
  await sleep(600);
  ok($('#layer').classList.contains('on'), '做好了弹层打开');
  ok(!!$('#doneMsg'), '有留言输入框');
  ok(!!$('#doneMsg') && $('#doneMsg').value.length > 0, '预填了一句回话', $('#doneMsg') ? $('#doneMsg').value : '无');
  const quick = $$('#shBody [data-msg]')[1];
  click(quick);
  await sleep(150);
  ok($('#doneMsg').value === quick.dataset.msg, '快捷语可一键填入', $('#doneMsg').value);
  click($('#doneOk'));
  await sleep(1600);
  ok(!$('#layer').classList.contains('on'), '完成后弹层关闭');
  ok($('#view').innerHTML.includes(quick.dataset.msg), '页面显示刚才的回话');

  console.log('\n【UI-9】弹层关闭后不再吞点击（关键回归）');
  const peek = window.eval('getComputedStyle(document.getElementById("layer")).pointerEvents');
  ok(peek === 'none' || peek === '' || peek === 'auto', '遮罩层指针状态正常', 'pointerEvents=' + peek);
  click($$('#tabbar button').find(b => b.dataset.tab === 'menus'));
  await sleep(600);
  ok($('#view').dataset.tab === 'menus', '弹层关闭后仍可正常切页（无隐形遮罩）', $('#view').dataset.tab);

  console.log('\n【UI-10】共享菜单：新建');
  ok($('#view').innerHTML.includes('我的私房菜单'), '新用户自带默认菜单');
  click($('#mNew'));
  await sleep(500);
  ok($('#layer').classList.contains('on'), '新建菜单弹层打开');
  ok(!!$('#nmName'), '有菜单名输入框');
  $('#nmName').value = 'UI测试菜单';
  const emojiPick = $$('#nmEmoji button').find(b => b.dataset.e === '🥘');
  click(emojiPick);
  await sleep(100);
  click($('#nmOk'));
  await sleep(1600);
  ok(!$('#layer').classList.contains('on'), '创建后弹层关闭');
  ok($('#view').innerHTML.includes('UI测试菜单'), '列表出现新菜单');

  console.log('\n【UI-11】共享菜单：写自己的菜');
  const menuCard = $$('#view [data-menu]').find(el => el.innerHTML.includes('UI测试菜单'));
  click(menuCard);
  await sleep(700);
  ok($('#layer').classList.contains('on'), '菜单详情打开');
  ok(!!$('#mAddOwn'), '有「写我的做法」按钮');
  click($('#mAddOwn'));
  await sleep(600);
  $('#odTitle').value = 'UI私房番茄蛋';
  $('#odIng').value = '番茄 2 个\n鸡蛋 3 个\n盐 少许';
  $('#odStep').value = '番茄切块\n鸡蛋打散\n热锅炒蛋盛出\n炒番茄出汁\n合炒加盐';
  $('#odNote').value = '番茄要去皮';
  click($('#odOk'));
  await sleep(1600);
  ok($('#shBody').innerHTML.includes('UI私房番茄蛋'), '自定义菜品已加进菜单');
  ok($('#shBody').innerHTML.includes('我写的'), '标记为「我写的」');
  ok($('#shBody').innerHTML.includes('5 步'), '做法 5 步已保存');

  console.log('\n【UI-12】共享菜单：从菜谱库加');
  click($('#mAddLib'));
  await sleep(700);
  const libAdd = $$('#alres [data-al]')[0];
  ok(!!libAdd, '菜谱库列表可加载');
  click(libAdd);
  await sleep(1600);
  ok($('#shBody').innerHTML.includes('菜谱库'), '从菜谱库加入成功并标记');

  console.log('\n【UI-13】美食广场：发帖 + 点赞 + 评论 + 收藏');
  click(window.document.querySelector('#layer .sh-head [data-close]') || window.document.querySelector('#layer .mask'));
  await sleep(300);
  click($$('#tabbar button').find(b => b.dataset.tab === 'plaza'));
  await sleep(1000);
  ok($('#view').dataset.tab === 'plaza', '进入广场页');
  ok($$('#view [data-pt]').length === 4, '四个分栏：最新/关注/收藏/我的', $$('#view [data-pt]').length + ' 个');

  click($('#pNew'));
  await sleep(600);
  ok(!!$('#npTitle'), '发布弹层打开');
  $('#npTitle').value = 'UI测试红烧肉';
  $('#npText').value = '第一次做，颜色有点深';
  $('#npSteps').value = '焯水\n炒糖色\n小火炖 40 分钟';
  click($('#npOk'));
  await sleep(1800);
  ok(!$('#layer').classList.contains('on'), '发布后弹层关闭');
  ok($('#view').innerHTML.includes('UI测试红烧肉'), '广场出现自己的帖子');

  const likeBtn = $('#view [data-like]');
  ok(!!likeBtn, '有点赞按钮');
  click(likeBtn);
  await sleep(1000);
  ok($('#view').innerHTML.includes('❤️ 1'), '点赞数变 1');

  const cmtBtn = $('#view [data-cmt]');
  click(cmtBtn);
  await sleep(700);
  ok(!!$('#cmInput'), '评论弹层打开');
  $('#cmInput').value = '自己给自己点个赞';
  click($('#cmSend'));
  await sleep(1400);
  ok($('#shBody').innerHTML.includes('自己给自己点个赞'), '评论已提交显示');

  const favBtn = $('#view [data-fav]');
  click(window.document.querySelector('#layer .sh-head [data-close]') || window.document.querySelector('#layer .mask'));
  await sleep(300);
  click(favBtn);
  await sleep(1200);
  ok($('#view').innerHTML.includes('⭐ 1'), '收藏数变 1');

  console.log('\n【UI-14】关注/粉丝界面');
  click(window.document.querySelector('#layer .sh-head [data-close]') || window.document.querySelector('#layer .mask'));
  await sleep(200);
  click($$('#tabbar button').find(b => b.dataset.tab === 'mine'));
  await sleep(700);
  ok($('#view').dataset.tab === 'mine', '进入我的页');
  ok($('#view').innerHTML.includes('粉丝') && $('#view').innerHTML.includes('关注'), '显示关注与粉丝');
  click($('#meFollowers'));
  await sleep(1400);
  ok($('#layer').classList.contains('on'), '关注粉丝弹层打开');
  ok($$('#shBody [data-ft]').length === 3, '三栏：关注/粉丝/推荐', $$('#shBody [data-ft]').length + ' 个');
  const tabsTx = $$('#shBody [data-ft]').map(b => b.textContent.trim());
  ok(tabsTx.some(t => t.startsWith('关注')) && tabsTx.some(t => t.startsWith('粉丝')) && tabsTx.some(t => t.startsWith('推荐')), tabsTx.join(' | '));

  console.log('\n【UI-15】外观切换');
  click(window.document.querySelector('#layer .sh-head [data-close]') || window.document.querySelector('#layer .mask'));
  await sleep(200);
  click($('#view [data-go]'));
  await sleep(700);
  ok($('#layer').classList.contains('on'), '外观弹层打开');
  ok($$('#shBody [data-th]').length === 9, '主题 9 套', $$('#shBody [data-th]').length + ' 套');
  ok($$('#shBody [data-bg]').length === 12, '背景 12 款', $$('#shBody [data-bg]').length + ' 款');
  ok($$('#shBody [data-ic]').length === 27, '图标 27 个', $$('#shBody [data-ic]').length + ' 个');
  const oceanBtn = $$('#shBody [data-th]').find(b => b.dataset.th === 'ocean');
  click(oceanBtn);
  await sleep(1200);
  ok(window.document.body.classList.contains('t-ocean'), '切换到海洋蓝主题生效');
  const seaBtn = $$('#shBody [data-bg]').find(b => b.dataset.bg === 'sea');
  click(seaBtn);
  await sleep(1200);
  ok(window.document.body.classList.contains('bg-sea'), '切换到海面背景生效');

  console.log('\n【UI-16】绑定界面（随机码 + 5 分钟倒计时）');
  click(window.document.querySelector('#layer .sh-head [data-close]') || window.document.querySelector('#layer .mask'));
  await sleep(200);
  click(window.document.querySelector('#meBind'));
  await sleep(1600);
  ok($('#layer').classList.contains('on'), '绑定弹层打开');
  const codeTxt = $('#codeTxt').textContent.trim();
  ok(/^\d{6}$/.test(codeTxt), '显示 6 位随机码', codeTxt);
  ok(!!$('#codeTtl') && /剩余|过期/.test($('#codeTtl').textContent), '有倒计时', $('#codeTtl').textContent);
  ok(!!$('#bCode'), '对方码输入框存在');
  ok($$('#bRel .chip').length === 5, '关系 5 种可选', $$('#bRel .chip').length + ' 种');
  ok(!!$('#codeNew'), '有「换一个」按钮');

  console.log('\n【UI-17】无 JS 报错');
  const realErrs = errs.filter(e => !/Not implemented|css|stylesheet/i.test(e));
  ok(realErrs.length === 0, '运行期无 JS 异常', realErrs.slice(0, 3).join(' / '));

  console.log('\n' + (fails === 0 ? '🎉 前端 UI 全部通过' : '⚠️ 失败 ' + fails + ' 项'));
  if (realErrs.length) console.log(realErrs.slice(0, 5).join('\n'));
  process.exit(fails ? 1 : 0);
})();
