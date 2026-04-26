/* ══════════════════════════════════════════════
   今天吃什麼？— Food Spinner v2
   - 多選篩選（OR 同維度，AND 跨維度）
   - 冷卻機制（排除最近 3 次吃過的）
   - 多人加權模式（票數越多，轉盤佔比越大）
══════════════════════════════════════════════ */

const STORAGE_KEY   = 'food_spinner_v1';
const RECENT_KEY    = 'food_recent_picks';
const PERSONS_KEY   = 'food_persons';
const COOLDOWN_KEY  = 'food_cooldown';
const MULTIMODE_KEY = 'food_multimode';

// ── 篩選狀態（cuisine/type/time 多選，price 單選）──
const filters = {
  cuisine: new Set(),
  type:    new Set(),
  time:    new Set(),
  price:   ''
};

// ── 轉盤狀態 ─────────────────────────────────
let spinning      = false;
let currentAngle  = 0;
let currentResult = null;
let editingId     = null;

// ── 餐廳資料 ─────────────────────────────────
let restaurants = [];

// ── 冷卻機制 ─────────────────────────────────
let cooldownEnabled = false;
let recentPicks     = [];   // 最近吃過的餐廳 ID，最多 3 筆

// ── 多人模式 ─────────────────────────────────
let multiPersonMode = false;
let persons         = [];   // [{id, name, votes: Set<restaurantId>}]
let editingPersonId = null;

// ── 資料讀寫 ─────────────────────────────────
function loadData() {
  restaurants     = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  recentPicks     = JSON.parse(localStorage.getItem(RECENT_KEY)  || '[]');
  cooldownEnabled = localStorage.getItem(COOLDOWN_KEY)  === '1';
  multiPersonMode = localStorage.getItem(MULTIMODE_KEY) === '1';
  const raw = JSON.parse(localStorage.getItem(PERSONS_KEY) || '[]');
  persons = raw.map(p => ({ ...p, votes: new Set(p.votes || []) }));
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(restaurants));
}

function savePersons() {
  localStorage.setItem(PERSONS_KEY,
    JSON.stringify(persons.map(p => ({ ...p, votes: [...p.votes] }))));
}

function genId() { return Math.random().toString(36).slice(2, 10); }

// ── 顏色 ─────────────────────────────────────
const COLORS = [
  '#FF6B35','#F7C59F','#EFEFD0','#004E89','#1A936F',
  '#C6B89E','#E84855','#3185FC','#EFCA08','#8EA604',
  '#F15946','#E2711D','#CC5803','#6B4226','#1B998B',
];

// ── 篩選邏輯 ─────────────────────────────────
// cuisine / type / time：OR 同維度；AND 跨維度
// price：單選完全匹配
function getBaseFiltered() {
  return restaurants.filter(r => {
    if (filters.cuisine.size > 0 && !r.cuisine?.some(c => filters.cuisine.has(c))) return false;
    if (filters.type.size    > 0 && !r.type   ?.some(t => filters.type.has(t)))    return false;
    if (filters.time.size    > 0 && !r.time   ?.some(t => filters.time.has(t)))    return false;
    if (filters.price && r.price !== filters.price) return false;
    return true;
  });
}

function getFiltered() {
  const base = getBaseFiltered();

  // 冷卻：排除最近吃過的（若全排完則清空記錄後回退）
  if (cooldownEnabled && recentPicks.length > 0) {
    const cooled = base.filter(r => !recentPicks.includes(r.id));
    if (cooled.length > 0) return cooled;
    clearRecentPicks();   // 全部吃過了，重置
  }

  return base;
}

// ── 加權池（多人模式）─────────────────────────
// 回傳 [{restaurant, weight}]
function getWeightedPool() {
  const filtered = getFiltered();

  if (!multiPersonMode || persons.length === 0) {
    return filtered.map(r => ({ restaurant: r, weight: 1 }));
  }

  // 有人投票的餐廳優先；全無投票時回退到全部
  const withVotes = filtered
    .map(r => ({
      restaurant: r,
      weight: persons.filter(p => p.votes.has(r.id)).length,
    }))
    .filter(w => w.weight > 0);

  if (withVotes.length > 0) return withVotes;

  // 還沒有人投票 → 全部等權重
  return filtered.map(r => ({ restaurant: r, weight: 1 }));
}

// ── 加權隨機選取 ─────────────────────────────
function weightedRandom(pool) {
  const total = pool.reduce((s, i) => s + i.weight, 0);
  let rand = Math.random() * total;
  for (const item of pool) {
    rand -= item.weight;
    if (rand <= 0) return item.restaurant;
  }
  return pool[pool.length - 1].restaurant;
}

// ── 更新符合數量與轉盤 ─────────────────────────
function updateMatchCount() {
  const filtered = getFiltered();
  const n = filtered.length;

  // 計算被冷卻排除了幾家
  let label = `符合條件：${n} 家`;
  if (cooldownEnabled && recentPicks.length > 0) {
    const base     = getBaseFiltered();
    const excluded = base.filter(r => recentPicks.includes(r.id)).length;
    if (excluded > 0) label += `（排除 ${excluded} 家最近吃過）`;
  }

  document.getElementById('match-count').textContent = label;
  document.getElementById('spin-btn').disabled = n === 0;

  const pool = getWeightedPool();
  drawWheel(pool.length > 10 ? pool.slice(0, 10) : pool);
}

// ── Chips 初始化（多選 + 單選）────────────────
function initChips() {
  // cuisine / type / time：多選 toggle
  ['cuisine', 'type', 'time'].forEach(dim => {
    const container = document.getElementById(`chips-${dim}`);
    if (!container) return;
    container.querySelectorAll('.chip').forEach(btn => {
      const val = btn.dataset.val;
      btn.addEventListener('click', () => {
        if (val === '') {
          filters[dim].clear();   // "全部" = 清除此維度
        } else {
          filters[dim].has(val) ? filters[dim].delete(val) : filters[dim].add(val);
        }
        updateChipUI(dim);
        updateMatchCount();
      });
    });
  });

  // price：單選（保留原邏輯）
  const priceContainer = document.getElementById('chips-price');
  priceContainer?.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      priceContainer.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filters.price = btn.dataset.val;
      updateMatchCount();
    });
  });
}

function updateChipUI(dim) {
  const container = document.getElementById(`chips-${dim}`);
  if (!container) return;
  container.querySelectorAll('.chip').forEach(btn => {
    const val = btn.dataset.val;
    if (val === '') {
      btn.classList.toggle('active', filters[dim].size === 0);
    } else {
      btn.classList.toggle('active', filters[dim].has(val));
    }
  });
}

// ── Canvas Wheel ──────────────────────────────
const canvas = document.getElementById('wheel-canvas');
const ctx    = canvas.getContext('2d');

(function scaleCanvas() {
  const dpr  = window.devicePixelRatio || 1;
  const size = canvas.width;   // 320 from HTML attribute
  canvas.width  = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);
})();

// weightedItems: [{restaurant, weight}]
function drawWheel(weightedItems, rotationAngle = 0) {
  const size = 320;
  const cx   = size / 2;
  const cy   = size / 2;
  const r    = size / 2 - 4;

  ctx.clearRect(0, 0, size, size);

  if (!weightedItems.length) {
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

  const totalWeight = weightedItems.reduce((s, i) => s + i.weight, 0);
  let angle = rotationAngle - Math.PI / 2;

  weightedItems.forEach((item, i) => {
    const slice = (item.weight / totalWeight) * Math.PI * 2;
    const end   = angle + slice;

    // 扇形
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, end);
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 文字
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + slice / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${weightedItems.length > 6 ? '11' : '13'}px Inter, sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,.3)';
    ctx.shadowBlur  = 3;
    const name = item.restaurant.name.length > 8
      ? item.restaurant.name.slice(0, 7) + '…'
      : item.restaurant.name;
    ctx.fillText(name, r - 10, 0);
    ctx.restore();

    angle = end;
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
  const pool = getWeightedPool();
  if (!pool.length) return;

  spinning = true;
  document.getElementById('spin-btn').disabled = true;
  document.getElementById('spin-btn-text').textContent = '轉中…';

  const winner     = weightedRandom(pool);
  const extraSpins = 5 + Math.random() * 5;
  const totalAngle = extraSpins * Math.PI * 2;
  const duration   = 3000 + Math.random() * 1000;
  const startTime  = performance.now();
  const startAngle = currentAngle;
  const display    = pool.length > 10 ? pool.slice(0, 10) : pool;

  function animate(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 4);
    currentAngle   = startAngle + totalAngle * eased;

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
  return CUISINE_EMOJI[r.cuisine?.[0]] || CUISINE_EMOJI.default;
}

function showResult(r) {
  currentResult = r;

  // 冷卻：記錄此次結果
  if (cooldownEnabled) {
    recentPicks = [r.id, ...recentPicks.filter(id => id !== r.id)].slice(0, 3);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentPicks));
    updateMatchCount();
  }

  document.getElementById('result-emoji').textContent = getEmoji(r);
  document.getElementById('result-name').textContent  = r.name;
  document.getElementById('result-addr').textContent  = r.address || '';
  document.getElementById('result-note').textContent  = r.note    || '';

  const allTags = [...(r.cuisine||[]), ...(r.type||[]), ...(r.time||[])];
  document.getElementById('result-tags').innerHTML =
    allTags.map(t => `<span class="r-tag">${t}</span>`).join('') +
    (r.price ? `<span class="r-tag" style="background:#F0FDF4;color:#16A34A">${r.price}</span>` : '');

  // 多人模式：顯示投票資訊
  const voteEl = document.getElementById('result-votes');
  if (voteEl) {
    if (multiPersonMode && persons.length > 0) {
      const voters = persons.filter(p => p.votes.has(r.id)).map(p => p.name);
      voteEl.textContent = voters.length
        ? `👥 ${voters.length} 人想吃：${voters.join('、')}`
        : '🎲 無人投票（隨機選出）';
      voteEl.style.display = '';
    } else {
      voteEl.style.display = 'none';
    }
  }

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

// ── 冷卻機制 ─────────────────────────────────
function toggleCooldown(enabled) {
  cooldownEnabled = enabled;
  localStorage.setItem(COOLDOWN_KEY, enabled ? '1' : '0');
  updateMatchCount();
  // 重新渲染清單以更新「最近吃過」標記
  if (document.getElementById('screen-list').classList.contains('active')) renderList();
}

function clearRecentPicks() {
  recentPicks = [];
  localStorage.setItem(RECENT_KEY, JSON.stringify(recentPicks));
}

// ── 多人模式 ─────────────────────────────────
function toggleMultiMode() {
  multiPersonMode = !multiPersonMode;
  localStorage.setItem(MULTIMODE_KEY, multiPersonMode ? '1' : '0');
  document.getElementById('multi-panel').classList.toggle('hidden', !multiPersonMode);
  document.getElementById('multi-btn').classList.toggle('active', multiPersonMode);
  if (multiPersonMode) renderPersons();
  updateMatchCount();
}

function showAddPersonRow() {
  document.getElementById('add-person-row').classList.remove('hidden');
  document.getElementById('add-person-btn').classList.add('hidden');
  document.getElementById('new-person-name').value = '';
  document.getElementById('new-person-name').focus();
}

function cancelAddPerson() {
  document.getElementById('add-person-row').classList.add('hidden');
  document.getElementById('add-person-btn').classList.remove('hidden');
}

function confirmAddPerson() {
  const name = document.getElementById('new-person-name').value.trim();
  if (!name) return;
  persons.push({ id: genId(), name, votes: new Set() });
  savePersons();
  cancelAddPerson();
  renderPersons();
  updateMatchCount();
}

function removePerson(id) {
  persons = persons.filter(p => p.id !== id);
  savePersons();
  renderPersons();
  updateMatchCount();
}

function renderPersons() {
  const list = document.getElementById('persons-list');
  if (!persons.length) {
    list.innerHTML = '<p class="persons-empty">加入成員，大家一起投票吧！</p>';
    return;
  }
  list.innerHTML = persons.map(p => `
    <div class="person-row">
      <div class="person-left">
        <span class="person-avatar">${esc(p.name[0])}</span>
        <span class="person-name">${esc(p.name)}</span>
        ${p.votes.size > 0 ? `<span class="person-votes-badge">${p.votes.size} 票</span>` : ''}
      </div>
      <div class="person-right">
        <button class="person-pick-btn" onclick="openPersonPick('${p.id}')">選餐廳</button>
        <button class="person-del-btn" onclick="removePerson('${p.id}')">✕</button>
      </div>
    </div>
  `).join('');
}

// ── 多人選餐廳 Modal ─────────────────────────
function openPersonPick(personId) {
  editingPersonId = personId;
  const person = persons.find(p => p.id === personId);
  if (!person) return;

  document.getElementById('person-pick-title').textContent = `${person.name} 想吃什麼？`;

  const body = document.getElementById('person-pick-body');
  if (!restaurants.length) {
    body.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:20px 0">還沒有餐廳，先去新增吧！</p>';
  } else {
    body.innerHTML = restaurants.map(r => {
      const checked = person.votes.has(r.id);
      return `
        <label class="pick-item${checked ? ' checked' : ''}">
          <span class="pick-emoji">${getEmoji(r)}</span>
          <span class="pick-name">${esc(r.name)}</span>
          <input type="checkbox" value="${r.id}" ${checked ? 'checked' : ''}
            onchange="togglePersonVote('${personId}','${r.id}',this.checked,this.closest('label'))">
        </label>`;
    }).join('');
  }

  document.getElementById('person-pick-modal').classList.remove('hidden');
}

function togglePersonVote(personId, restaurantId, checked, labelEl) {
  const person = persons.find(p => p.id === personId);
  if (!person) return;
  if (checked) person.votes.add(restaurantId);
  else person.votes.delete(restaurantId);
  labelEl?.classList.toggle('checked', checked);
  savePersons();
  renderPersons();
  updateMatchCount();
}

function closePersonPick() {
  document.getElementById('person-pick-modal').classList.add('hidden');
  editingPersonId = null;
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
    const allTags  = [...(r.cuisine||[]), ...(r.type||[])].slice(0, 4);
    const isRecent = cooldownEnabled && recentPicks.includes(r.id);
    return `
      <div class="r-card" onclick="openEditModal('${r.id}')">
        <div class="r-emoji">${getEmoji(r)}</div>
        <div class="r-info">
          <div class="r-name">
            ${esc(r.name)}
            ${isRecent ? '<span class="recent-badge">最近吃過</span>' : ''}
          </div>
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
  // 同步清理多人投票與冷卻記錄
  persons.forEach(p => p.votes.delete(editingId));
  recentPicks = recentPicks.filter(id => id !== editingId);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recentPicks));
  restaurants = restaurants.filter(r => r.id !== editingId);
  saveData();
  savePersons();
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
      const existIds = new Set(restaurants.map(r => r.id));
      const newOnes  = data
        .filter(r => !existIds.has(r.id))
        .map(r => ({ ...r, id: r.id || genId() }));
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
['result-modal','edit-modal','person-pick-modal'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', e => {
    if (e.target.id === id) {
      if (id === 'result-modal')      closeResult();
      if (id === 'edit-modal')        closeEditModal();
      if (id === 'person-pick-modal') closePersonPick();
    }
  });
});

// Enter key for add-person input
document.getElementById('new-person-name')?.addEventListener('keydown', e => {
  if (e.key === 'Enter')  confirmAddPerson();
  if (e.key === 'Escape') cancelAddPerson();
});

// ── Utils ─────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── 預設示範資料 ─────────────────────────────
const DEMO = [
  { name:'一蘭拉麵',   cuisine:['日式'], type:['麵'],    time:['午餐','晚餐'],          price:'$$',  address:'台北市大安區', mapsUrl:'', note:'必點叉燒拉麵' },
  { name:'麥當勞',     cuisine:['美式'], type:['炸物'],  time:['早餐','午餐','宵夜'],    price:'$',   address:'', mapsUrl:'', note:'' },
  { name:'鼎泰豐',     cuisine:['台式'], type:['小吃'],  time:['午餐','晚餐'],          price:'$$$', address:'台北市大安區', mapsUrl:'', note:'小籠包必點' },
  { name:'欣葉台菜',   cuisine:['台式'], type:['飯'],    time:['午餐','晚餐'],          price:'$$$', address:'', mapsUrl:'', note:'' },
  { name:'涓豆腐',     cuisine:['韓式'], type:['火鍋'],  time:['午餐','晚餐'],          price:'$$',  address:'', mapsUrl:'', note:'韓式豆腐鍋' },
  { name:'路易莎',     cuisine:['西式'], type:['輕食'],  time:['早餐','早午餐','下午茶'],price:'$',   address:'', mapsUrl:'', note:'' },
  { name:'吃飽便當',   cuisine:['台式'], type:['便當'],  time:['午餐'],                 price:'$',   address:'', mapsUrl:'', note:'快速又划算' },
  { name:'火鍋吃到飽', cuisine:['台式'], type:['火鍋'],  time:['晚餐'],                 price:'$$$', address:'', mapsUrl:'', note:'' },
];

// ── PWA Service Worker ────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── Share Target 接收（從 Google Maps 分享）──
function handleIncomingShare() {
  const params = new URLSearchParams(window.location.search);
  const sharedTitle = params.get('title') || '';
  const sharedText  = params.get('text')  || '';
  const sharedUrl   = params.get('url')   || '';

  if (!sharedTitle && !sharedUrl && !sharedText) return;

  window.history.replaceState({}, '', window.location.pathname);

  let name    = sharedTitle;
  let mapsUrl = sharedUrl;

  if (!mapsUrl && sharedText) {
    const m = sharedText.match(/https?:\/\/\S+/);
    if (m) mapsUrl = m[0];
  }
  if (!name && sharedText) {
    name = sharedText.split('\n')[0].trim();
  }

  openAddModal();
  if (name)    document.getElementById('r-name').value = name;
  if (mapsUrl) document.getElementById('r-maps').value = mapsUrl;

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

// 恢復冷卻開關狀態
const cooldownCheck = document.getElementById('cooldown-check');
if (cooldownCheck) cooldownCheck.checked = cooldownEnabled;

// 恢復多人模式狀態
if (multiPersonMode) {
  document.getElementById('multi-panel').classList.remove('hidden');
  document.getElementById('multi-btn').classList.add('active');
  renderPersons();
}

updateMatchCount();
handleIncomingShare();
