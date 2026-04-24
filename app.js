/* ══════════════════════════════════════════════
   今天吃什麼？— Food Spinner
   Phase 1：純前端，localStorage 儲存
══════════════════════════════════════════════ */

const STORAGE_KEY = 'food_spinner_v1';

// ── 篩選狀態 ─────────────────────────────────
const filters = { cuisine: '', type: '', time: '', price: '' };

// ── 轉盤狀態 ─────────────────────────────────
let spinning    = false;
let currentAngle = 0;
let currentResult = null;
let editingId   = null;

// ── 餐廳資料 ─────────────────────────────────
let restaurants = [];

function loadData()  { restaurants = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
function saveData()  { localStorage.setItem(STORAGE_KEY, JSON.stringify(restaurants)); }
function genId()     { return Math.random().toString(36).slice(2, 10); }

// ── 顏色 ─────────────────────────────────────
const COLORS = [
  '#FF6B35','#F7C59F','#EFEFD0','#004E89','#1A936F',
  '#C6B89E','#E84855','#3185FC','#EFCA08','#8EA604',
  '#F15946','#E2711D','#CC5803','#6B4226','#1B998B',
];

// ── 篩選 ─────────────────────────────────────
function getFiltered() {
  return restaurants.filter(r => {
    if (filters.cuisine && !r.cuisine?.includes(filters.cuisine)) return false;
    if (filters.type    && !r.type?.includes(filters.type))       return false;
    if (filters.time    && !r.time?.includes(filters.time))        return false;
    if (filters.price   && r.price !== filters.price)              return false;
    return true;
  });
}

function updateMatchCount() {
  const n = getFiltered().length;
  document.getElementById('match-count').textContent =
    `符合條件：${n} 家餐廳`;
  document.getElementById('spin-btn').disabled = n === 0;
  drawWheel(getFiltered());
}

// ── Filter Chips ──────────────────────────────
function initChips() {
  ['cuisine','type','time','price'].forEach(dim => {
    const id = `chips-${dim}`;
    document.getElementById(id)?.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById(id).querySelectorAll('.chip')
          .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filters[dim] = btn.dataset.val;
        updateMatchCount();
      });
    });
  });
}

// ── Canvas Wheel ──────────────────────────────
const canvas = document.getElementById('wheel-canvas');
const ctx    = canvas.getContext('2d');

// Retina support
(function scaleCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.width;
  canvas.width  = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);
})();

function drawWheel(items, rotationAngle = 0) {
  const size = 320;
  const cx   = size / 2;
  const cy   = size / 2;
  const r    = size / 2 - 4;

  ctx.clearRect(0, 0, size, size);

  if (!items.length) {
    // 空狀態
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#F3F4F6';
    ctx.fill();
    ctx.fillStyle = '#9CA3AF';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('新增餐廳開始轉！', cx, cy);
    return;
  }

  // 最多顯示 10 格
  const display = items.length > 10
    ? shuffle([...items]).slice(0, 10)
    : items;

  const slice = (Math.PI * 2) / display.length;

  display.forEach((item, i) => {
    const start = rotationAngle + i * slice - Math.PI / 2;
    const end   = start + slice;

    // 扇形
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 文字
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + slice / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${display.length > 6 ? '11' : '13'}px Inter, sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,.3)';
    ctx.shadowBlur  = 3;

    const name = item.name.length > 8 ? item.name.slice(0, 7) + '…' : item.name;
    ctx.fillText(name, r - 10, 0);
    ctx.restore();
  });

  // 中心圓
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.fillStyle = '#FF6B35';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🎰', cx, cy);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Spin ─────────────────────────────────────
function spinWheel() {
  if (spinning) return;
  const pool = getFiltered();
  if (!pool.length) return;

  spinning = true;
  document.getElementById('spin-btn').disabled = true;
  document.getElementById('spin-btn-text').textContent = '轉中…';

  // 隨機選出結果
  const winner = pool[Math.floor(Math.random() * pool.length)];

  // 決定轉幾圈
  const extraSpins  = 5 + Math.random() * 5;        // 5–10 圈
  const totalAngle  = extraSpins * Math.PI * 2;
  const duration    = 3000 + Math.random() * 1000;   // 3–4 秒
  const startTime   = performance.now();
  const startAngle  = currentAngle;

  // 用 easeOut 動畫
  function animate(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 4);  // easeOutQuart
    currentAngle   = startAngle + totalAngle * eased;

    // 重新用全部 pool（顯示最多 10 個）抽樣畫，角度持續旋轉
    const display = pool.length > 10 ? pool.slice(0, 10) : pool;
    drawWheel(display, currentAngle);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      spinning = false;
      document.getElementById('spin-btn').disabled = false;
      document.getElementById('spin-btn-text').textContent = '🎰 再轉一次！';
      showResult(winner);
    }
  }

  requestAnimationFrame(animate);
}

// ── Result Modal ─────────────────────────────
const CUISINE_EMOJI = {
  台式:'🥢', 日式:'🍱', 韓式:'🌶️', 中式:'🥟', 美式:'🍔',
  西式:'🍝', 東南亞:'🍜', 素食:'🥗', default:'🍽️',
};

function getEmoji(r) {
  const c = r.cuisine?.[0];
  return CUISINE_EMOJI[c] || CUISINE_EMOJI.default;
}

function showResult(r) {
  currentResult = r;
  document.getElementById('result-emoji').textContent = getEmoji(r);
  document.getElementById('result-name').textContent  = r.name;
  document.getElementById('result-addr').textContent  = r.address || '';
  document.getElementById('result-note').textContent  = r.note    || '';

  // Tags
  const allTags = [...(r.cuisine||[]), ...(r.type||[]), ...(r.time||[])];
  document.getElementById('result-tags').innerHTML =
    allTags.map(t => `<span class="r-tag">${t}</span>`).join('') +
    (r.price ? `<span class="r-tag" style="background:#F0FDF4;color:#16A34A">${r.price}</span>` : '');

  // Maps 按鈕：有連結就直接開，沒有就用名稱搜尋
  document.getElementById('btn-maps').style.display = '';

  document.getElementById('result-modal').classList.remove('hidden');
}

function closeResult() {
  document.getElementById('result-modal').classList.add('hidden');
}

function openMaps() {
  if (!currentResult) return;
  const url = currentResult.mapsUrl
    || `https://www.google.com/maps/search/${encodeURIComponent(currentResult.name)}`;
  window.open(url, '_blank');
}

// ── List Screen ───────────────────────────────
function renderList() {
  const list = document.getElementById('restaurant-list');
  document.getElementById('list-count').textContent = restaurants.length;

  if (!restaurants.length) {
    list.innerHTML = `<div class="empty-list">還沒有餐廳<br>點下方「新增餐廳」加入你的最愛 🍜</div>`;
    return;
  }

  list.innerHTML = restaurants.map(r => {
    const allTags = [...(r.cuisine||[]), ...(r.type||[])].slice(0, 4);
    return `
      <div class="r-card" onclick="openEditModal('${r.id}')">
        <div class="r-emoji">${getEmoji(r)}</div>
        <div class="r-info">
          <div class="r-name">${esc(r.name)}</div>
          <div class="r-tags">
            ${allTags.map(t => `<span class="r-tag">${esc(t)}</span>`).join('')}
          </div>
        </div>
        <div class="r-price">${r.price || ''}</div>
      </div>`;
  }).join('');
}

// ── Edit Modal ────────────────────────────────
function openAddModal() {
  editingId = null;
  document.getElementById('edit-modal-title').textContent = '新增餐廳';
  document.getElementById('r-name').value  = '';
  document.getElementById('r-addr').value  = '';
  document.getElementById('r-maps').value  = '';
  document.getElementById('r-note').value  = '';
  document.getElementById('r-price').value = '';
  document.querySelectorAll('#r-cuisine input, #r-type input, #r-time input')
    .forEach(cb => cb.checked = false);
  document.getElementById('delete-r-btn').style.display = 'none';
  document.getElementById('edit-err').style.display     = 'none';
  document.getElementById('edit-modal').classList.remove('hidden');
}

function openEditModal(id) {
  const r = restaurants.find(x => x.id === id);
  if (!r) return;
  editingId = id;
  document.getElementById('edit-modal-title').textContent = '編輯餐廳';
  document.getElementById('r-name').value  = r.name;
  document.getElementById('r-addr').value  = r.address || '';
  document.getElementById('r-maps').value  = r.mapsUrl || '';
  document.getElementById('r-note').value  = r.note    || '';
  document.getElementById('r-price').value = r.price   || '';

  ['cuisine','type','time'].forEach(dim => {
    document.querySelectorAll(`#r-${dim} input`).forEach(cb => {
      cb.checked = (r[dim] || []).includes(cb.value);
    });
  });

  document.getElementById('delete-r-btn').style.display = 'inline-flex';
  document.getElementById('edit-err').style.display     = 'none';
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

function getChecked(groupId) {
  return [...document.querySelectorAll(`#${groupId} input:checked`)].map(cb => cb.value);
}

function saveRestaurant() {
  const name = document.getElementById('r-name').value.trim();
  const err  = document.getElementById('edit-err');
  if (!name) { err.textContent = '請輸入餐廳名稱'; err.style.display = 'block'; return; }
  err.style.display = 'none';

  const data = {
    name,
    cuisine: getChecked('r-cuisine'),
    type:    getChecked('r-type'),
    time:    getChecked('r-time'),
    price:   document.getElementById('r-price').value,
    address: document.getElementById('r-addr').value.trim(),
    mapsUrl: document.getElementById('r-maps').value.trim(),
    note:    document.getElementById('r-note').value.trim(),
  };

  if (editingId) {
    const idx = restaurants.findIndex(r => r.id === editingId);
    if (idx !== -1) restaurants[idx] = { ...restaurants[idx], ...data };
  } else {
    restaurants.unshift({ ...data, id: genId() });
  }

  saveData();
  closeEditModal();
  renderList();
  updateMatchCount();
}

function deleteRestaurant() {
  if (!editingId) return;
  if (!confirm('確定要刪除這家餐廳嗎？')) return;
  restaurants = restaurants.filter(r => r.id !== editingId);
  saveData();
  closeEditModal();
  renderList();
  updateMatchCount();
}

// ── Import / Export ───────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(restaurants, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'my_restaurants.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!Array.isArray(data)) throw new Error();
      // 合併，不重複
      const existIds = new Set(restaurants.map(r => r.id));
      const newOnes  = data.filter(r => !existIds.has(r.id)).map(r => ({ ...r, id: r.id || genId() }));
      restaurants = [...newOnes, ...restaurants];
      saveData();
      renderList();
      updateMatchCount();
      alert(`匯入 ${newOnes.length} 家餐廳！`);
    } catch {
      alert('檔案格式錯誤，請使用正確的 JSON 格式');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ── Screen Switch ─────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'screen-list') renderList();
  window.scrollTo(0, 0);
}

// ── Click outside modal to close ─────────────
document.getElementById('result-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('result-modal')) closeResult();
});
document.getElementById('edit-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-modal')) closeEditModal();
});

// ── Utils ─────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── 預設示範資料 ─────────────────────────────
const DEMO = [
  { name:'一蘭拉麵',   cuisine:['日式'], type:['麵'],    time:['午餐','晚餐'], price:'$$',  address:'台北市大安區', mapsUrl:'', note:'必點叉燒拉麵' },
  { name:'麥當勞',     cuisine:['美式'], type:['炸物'],  time:['早餐','午餐','宵夜'], price:'$', address:'', mapsUrl:'', note:'' },
  { name:'鼎泰豐',     cuisine:['台式'], type:['小吃'],  time:['午餐','晚餐'], price:'$$$', address:'台北市大安區', mapsUrl:'', note:'小籠包必點' },
  { name:'欣葉台菜',   cuisine:['台式'], type:['飯'],    time:['午餐','晚餐'], price:'$$$', address:'', mapsUrl:'', note:'' },
  { name:'涓豆腐',     cuisine:['韓式'], type:['火鍋'],  time:['午餐','晚餐'], price:'$$',  address:'', mapsUrl:'', note:'韓式豆腐鍋' },
  { name:'路易莎',     cuisine:['西式'], type:['輕食'],  time:['早餐','早午餐','下午茶'], price:'$', address:'', mapsUrl:'', note:'' },
  { name:'吃飽便當',   cuisine:['台式'], type:['便當'],  time:['午餐'],        price:'$',   address:'', mapsUrl:'', note:'快速又划算' },
  { name:'火鍋吃到飽', cuisine:['台式'], type:['火鍋'],  time:['晚餐'],        price:'$$$', address:'', mapsUrl:'', note:'' },
];

// ── PWA Service Worker ────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── Share Target 接收（從 Google Maps 分享進來）──
function handleIncomingShare() {
  const params = new URLSearchParams(window.location.search);
  const sharedTitle = params.get('title') || '';
  const sharedText  = params.get('text')  || '';
  const sharedUrl   = params.get('url')   || '';

  // 沒有收到分享內容就跳過
  if (!sharedTitle && !sharedUrl && !sharedText) return;

  // 清除 URL 參數（避免重整後重複觸發）
  window.history.replaceState({}, '', window.location.pathname);

  // 嘗試從分享文字萃取餐廳名稱
  // Google Maps 分享格式通常：「餐廳名稱\n地址\nhttps://maps.app.goo.gl/xxx」
  let name    = sharedTitle;
  let mapsUrl = sharedUrl;

  if (!mapsUrl && sharedText) {
    const urlMatch = sharedText.match(/https?:\/\/\S+/);
    if (urlMatch) mapsUrl = urlMatch[0];
  }
  if (!name && sharedText) {
    name = sharedText.split('\n')[0].trim();
  }

  // 開啟新增 modal 並預填
  openAddModal();
  if (name)    document.getElementById('r-name').value = name;
  if (mapsUrl) document.getElementById('r-maps').value = mapsUrl;

  // 提示用戶
  const hint = document.createElement('div');
  hint.style.cssText = `
    position:fixed; top:70px; left:50%; transform:translateX(-50%);
    background:#16A34A; color:#fff; padding:10px 20px;
    border-radius:99px; font-size:.85rem; font-weight:700;
    z-index:9999; white-space:nowrap; box-shadow:0 4px 16px rgba(0,0,0,.2);
  `;
  hint.textContent = `✅ 已從 Google Maps 匯入「${name || '餐廳'}」`;
  document.body.appendChild(hint);
  setTimeout(() => hint.remove(), 3000);
}

// ── Init ─────────────────────────────────────
loadData();
if (!restaurants.length) {
  restaurants = DEMO.map(r => ({ ...r, id: genId() }));
  saveData();
}
initChips();
updateMatchCount();
handleIncomingShare();
