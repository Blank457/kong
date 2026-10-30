document.addEventListener('DOMContentLoaded', () => {
  setActiveNav();
  initBackground();
  initHome();
  initTraining();
  toastInit();
});

/* ---------- 导航高亮 ---------- */
function setActiveNav() {
  const pages = ['index.html', 'training.html', 'gear.html'];
  let current = location.pathname.split('/').pop();
  if (!pages.includes(current)) current = 'index.html';
  document.querySelectorAll('.nav-links a').forEach((a) => {
    if (a.getAttribute('href') === current) a.classList.add('active');
  });
}

/* ---------- 背景羽毛动画 ---------- */
function initBackground() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let feathers = [];
  let w = 0;
  let h = 0;

  const makeFeather = (initial) => ({
    x: Math.random() * w,
    y: initial ? Math.random() * h : -30,
    size: 8 + Math.random() * 14,
    speed: 0.25 + Math.random() * 0.6,
    drift: (Math.random() - 0.5) * 0.5,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.012,
    alpha: 0.15 + Math.random() * 0.3
  });

  const resize = () => {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    const count = Math.min(45, Math.max(14, Math.round(w / 32)));
    feathers = Array.from({ length: count }, () => makeFeather(true));
  };

  const drawFeather = (f) => {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    ctx.globalAlpha = f.alpha;
    ctx.strokeStyle = '#12916b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -f.size);
    ctx.quadraticCurveTo(f.size * 0.85, -f.size * 0.1, 0, f.size);
    ctx.quadraticCurveTo(-f.size * 0.85, -f.size * 0.1, 0, -f.size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -f.size);
    ctx.lineTo(0, f.size);
    ctx.stroke();
    ctx.restore();
  };

  const tick = () => {
    ctx.clearRect(0, 0, w, h);
    for (const f of feathers) {
      f.y += f.speed;
      f.x += f.drift + Math.sin(f.y / 90) * 0.35;
      f.angle += f.spin;
      if (f.y > h + 40) {
        f.y = -30;
        f.x = Math.random() * w;
      }
      drawFeather(f);
    }
    requestAnimationFrame(tick);
  };

  resize();
  window.addEventListener('resize', resize);
  if (!reduce) tick();
  else feathers.forEach(drawFeather);
}

/* ---------- 提示条 ---------- */
let toastTimer;
function toastInit() {
  if (document.getElementById('toast')) return;
  const el = document.createElement('div');
  el.id = 'toast';
  document.body.appendChild(el);
}

function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- 首页 ---------- */
function initHome() {
  if (document.body.dataset.page !== 'index') return;
  renderHome();
}

function renderHome() {
  const list = document.getElementById('home-plan-list');
  if (!list) return;

  const progress = Store.planProgress();
  const plan = Store.getPlan();
  const done = plan.date === localDateKey() ? plan.done : [];

  list.innerHTML = Store.defaultPlan
    .slice(0, 3)
    .map(
      (item) => `
      <div class="plan-item ${done.includes(item.id) ? 'done' : ''}">
        <span class="check">✓</span>
        <div>
          <div class="t">${escapeHtml(item.title)}</div>
          <div class="m">${escapeHtml(item.detail)}</div>
        </div>
      </div>`
    )
    .join('');

  setText('home-plan-progress', progress.done + '/' + progress.total);
  const bar = document.getElementById('home-plan-bar');
  if (bar) bar.style.width = Math.round((progress.done / progress.total) * 100) + '%';

  setText('stat-done', progress.done);
  setText('stat-week', Store.weekCount());
}

/* ---------- 训练页 ---------- */
function initTraining() {
  const list = document.getElementById('plan-list');
  if (!list) return;
  renderPlan();
}

function renderPlan() {
  const list = document.getElementById('plan-list');
  const plan = Store.getPlan();
  const done = plan.date === localDateKey() ? plan.done : [];
  const progress = Store.planProgress();

  list.innerHTML = Store.defaultPlan
    .map(
      (item) => `
      <div class="plan-item ${done.includes(item.id) ? 'done' : ''}" data-plan-id="${item.id}">
        <span class="check">✓</span>
        <div>
          <div class="t">${escapeHtml(item.title)}</div>
          <div class="m">${escapeHtml(item.detail)}</div>
        </div>
      </div>`
    )
    .join('');

  list.querySelectorAll('[data-plan-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const wasDone = el.classList.contains('done');
      Store.togglePlan(el.dataset.planId);
      Store.addSession(localDateKey());
      renderPlan();
      toast(wasDone ? '已取消打卡' : '训练打卡成功！');
    });
  });

  setText('plan-done', progress.done);
  setText('plan-total', progress.total);
  const ring = document.getElementById('plan-ring');
  if (ring) ring.style.width = Math.round((progress.done / progress.total) * 100) + '%';

  renderWeek();
}

function renderWeek() {
  const grid = document.getElementById('week-grid');
  if (!grid) return;
  const sessions = Store.getSessions();
  const labels = ['一', '二', '三', '四', '五', '六', '日'];
  const now = new Date();
  const offset = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - offset);

  grid.innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = localDateKey(d);
    const isDone = sessions.includes(key);
    return `<div class="day ${isDone ? 'done' : ''}" data-day="${key}">
      <div class="d">周${labels[i]}</div>
      <div class="s">${d.getDate()}</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('[data-day]').forEach((el) => {
    el.addEventListener('click', () => {
      Store.addSession(el.dataset.day);
      renderWeek();
      toast('已标记 ' + el.dataset.day + ' 为训练日');
    });
  });
}

/* ---------- 工具 ---------- */
function localDateKey(d = new Date()) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}