/* ============================================================
 * 卖设计 · 手机工作台 · app.js (v2)
 * 自包含实现：与桌面端共享 localStorage 键、JSONBin 同步、修改通知
 * ============================================================ */

/* ============== 工具函数 ============== */
const $  = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));
const fmtDate = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const addDays  = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const diffDays = (a, b) => Math.ceil((new Date(b) - new Date(a)) / 86400000);
const todayStr = () => fmtDate(new Date());

const storage = {
  get: (k, f) => { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch { return f; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
};

function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  // force reflow
  void t.offsetWidth;
  t.classList.add('visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    t.classList.remove('visible');
    setTimeout(() => { t.hidden = true; }, 240);
  }, 2200);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function fmtTime(d) {
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
         p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ============== 实时时钟 ============== */
function updateClock() {
  const now = new Date();
  $('#liveClock').textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
  $('#liveDate').textContent = now.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });
}
setInterval(updateClock, 1000);
updateClock();

/* ============== 日历 ============== */
/* ============== 日历（点选日期 + 翻月） ============== */
let calView = (() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; })();
let calSelected = null; // {y,m,d}

function renderCalendar() {
  const now = new Date();
  const y = calView.y, m = calView.m;
  const firstDay = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const prevLast = new Date(y, m, 0).getDate();

  $('#calYear').textContent = y;
  $('#calMonth').textContent = String(m + 1).padStart(2, '0');

  const show = calSelected || { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  const isToday = !calSelected && show.y === now.getFullYear() && show.m === now.getMonth() && show.d === now.getDate();
  $('#calTodayDate').textContent = (isToday ? '今天 ' : '') + `${show.m + 1}月${show.d}日`;
  try {
    const l = solarLunar.solar2lunar(show.y, show.m + 1, show.d);
    $('#calTodayLunar').textContent = `农历${l.monthCn}${l.dayCn}`;
  } catch {
    $('#calTodayLunar').textContent = '';
  }

  const daysEl = $('#calDays');
  daysEl.innerHTML = '';
  for (let i = startPad - 1; i >= 0; i--) {
    const s = document.createElement('span');
    s.className = 'other';
    s.textContent = prevLast - i;
    daysEl.appendChild(s);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const s = document.createElement('span');
    s.textContent = d;
    s.dataset.date = `${y}-${m}-${d}`;
    const isT = d === now.getDate() && m === now.getMonth() && y === now.getFullYear();
    const isSel = calSelected && calSelected.y === y && calSelected.m === m && calSelected.d === d;
    if (isT) s.classList.add('today');
    if (isSel) s.classList.add('selected');
    daysEl.appendChild(s);
  }
  const rem = (7 - ((startPad + daysInMonth) % 7)) % 7;
  for (let d = 1; d <= rem; d++) {
    const s = document.createElement('span');
    s.className = 'other';
    s.textContent = d;
    daysEl.appendChild(s);
  }
}

$('#calPrev').addEventListener('click', () => {
  calView.m--; if (calView.m < 0) { calView.m = 11; calView.y--; }
  renderCalendar();
});
$('#calNext').addEventListener('click', () => {
  calView.m++; if (calView.m > 11) { calView.m = 0; calView.y++; }
  renderCalendar();
});
$('#calDays').addEventListener('click', (e) => {
  const s = e.target.closest('span[data-date]');
  if (!s) return;
  const [yy, mm, dd] = s.dataset.date.split('-').map(Number);
  calSelected = { y: yy, m: mm, d: dd };
  renderCalendar();
});
renderCalendar();

/* ============== 天气 ============== */
let weatherData = null;

async function loadWeatherData() {
  try {
    const r = await fetch('./weather.json?_=' + Date.now());
    if (!r.ok) throw new Error('加载失败');
    weatherData = await r.json();
  } catch (e) {
    weatherData = { default: '郑州', cities: {} };
  }
  applyWeather(storage.get('wb_city', '郑州'));
}
function findWeather(city) {
  if (!weatherData || !city) return null;
  const c = String(city).trim();
  const cs = weatherData.cities || {};
  if (cs[c]) return cs[c];
  const key = Object.keys(cs).find(k => k.includes(c) || (cs[k].name && cs[k].name.includes(c)));
  return key ? cs[key] : null;
}
function applyWeather(city) {
  const rec = findWeather(city) || findWeather(weatherData && weatherData.default);
  if (!rec) {
    $('#weatherNow').textContent = '暂无数据';
    $('#weatherUpcoming').textContent = '--';
    $('#weatherTomorrow').textContent = '--';
    return;
  }
  $('#weatherCity').textContent  = rec.name || city;
  $('#weatherTemp').textContent  = (rec.temp != null ? rec.temp : '--') + '°';
  $('#weatherIcon').textContent  = rec.icon || '🌡️';
  $('#weatherNow').textContent   = rec.weather + (rec.wind ? ' · ' + rec.wind : '');
  const up = rec.upcoming;
  const $up = $('#weatherUpcoming');
  if (up && up.text) {
    $up.textContent = up.text;
    $up.classList.toggle('warn', !!up.warn);
  } else {
    $up.textContent = '未来天气平稳';
    $up.classList.remove('warn');
  }
  const tm = rec.tomorrow;
  $('#weatherTomorrow').textContent = tm && tm.weather
    ? `明日${tm.weather}` : '明日预报暂无';
  storage.set('wb_city', rec.name || city);
}
$('#editCity').addEventListener('click', () => {
  const city = prompt('请输入城市名称（如：北京、上海、成都）：', storage.get('wb_city', '郑州'));
  if (city && city.trim()) {
    const rec = findWeather(city.trim());
    if (rec) { applyWeather(city.trim()); showToast('已切换到 ' + (rec.name || city)); }
    else { showToast('暂未收录「' + city.trim() + '」，已用默认城市'); applyWeather(weatherData && weatherData.default); }
  }
});
$('#locateCity').addEventListener('click', () => {
  if (!navigator.geolocation) return showToast('浏览器不支持定位');
  $('#weatherNow').textContent = '定位中…';
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude, longitude } = pos.coords;
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh`).then(r => r.json());
      const city = r.city || r.locality || r.principalSubdivision || '本地';
      const rec = findWeather(city);
      if (rec) { applyWeather(city); showToast('已定位到 ' + (rec.name || city)); }
      else { applyWeather(weatherData && weatherData.default); showToast('定位到 ' + city + '，暂未收录，已用默认'); }
    } catch {
      applyWeather(weatherData && weatherData.default);
      showToast('定位失败，已用默认城市');
    }
  }, () => showToast('定位失败，已用默认城市'));
});
loadWeatherData();

/* ============== 节日 / 营销节点 ============== */
const marketingDays = [{"name":"日本投降日","date":"2026-08-15","level":3},{"name":"818购物节","date":"2026-08-18","level":3},{"name":"七夕","date":"2026-08-19","level":1},{"name":"中国医师节","date":"2026-08-19","level":3},{"name":"北京国际电影节","date":"2026-08-20","level":3},{"name":"处暑","date":"2026-08-23","level":2},{"name":"全国残疾预防日","date":"2026-08-25","level":3},{"name":"中元节","date":"2026-08-27","level":2},{"name":"全国测绘法宣传日","date":"2026-08-29","level":3},{"name":"开学季","date":"2026-09-01","level":2},{"name":"中国人民抗战胜利纪念日","date":"2026-09-03","level":2},{"name":"中华慈善日","date":"2026-09-05","level":3},{"name":"白露","date":"2026-09-07","level":2},{"name":"国际扫盲日","date":"2026-09-08","level":3},{"name":"教师节","date":"2026-09-10","level":1},{"name":"国家网络安全教育周","date":"2026-09-14","level":3},{"name":"全民国防教育日","date":"2026-09-16","level":3},{"name":"国际臭氧层保护日","date":"2026-09-16","level":3},{"name":"全国科普日","date":"2026-09-17","level":3},{"name":"九一八纪念日","date":"2026-09-18","level":3},{"name":"全国爱牙日","date":"2026-09-20","level":3},{"name":"公民道德宣传日","date":"2026-09-20","level":3},{"name":"国际和平日","date":"2026-09-21","level":3},{"name":"世界无车日","date":"2026-09-22","level":3},{"name":"秋分","date":"2026-09-23","level":2},{"name":"中国农民丰收节","date":"2026-09-23","level":3},{"name":"中秋节","date":"2026-09-25","level":1},{"name":"世界旅游日","date":"2026-09-27","level":3},{"name":"国际聋人日","date":"2026-09-27","level":3},{"name":"孔子文化节","date":"2026-09-28","level":3},{"name":"烈士纪念日","date":"2026-09-30","level":3},{"name":"国庆节","date":"2026-10-01","level":1},{"name":"世界动物日","date":"2026-10-04","level":3},{"name":"世界微笑日","date":"2026-10-07","level":3},{"name":"寒露","date":"2026-10-08","level":2},{"name":"全国高血压日","date":"2026-10-08","level":3},{"name":"世界邮政日","date":"2026-10-09","level":3},{"name":"辛亥革命纪念日","date":"2026-10-10","level":3},{"name":"建队纪念日","date":"2026-10-13","level":3}];

const fixedHolidays = {
  '01-01':'元旦','02-14':'情人节','03-08':'妇女节','03-12':'植树节','04-01':'愚人节',
  '05-01':'劳动节','05-04':'青年节','06-01':'儿童节','07-01':'建党节','08-01':'建军节',
  '09-10':'教师节','10-01':'国庆节','11-11':'双十一','12-24':'平安夜','12-25':'圣诞节'
};
const lunar2026 = {
  '2026-02-17':'春节','2026-02-18':'大年初二','2026-02-19':'大年初三','2026-03-03':'元宵节',
  '2026-04-04':'清明节','2026-06-19':'端午节','2026-08-19':'七夕节','2026-08-26':'中元节',
  '2026-09-25':'中秋节','2026-10-17':'重阳节','2026-02-11':'除夕'
};

function renderHolidays() {
  const list = $('#holidayList');
  list.innerHTML = '';
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const ds = fmtDate(d);
    const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const events = [];
    if (fixedHolidays[md]) events.push({ name: fixedHolidays[md], key: false, node: false });
    if (lunar2026[ds]) events.push({ name: lunar2026[ds], key: false, node: false });
    marketingDays.filter(m => m.date === ds).forEach(m => events.push({ name: m.name, key: m.level === 1, node: true }));

    const li = document.createElement('li');
    const isToday = i === 0;
    const hasKey  = events.some(e => e.key);
    const hasNode = events.some(e => e.node);
    const nameClass = ['holiday-name', hasKey ? 'key' : '', hasNode ? 'node' : ''].filter(Boolean).join(' ');
    const keyTag  = hasKey  ? '<span class="holiday-tag key">重点</span>' : '';
    const nodeTag = hasNode ? '<span class="holiday-tag">节点</span>' : '';
    const names = events.length ? events.map(e => e.name).join('、') : weekdays[d.getDay()];
    li.innerHTML = `
      <span class="${nameClass}">${escapeHtml(names)} ${keyTag} ${events.length ? nodeTag : ''}</span>
      <span class="holiday-date">${isToday ? '<span class="today-flag">🚩</span> ' : ''}${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}</span>
    `;
    list.appendChild(li);
  }
}
renderHolidays();

/* ============== 热点聚合 ============== */
const trendSources = {
  adquan:      { name: '广告门',     url: 'https://www.adquan.com/' },
  digitaling:  { name: '数英',       url: 'https://www.digitaling.com/' },
  xiaohongshu: { name: '小红书',     url: 'https://www.xiaohongshu.com/' },
  weibo:       { name: '微博',       url: 'https://weibo.com/' },
  qqnews:      { name: '腾讯新闻',   url: 'https://news.qq.com/' },
  ifeng:       { name: '凤凰新闻',   url: 'https://news.ifeng.com/' },
  shejijingsai:{ name: '设计竞赛网', url: 'https://www.shejijingsai.com/' },
  uisdc:       { name: '优设网',     url: 'https://www.uisdc.com/' }
};

let currentTrendSource = storage.get('wb_trend_source', 'qqnews');
let trendData = {};
let trendUpdatedAt = '';

function formatHeat(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) return Math.round(n / 1e4) + '万';
  return String(n);
}

async function loadTrends() {
  try {
    const r = await fetch('trends.json?v=' + Date.now());
    const data = await r.json();
    trendData = data.sources || {};
    trendUpdatedAt = data.updatedAt || new Date().toLocaleString('zh-CN');
    $('#trendUpdate').textContent = `上次更新：${trendUpdatedAt}`;
    renderTrends(currentTrendSource);
  } catch (e) {
    $('#trendEmpty').textContent = '热点数据加载失败，请检查 trends.json';
    $('#trendEmpty').hidden = false;
  }
}

function renderTrends(source) {
  currentTrendSource = source;
  storage.set('wb_trend_source', source);
  const list  = $('#trendList');
  const empty = $('#trendEmpty');
  const src   = trendData[source] || [];
  const data  = [...src].sort((a, b) => b.heat - a.heat);
  $$('#trendTabs .trend-tab').forEach(t => t.classList.toggle('active', t.dataset.source === source));
  if (data.length === 0) { list.innerHTML = ''; empty.hidden = false; return; }
  empty.hidden = true;
  list.innerHTML = data.map((item, i) => `
    <li>
      <a href="${escapeHtml(item.url || trendSources[source].url)}" target="_blank" rel="noopener">
        <span class="trend-rank">${i + 1}.</span>
        <span class="trend-title">${escapeHtml(item.title)}</span>
      </a>
      <span class="trend-heat">${formatHeat(item.heat)}</span>
    </li>
  `).join('');
}

$('#trendTabs').addEventListener('click', (e) => {
  const t = e.target.closest('.trend-tab'); if (!t) return;
  renderTrends(t.dataset.source);
});
$('#refreshTrends').addEventListener('click', () => {
  const btn = $('#refreshTrends');
  const orig = btn.textContent;
  btn.textContent = '刷新中...';
  btn.disabled = true;
  loadTrends().then(() => { showToast('热点已刷新'); })
    .catch(() => {})
    .finally(() => { btn.textContent = orig; btn.disabled = false; });
});
loadTrends();

/* ============================================================
 * 标签页切换 + 横向滑动
 * ============================================================ */
const tabs = $$('.tab');
const track = $('#pagesTrack');
let currentTab = storage.get('wb_current_tab', 0);

function switchTab(idx, animated = true) {
  idx = Math.max(0, Math.min(2, idx));
  currentTab = idx;
  storage.set('wb_current_tab', idx);
  tabs.forEach(t => t.classList.toggle('active', Number(t.dataset.index) === idx));
  if (!animated) track.classList.add('dragging');
  track.style.transform = `translateX(${-idx * 33.333333}%)`;
  if (!animated) {
    // remove dragging on next frame so transitions resume
    requestAnimationFrame(() => track.classList.remove('dragging'));
  }
  // 切换后让当前页滚到顶
  const page = track.querySelector(`.page[data-index="${idx}"] .page-inner`);
  if (page) page.scrollTop = 0;
}

// 标签点击
tabs.forEach(t => t.addEventListener('click', () => switchTab(Number(t.dataset.index))));

// 横向滑动检测
let touchStartX = 0, touchStartY = 0, touchStartT = 0, isSwiping = false;
const SWIPE_THRESHOLD = 60;
const SWIPE_VRATIO = 0.7; // horizontal must dominate

function onTouchStart(e) {
  // 忽略多点触控（用于双指缩放等）
  if (e.touches.length !== 1) { isSwiping = false; return; }
  // 热点标签等自带横向滚动的区域，不触发整页翻页
  if (e.target.closest && e.target.closest('#trendTabs')) { isSwiping = false; return; }
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartT = Date.now();
  isSwiping = true;
}
function onTouchMove(e) {
  if (!isSwiping) return;
  // 若检测到方向主要是竖直，则放弃这次滑动（让内部滚动接管）
  const t = e.touches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
    isSwiping = false;
  }
}
function onTouchEnd(e) {
  if (!isSwiping) return;
  isSwiping = false;
  // 使用 changedTouches
  const t = (e.changedTouches && e.changedTouches[0]) || null;
  if (!t) return;
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx < SWIPE_THRESHOLD) return;
  if (ady > adx * SWIPE_VRATIO) return;
  if (Date.now() - touchStartT > 600) return; // 太慢不算滑动
  if (dx < 0) switchTab(currentTab + 1);
  else switchTab(currentTab - 1);
}

track.addEventListener('touchstart', onTouchStart, { passive: true });
track.addEventListener('touchmove', onTouchMove, { passive: true });
track.addEventListener('touchend', onTouchEnd, { passive: true });
track.addEventListener('touchcancel', () => { isSwiping = false; }, { passive: true });

// 鼠标拖动（仅桌面调试用）
let mouseStartX = 0, mouseStartY = 0, mouseDown = false;
track.addEventListener('mousedown', (e) => {
  if (e.target.closest && e.target.closest('#trendTabs')) { mouseDown = false; return; }
  mouseStartX = e.clientX;
  mouseStartY = e.clientY;
  mouseDown = true;
});
document.addEventListener('mousemove', (e) => {
  if (!mouseDown) return;
  const dx = e.clientX - mouseStartX;
  const dy = e.clientY - mouseStartY;
  if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) mouseDown = false;
});
document.addEventListener('mouseup', (e) => {
  if (!mouseDown) return;
  mouseDown = false;
  const dx = e.clientX - mouseStartX;
  const dy = e.clientY - mouseStartY;
  if (Math.abs(dx) < SWIPE_THRESHOLD) return;
  if (Math.abs(dy) > Math.abs(dx) * SWIPE_VRATIO) return;
  if (dx < 0) switchTab(currentTab + 1);
  else switchTab(currentTab - 1);
});

// 标签栏刷新按钮
$('#pageRefresh').addEventListener('click', () => {
  const btn = $('#pageRefresh');
  btn.classList.add('spin');
  setTimeout(() => btn.classList.remove('spin'), 700);
  switch (currentTab) {
    case 0:
      renderCalendar();
      renderHolidays();
      applyWeather(storage.get('wb_city', '郑州'));
      loadTrends();
      showToast('每日资讯已刷新');
      break;
    case 1:
      renderPortfolio();
      renderZcool();
      renderDesignProjects();
      showToast('作品库已刷新');
      break;
    case 2:
      renderWork();
      showToast('工作信息已刷新');
      break;
  }
});

// 初始化当前 tab（无动画） + 支持 URL ?tab=0/1/2 用于截图
(function initTabFromUrl() {
  try {
    const p = new URLSearchParams(location.search);
    const t = p.get('tab');
    if (t != null && !isNaN(Number(t))) {
      currentTab = Math.max(0, Math.min(2, Number(t)));
    }
  } catch { /* ignore */ }
})();
switchTab(currentTab, false);

/* ============================================================
 * 设计作品库 · 公众号文章
 * ============================================================ */
let portfolio = storage.get('wb_portfolio', [
  { id: 'p1', name: '品牌设计的底层逻辑', url: 'https://mp.weixin.qq.com/s/0--AHBCkB1DnfnzCD70Xyg', tags: ['品牌', '方法论'] }
]);
let editingPortfolioId = null;
let wechatExpanded = storage.get('wb_wechat_expanded', false);

function renderPortfolio() {
  $('#wechatCount').textContent = `${portfolio.length} 篇`;
  const list = $('#portfolioList');
  if (portfolio.length === 0) { list.innerHTML = '<div class="empty-state">暂无文章，点击右上角添加</div>'; return; }
  list.innerHTML = portfolio.map(item => `
    <div class="portfolio-item" data-id="${item.id}">
      <a class="portfolio-title" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>
      <div class="portfolio-actions-row">
        <button data-act="open" data-url="${escapeHtml(item.url || '')}">打开</button>
        <button data-act="edit">编辑</button>
        <button data-act="del">删除</button>
      </div>
    </div>
  `).join('');
}

function toggleWechat() {
  wechatExpanded = !wechatExpanded;
  storage.set('wb_wechat_expanded', wechatExpanded);
  const body = $('#wechatBody');
  const btn = $('#wechatToggleBtn');
  body.classList.toggle('collapsed', !wechatExpanded);
  btn.textContent = wechatExpanded ? '折叠' : '展开';
}
function applyWechatExpanded() {
  const body = $('#wechatBody');
  const btn = $('#wechatToggleBtn');
  body.classList.toggle('collapsed', !wechatExpanded);
  btn.textContent = wechatExpanded ? '折叠' : '展开';
}
function openPortfolioModal(id = null) {
  editingPortfolioId = id;
  const titleEl = $('.modal-header h3', $('#portfolioModal'));
  if (titleEl) titleEl.textContent = id ? '编辑文章' : '添加公众号文章';
  if (id) {
    const item = portfolio.find(p => p.id === id);
    if (item) {
      $('#portfolioName').value = item.name;
      $('#portfolioUrl').value  = item.url;
      $('#portfolioTags').value = (item.tags || []).join(', ');
    }
  } else {
    $('#portfolioName').value = '';
    $('#portfolioUrl').value  = '';
    $('#portfolioTags').value = '';
  }
  openModal('portfolioModal');
}
function closePortfolioModal() { closeModal('portfolioModal'); editingPortfolioId = null; }
function savePortfolio() {
  const name = $('#portfolioName').value.trim();
  const url  = $('#portfolioUrl').value.trim();
  const tags = $('#portfolioTags').value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
  if (!name) return showToast('请输入文章标题');
  if (editingPortfolioId) {
    const item = portfolio.find(p => p.id === editingPortfolioId);
    if (item) { item.name = name; item.url = url; item.tags = tags; }
  } else {
    portfolio.push({ id: 'p' + Date.now(), name, url, tags });
  }
  storage.set('wb_portfolio', portfolio);
  renderPortfolio();
  closePortfolioModal();
  showToast('文章已保存');
  scheduleAutoPush();
}

$('#wechatToggle').addEventListener('click', (e) => {
  if (e.target.closest('.btn-ghost') || e.target.closest('.btn-primary')) return;
  toggleWechat();
});
$('#wechatToggleBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleWechat(); });
$('#addPortfolioProject').addEventListener('click', () => openPortfolioModal());
$('#savePortfolio').addEventListener('click', savePortfolio);

$('#portfolioList').addEventListener('click', (e) => {
  const item = e.target.closest('.portfolio-item'); if (!item) return;
  const id = item.dataset.id;
  const btn = e.target.closest('button');
  if (btn) {
    const act = btn.dataset.act;
    if (act === 'open') {
      if (btn.dataset.url) window.open(btn.dataset.url, '_blank');
    } else if (act === 'edit') {
      openPortfolioModal(id);
    } else if (act === 'del') {
      if (confirm('确定删除该文章？')) {
        portfolio = portfolio.filter(p => p.id !== id);
        storage.set('wb_portfolio', portfolio);
        renderPortfolio();
        showToast('已删除');
        scheduleAutoPush();
      }
    }
    return;
  }
  if (e.target.closest('.portfolio-info')) {
    const data = portfolio.find(p => p.id === id);
    if (data && data.url) window.open(data.url, '_blank');
  }
});
renderPortfolio();
applyWechatExpanded();

/* ============================================================
 * 设计作品库 · 站酷
 * ============================================================ */
let zcoolConfig = storage.get('wb_zcool', {
  url: 'https://www.zcool.com.cn/u/ZNDA5NDcwMA==',
  title: '卖设计 · 站酷',
  cover: ''
});

function renderZcool() {
  $('#zcoolLink').href = zcoolConfig.url;
  $('#zcoolVisit').href = zcoolConfig.url;
  $('#zcoolTitle').textContent = zcoolConfig.title;
  $('#zcoolUrlText').textContent = zcoolConfig.url;
  const cover = $('#zcoolCover');
  if (zcoolConfig.cover) {
    cover.style.backgroundImage = `url("${zcoolConfig.cover}")`;
    cover.classList.add('has-cover');
  } else {
    cover.style.backgroundImage = '';
    cover.classList.remove('has-cover');
  }
}
function openZcoolModal() {
  $('#zcoolUrlInput').value   = zcoolConfig.url;
  $('#zcoolTitleInput').value = zcoolConfig.title;
  $('#zcoolCoverInput').value = '';
  openModal('zcoolModal');
}
function closeZcoolModal() { closeModal('zcoolModal'); }
function saveZcool() {
  const url   = $('#zcoolUrlInput').value.trim() || zcoolConfig.url;
  const title = $('#zcoolTitleInput').value.trim() || zcoolConfig.title;
  const file  = $('#zcoolCoverInput').files[0];
  const finish = (cover) => {
    zcoolConfig = { url, title, cover };
    storage.set('wb_zcool', zcoolConfig);
    renderZcool();
    closeZcoolModal();
    showToast('站酷主页已更新');
    scheduleAutoPush();
  };
  if (file && file.type.startsWith('image/')) {
    resizeImage(file, 800, dataUrl => finish(dataUrl));
  } else {
    finish(zcoolConfig.cover);
  }
}
$('#editZcool').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openZcoolModal(); });
$('#saveZcool').addEventListener('click', saveZcool);
renderZcool();

/* ============================================================
 * 设计作品库 · 设计项目（封面图相册）
 * ============================================================ */
let designProjects = storage.get('wb_design_projects', []);
let editingDesignProjectId = null;
let editingDesignImages = [];

/* 调色板（与参考图一致：绿 / 黑 / 灰 / 红 等） */
const DP_PALETTE = [
  { bg: '#1A4D3A', fg: '#FFFFFF' },
  { bg: '#111111', fg: '#FFFFFF' },
  { bg: '#8A8F95', fg: '#FFFFFF' },
  { bg: '#B03030', fg: '#FFFFFF' },
  { bg: '#2A4D8A', fg: '#FFFFFF' },
  { bg: '#6B4A8A', fg: '#FFFFFF' },
  { bg: '#C46A2A', fg: '#FFFFFF' },
  { bg: '#3A7A6A', fg: '#FFFFFF' }
];
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function pickColor(name) {
  return DP_PALETTE[hashStr(String(name)) % DP_PALETTE.length];
}

function renderDesignProjects() {
  const list = $('#designProjectList');
  if (designProjects.length === 0) {
    list.innerHTML = '<div class="empty-state">暂无设计项目，点击右上方新建</div>';
    return;
  }
  list.innerHTML = designProjects.map(dp => {
    const cover = (dp.images && dp.images[0]) || '';
    const c = pickColor(dp.name);
    const count = (dp.images || []).length;
    const coverStyle = cover
      ? `background-image:url(${cover});color:#fff;`
      : `background:${c.bg};color:${c.fg};`;
    return `
    <div class="design-project" data-id="${dp.id}">
      <div class="design-project-cover" style="${coverStyle}">
        <div class="dp-cover-overlay">
          <div class="dp-cover-title">${escapeHtml(dp.name)}</div>
          <div class="dp-cover-count">${count} 张</div>
        </div>
      </div>
      <div class="dp-actions-bar">
        <button data-act="edit">编辑</button>
        <button data-act="del">删除</button>
      </div>
    </div>
  `;
  }).join('');
}

function openDesignProjectModal(id = null) {
  editingDesignProjectId = id;
  editingDesignImages = [];
  const titleEl = $('.modal-header h3', $('#designProjectModal'));
  if (titleEl) titleEl.textContent = id ? '编辑设计项目' : '新建设计项目';
  if (id) {
    const dp = designProjects.find(p => p.id === id);
    if (dp) {
      $('#designProjectName').value = dp.name;
      $('#designProjectNote').value = dp.note || '';
      editingDesignImages = [...(dp.images || [])];
    }
  } else {
    $('#designProjectName').value = '';
    $('#designProjectNote').value = '';
  }
  $('#designProjectInput').value = '';
  renderDpImageManager();
  openModal('designProjectModal');
}
function closeDesignProjectModal() {
  closeModal('designProjectModal');
  editingDesignProjectId = null;
  editingDesignImages = [];
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function resizeImage(file, maxDim = 600, cb) {
  if (file.type === 'image/gif') {
    fileToDataUrl(file).then(cb).catch(() => cb(''));
    return;
  }
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width  = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    cb(c.toDataURL('image/jpeg', 0.8));
  };
  img.onerror = () => cb('');
  img.src = URL.createObjectURL(file);
}

function handleDesignImages(files, cb) {
  const list = Array.from(files);
  if (list.length === 0) return cb([]);
  let count = 0;
  const results = [];
  let gifTooBig = false;
  list.forEach(file => {
    if (!file.type.startsWith('image/')) { count++; if (count === list.length) cb(results); return; }
    if (file.type === 'image/gif' && file.size > 2 * 1024 * 1024) gifTooBig = true;
    resizeImage(file, 1280, (dataUrl) => {
      results.push(dataUrl);
      if (++count === list.length) {
        if (gifTooBig) showToast('部分 GIF 较大，可能无法保存，建议压缩后再上传');
        cb(results);
      }
    });
  });
}

function compressDataUrl(src, maxDim, quality) {
  return new Promise((resolve) => {
    if (!src || !/^data:image/.test(src)) return resolve(src);
    if (/^data:image\/gif/.test(src)) return resolve(src);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      } catch { resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
async function compressImages(arr, maxDim, quality) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const s of arr) out.push(await compressDataUrl(s, maxDim, quality));
  return out;
}

function renderDpImageManager() {
  const box = $('#dpImageManager');
  if (!box) return;
  if (editingDesignImages.length === 0) {
    box.innerHTML = '<div class="dp-img-empty">暂无图片，点击下方"添加图片"上传</div>';
    return;
  }
  box.innerHTML = editingDesignImages.map((src, i) => `
    <div class="dp-thumb">
      <img src="${src}" alt="图片 ${i + 1}">
      <button class="dp-thumb-del" data-i="${i}" aria-label="删除此图">×</button>
    </div>
  `).join('');
}

function saveDesignProject() {
  const name = $('#designProjectName').value.trim();
  const note = $('#designProjectNote').value.trim();
  if (!name) return showToast('请输入项目名称');
  if (editingDesignProjectId) {
    const dp = designProjects.find(p => p.id === editingDesignProjectId);
    if (dp) { dp.name = name; dp.note = note; dp.images = [...editingDesignImages]; }
  } else {
    designProjects.push({ id: 'dp' + Date.now(), name, note, images: [...editingDesignImages] });
  }
  if (!storage.set('wb_design_projects', designProjects)) {
    return showToast('保存失败：本地空间不足（可能是 GIF 过大），请压缩或删除部分图片');
  }
  renderDesignProjects();
  closeDesignProjectModal();
  showToast('设计项目已保存');
  scheduleAutoPush();
}

$('#addDesignProject').addEventListener('click', () => openDesignProjectModal());
$('#saveDesignProject').addEventListener('click', saveDesignProject);
$('#designProjectInput').addEventListener('change', (e) => {
  const files = e.target.files;
  if (!files || !files.length) return;
  handleDesignImages(files, (imgs) => {
    editingDesignImages = [...editingDesignImages, ...imgs];
    renderDpImageManager();
    $('#designProjectInput').value = '';
    showToast(`已添加 ${imgs.length} 张图片`);
  });
});
$('#dpImageManager').addEventListener('click', (e) => {
  if (e.target.classList.contains('dp-thumb-del')) {
    const i = Number(e.target.dataset.i);
    if (!isNaN(i)) {
      editingDesignImages.splice(i, 1);
      renderDpImageManager();
    }
  }
});
$('#designProjectList').addEventListener('click', (e) => {
  const dpEl = e.target.closest('.design-project'); if (!dpEl) return;
  const pid = dpEl.dataset.id;
  const btn = e.target.closest('button');
  if (btn) {
    const act = btn.dataset.act;
    if (act === 'edit') openDesignProjectModal(pid);
    else if (act === 'del') {
      if (confirm('确定删除该项目及所有图片？')) {
        designProjects = designProjects.filter(p => p.id !== pid);
        storage.set('wb_design_projects', designProjects);
        renderDesignProjects();
        showToast('项目已删除');
        scheduleAutoPush();
      }
    } else if (act === 'open') {
      openDesignLightbox(pid);
    }
    return;
  }
  // 点击卡片其它区域
  openDesignLightbox(pid);
});
renderDesignProjects();

/* ============================================================
 * 设计项目全屏查看
 * ============================================================ */
let dpCarouselTimer = null, dpCurrent = 0, dpTotal = 0;
function openDesignLightbox(pid) {
  const dp = designProjects.find(p => p.id === pid);
  if (!dp || !(dp.images || []).length) { showToast('该项目暂无图片'); return; }
  dpTotal = dp.images.length;
  dpCurrent = 0;
  $('#dpLightboxTitle').textContent = dp.name;
  $('#dpLightboxTrack').innerHTML = dp.images.map((src, i) =>
    `<figure class="dp-slide"><img src="${src}" alt="${escapeHtml(dp.name)} ${i + 1}"></figure>`
  ).join('');
  renderDpDots();
  updateDpCarousel(false);
  $('#dpLightbox').hidden = false;
  $('#dpLightbox').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  startDpAuto();
}
function renderDpDots() {
  const box = $('#dpDots');
  box.innerHTML = Array.from({ length: dpTotal }).map((_, i) => `<span data-i="${i}"></span>`).join('');
  $$('#dpDots span', box).forEach(s => s.addEventListener('click', () => goDp(Number(s.dataset.i))));
}
function updateDpCarousel(animate) {
  const track = $('#dpLightboxTrack');
  track.style.transition = animate ? 'transform 0.5s ease' : 'none';
  track.style.transform = `translateX(${-dpCurrent * 100}%)`;
  $$('#dpDots span').forEach((s, i) => s.classList.toggle('active', i === dpCurrent));
  $('#dpCounter').textContent = (dpTotal ? dpCurrent + 1 : 0) + ' / ' + dpTotal;
}
function goDp(i) {
  if (!dpTotal) return;
  dpCurrent = (i + dpTotal) % dpTotal;
  updateDpCarousel(true);
  startDpAuto();
}
function nextDp() { goDp(dpCurrent + 1); }
function prevDp() { goDp(dpCurrent - 1); }
function startDpAuto() {
  if (dpCarouselTimer) clearInterval(dpCarouselTimer);
  if (dpTotal > 1) dpCarouselTimer = setInterval(nextDp, 5000);
}
function closeDesignLightbox() {
  $('#dpLightbox').hidden = true;
  $('#dpLightbox').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (dpCarouselTimer) { clearInterval(dpCarouselTimer); dpCarouselTimer = null; }
  $('#dpLightboxTrack').innerHTML = '';
}
$('#dpLightboxClose').addEventListener('click', closeDesignLightbox);
$('#dpLightboxBackdrop').addEventListener('click', closeDesignLightbox);
$('#dpPrev').addEventListener('click', prevDp);
$('#dpNext').addEventListener('click', nextDp);
document.addEventListener('keydown', (e) => {
  if ($('#dpLightbox').hidden) return;
  if (e.key === 'Escape') closeDesignLightbox();
  else if (e.key === 'ArrowLeft') prevDp();
  else if (e.key === 'ArrowRight') nextDp();
});

/* ============================================================
 * 工作信息管理
 * ============================================================ */
let workProjects = storage.get('wb_work_projects', [
  { id: 'w1', name: '卖设计官网改版', start: '2026-07-20', end: '2026-08-25', actualEnd: '', note: '重点优化移动端体验与作品集展示。', mine: true,
    tasks: [ { id: 't1', owner: '阿理', title: '首页视觉稿', deadline: '2026-08-05', status: 'done', note: '已确认' },
             { id: 't2', owner: '小林', title: '案例详情页', deadline: '2026-08-10', status: 'progress', note: '等文案' },
             { id: 't3', owner: '阿杰', title: '前端适配', deadline: '2026-08-18', status: 'pending', note: '' } ] },
  { id: 'w2', name: '某茶饮品牌 VI 设计', start: '2026-08-01', end: '2026-08-15', actualEnd: '', note: '客户希望突出东方茶感。',
    tasks: [ { id: 't4', owner: '阿理', title: 'LOGO 提案', deadline: '2026-08-08', status: 'progress', note: '三稿方向' },
             { id: 't5', owner: '小林', title: '辅助图形', deadline: '2026-08-12', status: 'pending', note: '' } ] },
  { id: 'w3', name: '企业内部画册', start: '2026-07-10', end: '2026-07-30', actualEnd: '2026-07-28', note: '已交付印刷。',
    tasks: [ { id: 't6', owner: '阿杰', title: '版式规范', deadline: '2026-07-20', status: 'done', note: '' },
             { id: 't7', owner: '阿理', title: '封面设计', deadline: '2026-07-25', status: 'done', note: '' } ] }
]);
let workTrash = storage.get('wb_work_trash', []);
function saveTrash() { storage.set('wb_work_trash', workTrash); }

let editingProjectId = null, editingTaskId = null, currentTaskProjectId = null;
let adminView = storage.get('wb_admin_view', false);
let taskCollapsed = new Set(storage.get('wb_task_collapsed', []));
let workFilter = null;

function getProjectStatus(proj) {
  if (proj.actualEnd) return 'done';
  if (proj.end < todayStr()) return 'overdue';
  return 'progress';
}
function getTaskStatusClass(task) {
  if (task.status === 'done') return '';
  if (task.deadline < todayStr()) return 'overdue';
  return '';
}
function statusText(s) { return { progress: '进行中', overdue: '已超时', done: '已完成' }[s] || '进行中'; }

function renderWorkSummary() {
  const total = workProjects.length;
  const active = workProjects.filter(p => getProjectStatus(p) === 'progress').length;
  const overdue = workProjects.filter(p => getProjectStatus(p) === 'overdue').length;
  const done = workProjects.filter(p => getProjectStatus(p) === 'done').length;
  $('#summaryTotal').textContent   = total;
  $('#summaryActive').textContent  = active;
  $('#summaryOverdue').textContent = overdue;
  $('#summaryDone').textContent    = done;
  $$('#workSummary .summary-item').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === (workFilter || 'all'));
  });
}

function renderAdminAlerts() {
  // 简化：手机端把管理员告警合并到顶部 stats；此函数保留为空 hook
}

function renderDeadlineAlerts() {
  const box = $('#deadlineAlert');
  if (!box) return;
  const now = new Date();
  const within = workProjects.filter(p => {
    if (p.actualEnd) return false;
    if (!p.end) return false;
    const end = new Date(p.end + 'T23:59:59');
    const hrs = (end - now) / 36e5;
    return hrs <= 48;
  });
  if (within.length === 0) { box.hidden = true; box.innerHTML = ''; return; }
  const lines = within.map(p => {
    const end = new Date(p.end + 'T23:59:59');
    const hrs = (end - now) / 36e5;
    let t;
    if (hrs < 0) t = '已超时 ' + Math.round(-hrs) + ' 小时';
    else if (hrs < 1) t = '仅剩 ' + Math.max(0, Math.round(hrs * 60)) + ' 分钟';
    else t = '仅剩 ' + Math.round(hrs) + ' 小时';
    return `· ${escapeHtml(p.name)}（${t}，截止 ${p.end}）`;
  }).join('<br>');
  box.innerHTML = `<div class="deadline-alert-title">⏰ 以下项目将在 48 小时内截止（仅剩少时），请尽快处理或标记完结：</div>${lines}`;
  box.hidden = false;
}

function renderWork() {
  renderWorkSummary();
  renderAdminAlerts();
  renderDeadlineAlerts();
  const list = $('#workList');
  let projects = [...workProjects].sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || (a.end || '').localeCompare(b.end || ''));
  if (workFilter && workFilter !== 'all') {
    projects = projects.filter(p => getProjectStatus(p) === workFilter);
  }
  const labels = { all: '全部项目', progress: '进行中', overdue: '已超时', done: '已完成' };
  $('#workFilterBar').hidden = !workFilter;
  $('#workFilterLabel').textContent = workFilter ? `当前筛选：${labels[workFilter]}（${projects.length}）` : '';

  if (projects.length === 0) { list.innerHTML = '<div class="empty-state">暂无符合条件的项目</div>'; return; }

  list.innerHTML = projects.map(proj => {
    const status = getProjectStatus(proj);
    const actual = proj.actualEnd ? ` · 实际结束：${proj.actualEnd}` : '';
    return `
      <div class="work-item ${status}" data-id="${proj.id}">
        <div class="work-item-header">
          <div class="work-item-title">
            <button class="btn-flag ${proj.mine ? 'on' : 'off'}" data-act="flag" title="${proj.mine ? '取消标记' : '标记为我相关'}" aria-label="flag">🚩</button>
            <h4>${escapeHtml(proj.name)}</h4>
            <span class="status-badge ${status}">${statusText(status)}</span>
          </div>
          <div class="work-item-meta">${proj.start || '—'} 至 ${proj.end || '—'}${actual}</div>
          <div class="work-item-actions">
            <button data-act="add-task">+ 子任务</button>
            <button data-act="edit">编辑</button>
            <button data-act="del">删除</button>
          </div>
        </div>
        <div class="work-item-body">
          <div class="work-note">${proj.note ? escapeHtml(proj.note) : '<span style="color:var(--text-3)">暂无备注</span>'}</div>
          ${proj.tasks && proj.tasks.length ? `
            <div class="work-tasks-header ${taskCollapsed.has(proj.id) ? 'collapsed' : ''}" data-act="toggle-tasks"><h5>子任务 (${proj.tasks.length})</h5><span class="chev">▾</span></div>
            <div class="task-list ${taskCollapsed.has(proj.id) ? 'collapsed' : ''}">
              ${proj.tasks.map(t => `
                <div class="task-item ${getTaskStatusClass(t)}" data-task-id="${t.id}">
                  <div class="task-main">
                    <div class="task-title">${escapeHtml(t.title)}</div>
                    <div class="task-owner">负责人：${escapeHtml(t.owner || '—')} · ${t.status === 'done' ? '已完成' : t.status === 'progress' ? '进行中' : '待开始'}</div>
                  </div>
                  <div class="task-meta">
                    <span class="task-deadline">截止 ${t.deadline || '—'}</span>
                    <div class="task-actions">
                      <button data-act="edit-task">编辑</button>
                      <button data-act="del-task">删除</button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

$('#workSummary').addEventListener('click', (e) => {
  const btn = e.target.closest('.summary-item'); if (!btn) return;
  const f = btn.dataset.filter;
  workFilter = (f === 'all') ? null : f;
  renderWork();
});
$('#workClearFilter').addEventListener('click', () => { workFilter = null; renderWork(); });

function openWorkModal(id = null) {
  editingProjectId = id;
  $('#workModalTitle').textContent = id ? '编辑项目' : '新建项目';
  if (id) {
    const p = workProjects.find(x => x.id === id);
    if (p) {
      $('#projName').value       = p.name;
      $('#projStart').value      = p.start;
      $('#projEnd').value        = p.end;
      $('#projActualEnd').value  = p.actualEnd;
      $('#projNote').value       = p.note;
      $('#projMine').checked     = !!p.mine;
    }
  } else {
    $('#projName').value       = '';
    $('#projStart').value      = todayStr();
    $('#projEnd').value        = '';
    $('#projActualEnd').value  = '';
    $('#projNote').value       = '';
    $('#projMine').checked     = false;
  }
  openModal('workModal');
}
function closeWorkModal() { closeModal('workModal'); editingProjectId = null; }
function saveWorkProject() {
  const name = $('#projName').value.trim();
  const start = $('#projStart').value, end = $('#projEnd').value;
  const actualEnd = $('#projActualEnd').value, note = $('#projNote').value.trim();
  const mine = $('#projMine').checked;
  if (!name) return showToast('请输入项目名称');
  if (!start || !end) return showToast('请选择项目时间');
  if (editingProjectId) {
    const p = workProjects.find(x => x.id === editingProjectId);
    if (p) { p.name = name; p.start = start; p.end = end; p.actualEnd = actualEnd; p.note = note; p.mine = mine; }
  } else {
    workProjects.push({ id: 'w' + Date.now(), name, start, end, actualEnd, note, mine, tasks: [] });
  }
  storage.set('wb_work_projects', workProjects);
  persistWork('更新项目');
  renderWork();
  closeWorkModal();
  showToast('项目已保存');
}

function openTaskModal(projectId, taskId = null) {
  currentTaskProjectId = projectId;
  editingTaskId = taskId;
  $('#taskModalTitle').textContent = taskId ? '编辑子任务' : '新增子任务';
  if (taskId) {
    const p = workProjects.find(x => x.id === projectId);
    const t = p ? p.tasks.find(x => x.id === taskId) : null;
    if (t) {
      $('#taskOwner').value    = t.owner;
      $('#taskTitle').value    = t.title;
      $('#taskDeadline').value = t.deadline;
      $('#taskStatus').value   = t.status;
      $('#taskNote').value     = t.note;
    }
  } else {
    $('#taskOwner').value    = '';
    $('#taskTitle').value    = '';
    $('#taskDeadline').value = todayStr();
    $('#taskStatus').value   = 'pending';
    $('#taskNote').value     = '';
  }
  openModal('taskModal');
}
function closeTaskModal() { closeModal('taskModal'); editingTaskId = null; currentTaskProjectId = null; }
function saveTask() {
  const owner = $('#taskOwner').value.trim();
  const title = $('#taskTitle').value.trim();
  const deadline = $('#taskDeadline').value;
  const status = $('#taskStatus').value;
  const note = $('#taskNote').value.trim();
  if (!owner || !title) return showToast('请填写负责人和子任务名称');
  const p = workProjects.find(x => x.id === currentTaskProjectId);
  if (!p) return;
  if (editingTaskId) {
    const t = p.tasks.find(x => x.id === editingTaskId);
    if (t) { t.owner = owner; t.title = title; t.deadline = deadline; t.status = status; t.note = note; }
  } else {
    p.tasks.push({ id: 't' + Date.now(), owner, title, deadline, status, note });
  }
  storage.set('wb_work_projects', workProjects);
  persistWork('更新子任务');
  renderWork();
  closeTaskModal();
  showToast('子任务已保存');
}

$('#addWorkProject').addEventListener('click', () => openWorkModal());
$('#saveWorkProject').addEventListener('click', saveWorkProject);
$('#saveTask').addEventListener('click', saveTask);

$('#workList').addEventListener('click', (e) => {
  const item = e.target.closest('.work-item');
  if (!item) return;
  const pid = item.dataset.id;
  const btn = e.target.closest('button');
  const th = e.target.closest('.work-tasks-header');
  if (th && !btn) {
    if (taskCollapsed.has(pid)) taskCollapsed.delete(pid); else taskCollapsed.add(pid);
    storage.set('wb_task_collapsed', [...taskCollapsed]);
    const listEl = item.querySelector('.task-list');
    if (listEl) listEl.classList.toggle('collapsed', taskCollapsed.has(pid));
    th.classList.toggle('collapsed', taskCollapsed.has(pid));
    return;
  }
  if (btn) {
    const act = btn.dataset.act;
    if (act === 'flag') {
      const p = workProjects.find(x => x.id === pid);
      if (p) {
        p.mine = !p.mine;
        storage.set('wb_work_projects', workProjects);
        persistWork(p.mine ? '标记项目' : '取消标记');
        renderWork();
        showToast(p.mine ? '已标记为我相关 🚩' : '已取消标记');
      }
      return;
    }
    if (act === 'edit')   { openWorkModal(pid); return; }
    if (act === 'del') {
      const p = workProjects.find(x => x.id === pid);
      if (p && confirm('确定删除该项目「' + p.name + '」及所有子任务？\n（将移入回收站，可恢复）')) {
        workProjects = workProjects.filter(x => x.id !== pid);
        workTrash.unshift({ id: 'tr' + Date.now(), type: 'project', deletedAt: new Date().toISOString(), data: p, projectName: p.name });
        saveTrash(); updateTrashBadge();
        storage.set('wb_work_projects', workProjects);
        persistWork('删除项目');
        renderWork();
        showToast('已移入回收站');
      }
      return;
    }
    if (act === 'add-task') { openTaskModal(pid); return; }
    if (act === 'edit-task') {
      const tid = e.target.closest('.task-item').dataset.taskId;
      openTaskModal(pid, tid);
      return;
    }
    if (act === 'del-task') {
      const tid = e.target.closest('.task-item').dataset.taskId;
      const p = workProjects.find(x => x.id === pid);
      const t = p ? p.tasks.find(x => x.id === tid) : null;
      if (t && confirm('确定删除子任务「' + t.title + '」？\n（将移入回收站，可恢复）')) {
        p.tasks = p.tasks.filter(x => x.id !== tid);
        workTrash.unshift({ id: 'tr' + Date.now(), type: 'task', deletedAt: new Date().toISOString(), data: t, projectId: pid, projectName: p.name });
        saveTrash(); updateTrashBadge();
        storage.set('wb_work_projects', workProjects);
        persistWork('删除子任务');
        renderWork();
        showToast('已移入回收站');
      }
      return;
    }
  }
});

$('#workAdminToggle').addEventListener('click', () => {
  adminView = !adminView;
  storage.set('wb_admin_view', adminView);
  $('#workAdminToggle').classList.toggle('active', adminView);
  renderWork();
  showToast(adminView ? '管理员视图已开启' : '管理员视图已关闭');
});
$('#workAdminToggle').classList.toggle('active', adminView);

/* 回收站 */
function updateTrashBadge() {
  const badge = $('#trashBadge');
  if (!badge) return;
  if (workTrash.length) {
    badge.textContent = workTrash.length;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}
function fmtTrashTime(iso) {
  try { const d = new Date(iso); return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
function renderTrash() {
  const list = $('#trashList');
  if (!list) return;
  if (workTrash.length === 0) { list.innerHTML = '<div class="empty-state">回收站是空的</div>'; $('#emptyTrash').style.display = 'none'; return; }
  $('#emptyTrash').style.display = '';
  list.innerHTML = workTrash.map(item => {
    const isProj = item.type === 'project';
    const title = isProj ? item.data.name : (item.data.title || '未命名任务');
    const sub = isProj
      ? `项目 · ${item.data.tasks.length} 个子任务 · 原截止 ${item.data.end}`
      : `子任务 · 来自「${escapeHtml(item.projectName)}」`;
    return `
      <div class="trash-item" data-trid="${item.id}">
        <div class="trash-info">
          <div class="trash-title">${escapeHtml(title)}</div>
          <div class="trash-sub">${sub} · 删除于 ${fmtTrashTime(item.deletedAt)}</div>
        </div>
        <div class="trash-actions">
          <button data-act="restore">恢复</button>
          <button data-act="purge">彻底删除</button>
        </div>
      </div>`;
  }).join('');
}
function openTrash() { renderTrash(); openModal('trashModal'); }
function closeTrash() { closeModal('trashModal'); }
function restoreTrashItem(trid) {
  const idx = workTrash.findIndex(x => x.id === trid); if (idx < 0) return;
  const item = workTrash[idx];
  if (item.type === 'project') {
    workProjects.push(item.data);
  } else {
    let p = workProjects.find(x => x.id === item.projectId);
    if (!p) p = workProjects.find(x => x.name === item.projectName);
    if (p) { p.tasks.push(item.data); }
    else { workProjects.push({ id: 'w' + Date.now(), name: item.projectName || '未命名项目', start: '', end: '', actualEnd: '', note: '', mine: false, tasks: [item.data] }); }
  }
  workTrash.splice(idx, 1);
  saveTrash(); updateTrashBadge();
  storage.set('wb_work_projects', workProjects);
  persistWork('从回收站恢复');
  renderWork();
  closeTrash();
  showToast('已恢复');
}
function deleteTrashItem(trid) {
  const idx = workTrash.findIndex(x => x.id === trid); if (idx < 0) return;
  workTrash.splice(idx, 1); saveTrash(); updateTrashBadge(); renderTrash(); showToast('已彻底删除');
}
function emptyTrash() {
  if (workTrash.length === 0) return;
  if (!confirm('确定清空回收站？所有项目/任务将被永久删除，无法恢复。')) return;
  workTrash = []; saveTrash(); updateTrashBadge(); renderTrash(); showToast('回收站已清空');
}
$('#openTrash').addEventListener('click', openTrash);
$('#emptyTrash').addEventListener('click', emptyTrash);
$('#trashList').addEventListener('click', (e) => {
  const item = e.target.closest('.trash-item'); if (!item) return;
  const trid = item.dataset.trid;
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.act === 'restore') restoreTrashItem(trid);
  else if (btn.dataset.act === 'purge') deleteTrashItem(trid);
});

renderWork();
updateTrashBadge();

/* ============================================================
 * 模态开关通用
 * ============================================================ */
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.hidden = true;
  // 只有在没有其它模态显示时再恢复滚动
  if (!$$('.modal').some(x => !x.hidden)) document.body.style.overflow = '';
}
document.addEventListener('click', (e) => {
  const closeBtn = e.target.closest && e.target.closest('[data-close]');
  if (closeBtn) closeModal(closeBtn.dataset.close);
});

/* ============================================================
 * 云端共享（JSONBin）— 与桌面端完全一致
 * ============================================================ */
const BIN_BASE = 'https://api.jsonbin.io/v3/b';
const MOBILE_BASE = 'https://15ed2a4986fb418abb2fb9156b827f39.app.workbuddy.link';

function binKey() { return storage.get('wb_jsonbin_key', '') || '$2a$10$LVdnpj.YECKrdLNPt1A7keCBqhbOeKGittxyrYGKqO7l5k8vkwu.2'; }
function setBinKey(k) { storage.set('wb_jsonbin_key', (k || '').trim()); }
function getEditorName() { return (storage.get('wb_editor_name', '我') || '我').trim() || '我'; }
function requireKey() {
  const k = binKey();
  if (!k) { showToast('请先在右上角 ⚙ 设置中填写 JSONBin API Key'); openSettings(); return null; }
  return k;
}
function setOwner(id) { storage.set('wb_share_owner_' + id, true); }
function isOwner(id) { return storage.get('wb_share_owner_' + id, false); }
function addOwned(id) {
  const list = storage.get('wb_share_owned', []);
  if (list.indexOf(id) === -1) { list.push(id); storage.set('wb_share_owned', list); }
}
function setLastSave(id, t) { storage.set('wb_share_lastsave_' + id, t); }
function getLastSave(id) { return storage.get('wb_share_lastsave_' + id, ''); }

async function cloudCreate(payload) {
  const key = binKey(); if (!key) throw new Error('NO_KEY');
  const r = await fetch(BIN_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': key, 'X-Bin-Private': 'false' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error('CREATE_FAIL ' + r.status);
  const j = await r.json();
  return j.metadata.id;
}
async function cloudRead(id) {
  const key = binKey(); if (!key) throw new Error('NO_KEY');
  const r = await fetch(BIN_BASE + '/' + id + '/latest', { headers: { 'X-Master-Key': key } });
  if (!r.ok) throw new Error('READ_FAIL ' + r.status);
  const j = await r.json();
  return j.record;
}
async function cloudUpdate(id, payload) {
  const key = binKey(); if (!key) throw new Error('NO_KEY');
  const r = await fetch(BIN_BASE + '/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': key },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error('UPDATE_FAIL ' + r.status);
  return true;
}

const SYNC_DATA_KEYS = ['wb_portfolio', 'wb_zcool', 'wb_design_projects', 'wb_editor_name'];

function collectSyncData() {
  const d = {};
  SYNC_DATA_KEYS.forEach(k => { d[k] = storage.get(k, null); });
  return { ts: Date.now(), data: d };
}
async function compressForSync(payload) {
  const dps = payload.data.wb_design_projects;
  if (!dps || !dps.length) return payload;
  for (let i = 0; i < dps.length; i++) {
    const imgs = dps[i].images;
    if (imgs && imgs.length) {
      const out = [];
      for (let j = 0; j < imgs.length; j++) {
        out.push(await compressDataUrl(imgs[j], 480, 0.7));
      }
      dps[i].images = out;
    }
  }
  return payload;
}

async function syncPush() {
  if (!requireKey()) return;
  showToast('正在备份到云端…');
  try {
    const payload = await compressForSync(collectSyncData());
    let binId = storage.get('wb_sync_bin', '');
    if (binId) { await cloudUpdate(binId, payload); }
    else { binId = await cloudCreate(payload); storage.set('wb_sync_bin', binId); }
    showToast('已备份到云端 ✓');
    const link = MOBILE_BASE + '?sync=' + encodeURIComponent(binId) + '&k=' + encodeURIComponent(binKey());
    const box = $('#syncResult'); if (box) box.hidden = false;
    if ($('#syncResultLink')) $('#syncResultLink').value = link;
    if ($('#syncResultCode')) $('#syncResultCode').textContent = binId;
  } catch (e) {
    showToast('备份失败：' + e.message + '（数据过大建议用「导出备份」）');
  }
}
async function syncPull() {
  if (!requireKey()) return;
  const binId = storage.get('wb_sync_bin', '');
  if (!binId) { showToast('请先填写恢复码，或先在电脑端备份'); return; }
  showToast('正在从云端恢复…');
  try {
    const rec = await cloudRead(binId);
    applySyncData(rec);
    showToast('已从云端恢复 ✓');
  } catch (e) {
    showToast('恢复失败：' + e.message);
  }
}
function applySyncData(record) {
  const d = record && record.data ? record.data : record;
  if (!d) return;
  SYNC_DATA_KEYS.forEach(k => { if (d[k] != null) {
    storage.set(k, d[k]);
    if (k === 'wb_portfolio')      portfolio = d[k] || portfolio;
    if (k === 'wb_zcool')          zcoolConfig = d[k] || zcoolConfig;
    if (k === 'wb_design_projects')designProjects = d[k] || designProjects;
  }});
  if (d.wb_work_projects != null) {
    storage.set('wb_work_projects', d.wb_work_projects);
    workProjects = d.wb_work_projects;
  }
  renderPortfolio();
  renderZcool();
  renderDesignProjects();
  renderWork();
}

function exportDataFile() {
  const payload = collectSyncData();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '卖设计-数据备份.json';
  a.click();
  showToast('已导出备份文件');
}
function importDataFile(file) {
  const reader = new FileReader();
  reader.onload = function () {
    try { const payload = JSON.parse(reader.result); applySyncData(payload); showToast('已导入数据 ✓'); }
    catch { showToast('文件解析失败'); }
  };
  reader.readAsText(file);
}

/* URL ?sync= 自动恢复（手机端一键同步） */
(function autoSyncFromUrl() {
  try {
    const p = new URLSearchParams(location.search);
    const bid = p.get('sync');
    if (!bid) return;
    const k = p.get('k');
    if (k) setBinKey(k);
    storage.set('wb_sync_bin', bid);
    showToast('正在从云端恢复…');
    cloudRead(bid).then(rec => {
      applySyncData(rec);
      showToast('已从云端同步 ✓');
    }).catch(e => { showToast('自动同步失败：' + e.message); });
  } catch { /* ignore */ }
})();

/* 全自动同步：保存即推云端（debounce 1s） */
let _autoPushTimer = null;
function scheduleAutoPush() {
  if (!binKey()) return;
  if (_autoPushTimer) clearTimeout(_autoPushTimer);
  _autoPushTimer = setTimeout(autoPush, 1000);
}
async function autoPush() {
  const key = binKey(); if (!key) return;
  try {
    const payload = await compressForSync(collectSyncData());
    payload.ts = Date.now();
    storage.set('wb_sync_local_ts', payload.ts);
    let binId = storage.get('wb_sync_bin', '');
    if (binId) { await cloudUpdate(binId, payload); }
    else { binId = await cloudCreate(payload); storage.set('wb_sync_bin', binId); }
  } catch { /* 静默失败，可手动重试 */ }
}
async function autoPullOnLoad() {
  if (isSharedView) return; // 分享查看模式：不拉云端，避免覆盖快照数据
  const key = binKey(); if (!key) return;
  const binId = storage.get('wb_sync_bin', '');
  if (!binId) return;
  try {
    const rec = await cloudRead(binId);
    if (!rec) return;
    const localTs = storage.get('wb_sync_local_ts', 0);
    if (rec.ts && rec.ts <= localTs) return;
    applySyncData(rec);
    if (rec.ts) storage.set('wb_sync_local_ts', rec.ts);
    showToast('已从云端同步最新数据 ✓');
  } catch { /* 忽略 */ }
}

/* ============================================================
 * 工作信息实时同步（与桌面端一致）
 * ============================================================ */
let cloudWorkId = storage.get('wb_work_sync_id', null);
let cloudWorkMeta = { version: 0, lastEditor: '', lastEditAt: '', changelog: [] };
let isSharedView = false;

function persistWork(summary) {
  storage.set('wb_work_projects', workProjects);
  renderWork();
  pushWorkLive(summary);
  scheduleAutoPush();
}
async function pushWorkLive(summary) {
  const key = binKey(); if (!key) return;
  if (!cloudWorkId) {
    try {
      const now0 = new Date().toISOString();
      const meta0 = { version: 1, lastEditor: getEditorName(), lastEditAt: now0, changelog: [] };
      const id = await cloudCreate({ type: 'work', data: workProjects, meta: meta0 });
      cloudWorkId = id; cloudWorkMeta = meta0;
      storage.set('wb_work_sync_id', id); addOwned(id); setLastSave(id, now0);
      showShareResult('工作信息实时同步已开启 ✓ 把此链接发到另一台设备打开，即可两端实时联动：', buildShareLink(id, 'work', 'edit'));
    } catch { return; }
  }
  const now = new Date().toISOString();
  const rec = buildWorkRecord(summary, now);
  try { await cloudUpdate(cloudWorkId, rec); setLastSave(cloudWorkId, now); }
  catch { /* 忽略 */ }
}
function buildWorkRecord(summary, now) {
  const editor = getEditorName();
  const meta = cloudWorkMeta;
  meta.version = (meta.version || 0) + 1;
  meta.lastEditAt = now;
  meta.lastEditor = editor;
  meta.changelog = meta.changelog || [];
  meta.changelog.unshift({ at: now, by: editor, summary: summary || '修改了工作信息' });
  if (meta.changelog.length > 50) meta.changelog.length = 50;
  return { type: 'work', data: workProjects, trash: workTrash, meta: JSON.parse(JSON.stringify(meta)) };
}

async function shareWorkEdit() {
  if (!requireKey()) return;
  const now = new Date().toISOString();
  const meta = { version: 1, lastEditor: getEditorName(), lastEditAt: now, changelog: [] };
  const payload = { type: 'work', data: workProjects, meta };
  try {
    const id = await cloudCreate(payload);
    cloudWorkId = id; cloudWorkMeta = meta; setOwner(id); addOwned(id); setLastSave(id, now);
    storage.set('wb_share_seen_' + id, 1);
    storage.set('wb_work_sync_id', id);
    const link = buildShareLink(id, 'work', 'edit');
    showShareResult('工作信息协作链接（对方打开可编辑，你在本机会收到修改提示与记录）：', link);
  } catch (e) { showToast('创建失败：' + e.message); }
}
function b64encode(str){ try { return btoa(unescape(encodeURIComponent(str))); } catch(e){ return btoa(str); } }
function b64decode(b64){ try { return decodeURIComponent(escape(atob(b64))); } catch(e){ return atob(b64); } }
async function sharePortfolioView() {
  showToast('正在生成作品库分享链接…');
  const pf  = storage.get('wb_portfolio', []);
  const zc  = storage.get('wb_zcool', {});
  const dps = storage.get('wb_design_projects', []);
  const zcC = Object.assign({}, zc);
  if (zcC.cover) zcC.cover = await compressDataUrl(zcC.cover, 320, 0.6);
  const base = location.origin + location.pathname;

  const key = binKey();
  // 1) 已配置云端 Key：优先用「极短云端链接」——URL 仅一两百字符，复制可靠，
  //    图片存云端且更清晰（480px），对方联网即可查看（Key 随链接一起下发）
  if (key) {
    try {
      // 多级压缩，确保整包 < 100KB（JSONBin 免费版单 bin 上限约 100KB），否则会 403 失败并降级成长链
      const dpsCloud = await sharePortfolioCloudFit(dps, pf, zcC, 95000);
      const payloadCloud = { type: 'portfolio', data: { portfolio: pf, zcool: zcC, designProjects: dpsCloud } };
      const id = await cloudCreate(payloadCloud);
      const link = base + '?share=' + encodeURIComponent(id) + '&t=portfolio&m=view&k=' + encodeURIComponent(key);
      showShareResult('作品库查看链接（图片已存云端，链接极短、复制可靠，对方联网即可查看）：', link);
      return;
    } catch (e) {
      // 云端失败：降级为内联（保留全部图片，绝不清空），并提示链接较长
      const dpsInline = await Promise.all(dps.map(async dp => Object.assign({}, dp, {
        images: await compressImages(dp.images || [], 200, 0.5)
      })));
      const payloadInline = { type: 'portfolio', data: { portfolio: pf, zcool: zcC, designProjects: dpsInline } };
      const b64 = b64encode(JSON.stringify(payloadInline));
      const link = base + '?snap=' + encodeURIComponent(b64) + '&t=portfolio&m=view';
      showShareResult('云端生成失败，已降级为离线快照（链接较长，请用浏览器完整打开）：', link);
      return;
    }
  }

  // 2) 无 Key：只能内联（离线可看、无需联网，但链接长）。提示去设置配置 Key 可生成极短链接
  const dpsInline = await Promise.all(dps.map(async dp => Object.assign({}, dp, {
    images: await compressImages(dp.images || [], 200, 0.5)
  })));
  const payloadInline = { type: 'portfolio', data: { portfolio: pf, zcool: zcC, designProjects: dpsInline } };
  const b64 = b64encode(JSON.stringify(payloadInline));
  const link = base + '?snap=' + encodeURIComponent(b64) + '&t=portfolio&m=view';
  showShareResult('作品库查看快照（只读，离线可看；未配置云端 Key 故链接较长，去 ⚙ 设置配置 Key 可生成极短链接）：', link);
}
/* 多级压缩设计项目图片，确保整包 JSON 不超过 maxBytes（JSONBin 免费版单 bin 上限约 100KB），
   尽量让云端短链成功；逐级降质直到满足，或最终仅保留每项目首图 */
async function sharePortfolioCloudFit(dps, pf, zcC, maxBytes) {
  const presets = [[480,0.7],[300,0.55],[220,0.5],[150,0.42],[110,0.38]];
  for (const [w,q] of presets) {
    const comp = await Promise.all(dps.map(async dp => Object.assign({}, dp, {
      images: await compressImages(dp.images || [], w, q)
    })));
    const payload = { type:'portfolio', data:{ portfolio:pf, zcool:zcC, designProjects:comp } };
    if (JSON.stringify(payload).length <= maxBytes) return comp;
  }
  const coverOnly = await Promise.all(dps.map(async dp => {
    const first = (dp.images || []).slice(0,1);
    return Object.assign({}, dp, { images: await compressImages(first, 100, 0.35) });
  }));
  return coverOnly;
}
function buildShareLink(id, type, mode) {
  const base = location.origin + location.pathname;
  return base + '?share=' + encodeURIComponent(id) + '&t=' + type + '&m=' + mode + '&k=' + encodeURIComponent(binKey());
}
async function loadPortfolioSnapshot(b64) {
  isSharedView = true;
  document.body.classList.add('shared-view');
  try {
    const rec = JSON.parse(b64decode(b64));
    const data = rec.data || rec;
    portfolio = data.portfolio || portfolio;
    zcoolConfig = data.zcool || zcoolConfig;
    designProjects = data.designProjects || designProjects;
    // 注意：分享查看模式【绝不写回本地存储】，否则会用分享里的（可能压缩过的静图）
    // 覆盖掉用户自己的真实数据（GIF 会因此变静图）。仅内存渲染即可。
    renderPortfolio(); renderZcool(); renderDesignProjects();
    switchTab(1, false); // 分享的是「设计作品库」，打开即停在该页
    showToast('已加载共享作品库快照（只读）');
  } catch (e) { showToast('加载快照失败：' + e.message); }
}

async function loadWorkEdit(id) {
  cloudWorkId = id;
  storage.set('wb_work_sync_id', id);
  try {
    const rec = await cloudRead(id);
    if (rec && rec.data) {
      workProjects = rec.data;
      cloudWorkMeta = rec.meta || cloudWorkMeta;
      storage.set('wb_work_projects', workProjects);
      renderWork();
      showToast('已加载共享工作信息（可编辑）');
    }
  } catch (e) { showToast('加载共享工作信息失败：' + e.message); }
}
async function loadPortfolioView(id) {
  isSharedView = true;
  document.body.classList.add('shared-view');
  try {
    const rec = await cloudRead(id);
    if (rec && rec.data) {
      portfolio = rec.data.portfolio || portfolio;
      zcoolConfig = rec.data.zcool || zcoolConfig;
      designProjects = rec.data.designProjects || designProjects;
      // 分享查看模式【绝不写回本地存储】，避免用分享数据覆盖用户自己的真实数据
      renderPortfolio(); renderZcool(); renderDesignProjects();
      switchTab(1, false); // 分享的是「设计作品库」，打开即停在该页
      showToast('已加载共享作品库（只读）');
    }
  } catch (e) { showToast('加载共享作品库失败：' + e.message); }
}
/* 从同域静态 JSON 文件加载分享（?file= 指向服务器上的 data.json，
   用于把较大/含动图的分享数据托管在服务器、绕开云端单条体积上限；同域无 CORS） */
async function loadPortfolioFromFile(fileParam) {
  isSharedView = true;
  document.body.classList.add('shared-view');
  try {
    const raw = String(fileParam).trim();
    // 短链支持：
    //  1) 纯数字 -> 表示分片数 n，自动展开 data.0.json .. data.(n-1).json（同域 /share-assets/）
    //  2) 逗号分隔，每项可写：完整 URL / 以 / 开头的绝对路径 / 仅文件名（默认补 /share-assets/）
    let urls;
    if (/^\d+$/.test(raw)) {
      const n = parseInt(raw, 10);
      urls = Array.from({ length: n }, (_, i) => 'data.' + i + '.json');
    } else {
      urls = raw.split(',').map(s => s.trim()).filter(Boolean);
    }
    // 基于「当前页面所在目录」拼接，兼容 Gitee Pages 子路径（如 /workbench/）与根域部署
    const pageDir = location.href.split('?')[0].replace(/[^/]*$/, '');
    const resolve = (u) => {
      if (/^https?:\/\//i.test(u)) return u;                 // 完整 URL，原样
      if (u.startsWith('/')) return new URL(u, location.href).href; // 站点根绝对路径
      return pageDir + 'share-assets/' + u;                  // 仅文件名，补同目录 share-assets
    };
    urls = urls.map(resolve);
    const merged = { portfolio: null, zcool: null, designProjects: [] };
    for (const u of urls) {
      const res = await fetch(u, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' @ ' + u.slice(0, 56));
      const rec = await res.json();
      const data = rec.data || rec;
      if (data.portfolio) merged.portfolio = data.portfolio;
      if (data.zcool) merged.zcool = data.zcool;
      if (Array.isArray(data.designProjects)) merged.designProjects = merged.designProjects.concat(data.designProjects);
    }
    portfolio = merged.portfolio || portfolio;
    zcoolConfig = merged.zcool || zcoolConfig;
    designProjects = merged.designProjects.length ? merged.designProjects : designProjects;
    // 分享查看模式【绝不写回本地存储】，避免用分享数据覆盖用户自己的真实数据
    renderPortfolio(); renderZcool(); renderDesignProjects();
    switchTab(1, false); // 分享的是「设计作品库」，打开即停在该页
    showToast('已加载共享作品库（只读）');
  } catch (e) { showToast('加载共享作品库失败：' + e.message); }
}

/* ============================================================
 * 通知与修改记录（顶栏铃铛）
 * ============================================================ */
function addNotification(n) {
  const list = storage.get('wb_notifications', []);
  list.unshift(n); if (list.length > 50) list.length = 50;
  storage.set('wb_notifications', list);
  storage.set('wb_bell_ack', '0');
  updateBellBadge();
}
function updateBellBadge() {
  const badge = $('#bellBadge'); if (!badge) return;
  const ack = storage.get('wb_bell_ack', '1') === '1';
  badge.hidden = !!ack;
}
function renderBell() {
  const list = storage.get('wb_notifications', []);
  const box = $('#bellList'); if (!box) return;
  if (!list.length) { box.innerHTML = '<div class="bell-empty">暂无修改通知</div>'; return; }
  box.innerHTML = list.map(n => `
    <div class="bell-item">
      <div class="bell-item-by">${escapeHtml(n.by)}</div>
      <div class="bell-item-sum">${escapeHtml(n.summary || '')}</div>
      <div class="bell-item-time">${fmtTime(n.at)}</div>
    </div>
  `).join('');
}
function openBell() {
  renderBell();
  $('#bellPanel').hidden = false;
  storage.set('wb_bell_ack', '1');
  updateBellBadge();
}
function closeBell() { $('#bellPanel').hidden = true; }

$('#openBell').addEventListener('click', (e) => { e.stopPropagation(); openBell(); });
$('#closeBell').addEventListener('click', closeBell);
document.addEventListener('click', (e) => {
  if (!e.target.closest('#bellPanel') && !e.target.closest('#openBell')) closeBell();
});

/* 轮询：拥有者定期检查共享工作是否被别人修改 */
let pollTimer = null;
async function pollOwned() {
  const owned = storage.get('wb_share_owned', []);
  for (let i = 0; i < owned.length; i++) {
    const id = owned[i];
    try {
      const rec = await cloudRead(id);
      if (!rec || !rec.meta) continue;
      const seen = storage.get('wb_share_seen_' + id, 0);
      const ver = rec.meta.version || 0;
      if (ver <= seen) continue;
      storage.set('wb_share_seen_' + id, ver);
      const lastSave = getLastSave(id);
      const isSelf = lastSave && rec.meta.lastEditAt &&
        Math.abs(new Date(rec.meta.lastEditAt) - new Date(lastSave)) < 8000;
      cloudWorkMeta = rec.meta;
      if (cloudWorkId === id) {
        workProjects = rec.data || workProjects;
        if (rec.trash) { workTrash = rec.trash; saveTrash(); updateTrashBadge(); }
        renderWork();
      }
      if (!isSelf) {
        const entry = (rec.meta.changelog || [])[0] || { by: rec.meta.lastEditor, summary: '修改了工作信息', at: rec.meta.lastEditAt };
        showToast('🔔 ' + entry.by + ' 于 ' + fmtTime(entry.at) + ' 修改了工作信息：' + entry.summary);
        addNotification({ id, by: entry.by, summary: entry.summary, at: entry.at });
      }
    } catch { /* 忽略单次错误 */ }
  }
}
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollOwned, 20000);
  pollOwned();
}

/* ============================================================
 * 设置 + 分享结果
 * ============================================================ */
function openSettings() {
  $('#jsonbinKey').value = binKey();
  $('#editorName').value = getEditorName();
  openModal('settingsModal');
}
function closeSettings() { closeModal('settingsModal'); }
function saveSettings() {
  setBinKey($('#jsonbinKey').value);
  storage.set('wb_editor_name', $('#editorName').value.trim());
  closeSettings();
  showToast('设置已保存');
  scheduleAutoPush();
}
$('#openSettings').addEventListener('click', () => openSettings());
$('#saveSettings').addEventListener('click', saveSettings);
$('#btnSyncPush').addEventListener('click', syncPush);
$('#btnSyncPull').addEventListener('click', syncPull);
$('#btnExport').addEventListener('click', exportDataFile);
$('#btnImport').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) importDataFile(e.target.files[0]);
  e.target.value = '';
});
$('#shareWork').addEventListener('click', shareWorkEdit);
$('#sharePortfolio').addEventListener('click', sharePortfolioView);

function showShareResult(desc, link) {
  $('#shareResultDesc').textContent = desc;
  $('#shareResultLink').value = link;
  openModal('shareResultModal');
}
function closeShareResult() { closeModal('shareResultModal'); }
$('#copyShareLink').addEventListener('click', async () => {
  const v = $('#shareResultLink').value;
  const ok = await robustCopy(v);
  if (ok) { showToast('链接已复制 ✓'); return; }
  /* 所有自动复制方式都失败（常见于微信/QQ 等 WebView 的长链接）：
     选中输入框，提示用户长按复制，避免"复制失败"却无下文 */
  const inp = $('#shareResultLink');
  inp.focus();
  try { inp.select(); inp.setSelectionRange(0, v.length); } catch (e) {}
  showToast('已选中链接，请长按「复制」');
});

/* 健壮复制：现代 API → 旧版 execCommand → 失败返回 false（由调用方兜底选中） */
async function robustCopy(text) {
  /* 1) 现代异步剪贴板 API（需安全上下文；超长字符串在部分移动端会直接 reject） */
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) { /* 降级 */ }
  }
  /* 2) execCommand：兼容性最好，长链接在移动端 WebView 中通常靠它生效 */
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const range = document.createRange();
    range.selectNodeContents(ta);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) return true;
  } catch (e) { /* 降级 */ }
  return false;
}

/* 启动时解析分享链接 */
(function initShare() {
  const params = new URLSearchParams(location.search);
  const id = params.get('share');
  const snap = params.get('snap');
  const file = params.get('file');
  const type = params.get('t');
  const mode = params.get('m');
  const k = params.get('k');
  if (k) setBinKey(k);
  if (id && type === 'work' && mode === 'edit') loadWorkEdit(id);
  else { const wid = storage.get('wb_work_sync_id', null); if (wid) cloudWorkId = wid; }
  if (snap && type === 'portfolio' && mode === 'view') { loadPortfolioSnapshot(snap); }
  else if (id && type === 'portfolio' && mode === 'view') loadPortfolioView(id);
  else if (file && type === 'portfolio' && mode === 'view') loadPortfolioFromFile(file);
  updateBellBadge();
  startPolling();
})();

/* 启动时尝试从云端拉取另一端的最新数据 */
autoPullOnLoad();

/* ima 二维码弹窗 */
(function initImaQr() {
  const modal = $('#imaQrModal');
  const card = $('#openIma');
  if (!modal || !card) return;
  card.addEventListener('click', () => { modal.hidden = false; });
  $('#closeImaQr').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
})();

/* 顶栏高度自适应（含品牌横幅后高度变化） */
function syncTopbarHeight() {
  const tb = document.querySelector('.topbar');
  if (tb) document.documentElement.style.setProperty('--topbar-h', tb.offsetHeight + 'px');
}
syncTopbarHeight();
window.addEventListener('resize', syncTopbarHeight);
window.addEventListener('orientationchange', syncTopbarHeight);
window.addEventListener('load', syncTopbarHeight);
/* 品牌 PNG 异步加载会改变顶栏高度，用 ResizeObserver 兜底同步 */
if (window.ResizeObserver) {
  const __tb = document.querySelector('.topbar');
  if (__tb) new ResizeObserver(syncTopbarHeight).observe(__tb);
}
/* 图片加载完成这一刻再同步一次（防止 ResizeObserver 早于布局生效） */
const __brandImg = document.querySelector('.brand-banner-img');
if (__brandImg) __brandImg.addEventListener('load', syncTopbarHeight);

/* 暴露给调试（可选） */
window.__workbench = { workProjects, designProjects, portfolio, zcoolConfig, workTrash, switchTab };

/* ============================================================
 * PWA：注册 Service Worker（让应用可"安装"到手机桌面、支持离线）
 * ============================================================ */
(function registerPWA() {
  if (!('serviceWorker' in navigator)) return;
  const okProto = location.protocol === 'https:' ||
                  location.hostname === 'localhost' ||
                  location.hostname === '127.0.0.1';
  if (!okProto) return; // 非安全上下文不注册（file:// 等）
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=m20260816v').catch(() => { /* 忽略注册失败 */ });
  });

  /* 捕获 beforeinstallprompt，显示页内"安装"按钮（绕过浏览器菜单隐藏） */
  let deferredPrompt = null;
  const banner = document.getElementById('installBanner');
  const btn = document.getElementById('installBtn');
  const closeBtn = document.getElementById('installClose');

  function showBanner() {
    if (!banner) return;
    banner.hidden = false;
    requestAnimationFrame(() => banner.classList.add('show'));
  }
  function hideBanner() {
    if (!banner) return;
    banner.classList.remove('show');
    setTimeout(() => { banner.hidden = true; }, 320);
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner();
  });
  if (btn) btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (_) {}
    deferredPrompt = null;
    hideBanner();
  });
  if (closeBtn) closeBtn.addEventListener('click', hideBanner);
  window.addEventListener('appinstalled', hideBanner);
})();
