// Auto-detect: same origin on Render, localhost in dev
const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : window.location.origin + '/api';
let currentItems = [];
let currentPage = 1;
const PER_PAGE = 20;

// ─── Tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'alerts') loadAlerts();
    if (btn.dataset.tab === 'tracking') loadTracking();
  });
});

// ─── Year selects ──────────────────────────────────────────────────────────
const nowYear = new Date().getFullYear();
['f-year-from', 'f-year-to'].forEach(id => {
  const sel = document.getElementById(id);
  for (let y = nowYear; y >= 1980; y--) {
    sel.innerHTML += `<option value="${y}">${y}</option>`;
  }
});

// ─── Server status ─────────────────────────────────────────────────────────
async function checkServerStatus() {
  try {
    const r = await fetch(`${API}/stats`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      document.querySelector('.status-dot').style.background = '#1e7a4a';
      document.getElementById('server-status').textContent = 'מחובר';
    } else throw new Error();
  } catch {
    document.querySelector('.status-dot').style.background = '#c0302f';
    document.getElementById('server-status').textContent = 'לא מחובר';
  }
}
checkServerStatus();
setInterval(checkServerStatus, 30000);

// ─── Search ────────────────────────────────────────────────────────────────
async function doSearch(page = 1) {
  currentPage = page;
  const params = getFilters();
  params.page = page;

  document.getElementById('results-area').innerHTML = '<div class="loading-spinner">טוען מודעות...</div>';
  document.getElementById('stats-row').style.display = 'none';

  try {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v)));
    const res = await fetch(`${API}/search?${qs}`);
    if (!res.ok) throw new Error(`שגיאת שרת: ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    currentItems = data.items;
    renderResults(data.items, data.total);
  } catch (err) {
    document.getElementById('results-area').innerHTML = `
      <div class="error-banner">
        <strong>שגיאה:</strong> ${err.message}<br>
        <small>ודא שהשרת רץ: <code>npm start</code></small>
      </div>`;
  }
}

function getFilters() {
  return {
    category:     document.getElementById('f-category').value,
    manufacturer: document.getElementById('f-manufacturer').value,
    model:        document.getElementById('f-model').value,
    licenseType:  document.getElementById('f-license').value,
    yearFrom:     document.getElementById('f-year-from').value,
    yearTo:       document.getElementById('f-year-to').value,
    priceMax:     document.getElementById('f-price').value,
    kmMax:        document.getElementById('f-km').value,
    sort:         document.getElementById('sort-sel').value,
  };
}

function renderResults(items, total) {
  const area = document.getElementById('results-area');

  if (!items.length) {
    area.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>לא נמצאו תוצאות לפי הסינון הנוכחי</p></div>';
    return;
  }

  // Sort client-side
  const sort = document.getElementById('sort-sel').value;
  const sorted = [...items];
  if (sort === 'price_asc')  sorted.sort((a,b) => (a.price||0) - (b.price||0));
  if (sort === 'price_desc') sorted.sort((a,b) => (b.price||0) - (a.price||0));
  if (sort === 'year_desc')  sorted.sort((a,b) => (b.year||0) - (a.year||0));
  if (sort === 'km_asc')     sorted.sort((a,b) => (a.km||0) - (b.km||0));

  // Stats
  const prices = sorted.map(i => i.price).filter(p => p > 0);
  document.getElementById('s-total').textContent = total || sorted.length;
  document.getElementById('s-avg').textContent  = prices.length ? '₪' + Math.round(prices.reduce((a,b)=>a+b,0)/prices.length).toLocaleString() : '—';
  document.getElementById('s-min').textContent  = prices.length ? '₪' + Math.min(...prices).toLocaleString() : '—';
  document.getElementById('s-max').textContent  = prices.length ? '₪' + Math.max(...prices).toLocaleString() : '—';
  document.getElementById('stats-row').style.display = 'grid';

  area.innerHTML = sorted.map(item => itemHTML(item)).join('');

  // Pagination
  const pages = Math.ceil((total || sorted.length) / PER_PAGE);
  const pag = document.getElementById('pagination');
  pag.innerHTML = '';
  if (pages > 1) {
    const maxPages = Math.min(pages, 10);
    for (let i = 1; i <= maxPages; i++) {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (i === currentPage ? ' active' : '');
      btn.textContent = i;
      btn.onclick = () => doSearch(i);
      pag.appendChild(btn);
    }
  }
}

function licenseFromCC(cc) {
  if (!cc) return '';
  if (cc > 500) return 'A';
  if (cc > 125) return 'A1';
  return 'A2';
}

function itemHTML(item) {
  const lic = licenseFromCC(item.engineCC);
  const licBadge = lic ? `<span class="badge badge-${lic}">${lic}</span>` : '';
  const newBadge = item.isNew ? '<span class="badge badge-new">חדש</span>' : '';
  const img = item.image
    ? `<img class="listing-thumb" src="${item.image}" alt="" loading="lazy" onerror="this.outerHTML='<div class=listing-thumb-ph>🏍</div>'">`
    : `<div class="listing-thumb-ph">${getCategoryIcon()}</div>`;

  return `<div class="listing-item" onclick="openItem('${item.link}', '${item.id}')">
    ${img}
    <div>
      <div class="listing-title">${newBadge}${item.title}</div>
      <div class="listing-meta">
        ${item.year ? `<span>📅 ${item.year}</span>` : ''}
        ${item.km  ? `<span>📍 ${item.km.toLocaleString()} ק"מ</span>` : ''}
        ${item.hand ? `<span>יד ${item.hand}</span>` : ''}
        ${item.engineCC ? `<span>${item.engineCC.toLocaleString()} סמ"ק</span>` : ''}
        ${item.city ? `<span>📌 ${item.city}</span>` : ''}
        ${licBadge}
      </div>
    </div>
    <div class="listing-right">
      <div class="listing-price">${item.price ? '₪' + item.price.toLocaleString() : 'מחיר לא צוין'}</div>
      <div class="listing-price-sub">לחץ לצפייה</div>
    </div>
  </div>`;
}

function getCategoryIcon() {
  const cat = document.getElementById('f-category').value;
  return cat === 'cars' ? '🚗' : cat === 'scooters' ? '🛵' : '🏍';
}

function openItem(link, id) {
  if (link) window.open(link, '_blank');
}

// ─── Clear & Export ────────────────────────────────────────────────────────
function clearFilters() {
  ['f-manufacturer','f-license','f-year-from','f-year-to','f-price','f-km','f-model'].forEach(id => {
    const el = document.getElementById(id);
    el.value = el.tagName === 'SELECT' ? '' : '';
  });
  document.getElementById('f-category').value = 'motorcycles';
  currentItems = [];
  document.getElementById('results-area').innerHTML = '<div class="empty-state"><div class="empty-icon">🏍</div><p>הגדר פרמטרים ולחץ על חיפוש</p></div>';
  document.getElementById('stats-row').style.display = 'none';
  document.getElementById('pagination').innerHTML = '';
}

function exportCSV() {
  if (!currentItems.length) { showToast('אין תוצאות לייצוא — חפש קודם'); return; }
  const headers = ['כותרת','יצרן','דגם','מחיר','שנה','ק"מ','יד','נפח מנוע','עיר','דרגת רישיון','קישור'];
  const rows = currentItems.map(i => [
    i.title, i.manufacturer, i.model, i.price||'', i.year||'', i.km||'', i.hand||'',
    i.engineCC||'', i.city||'', licenseFromCC(i.engineCC)||'', i.link||''
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `yad2_${document.getElementById('f-category').value}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  showToast('הקובץ יורד...');
}

// ─── Alerts ────────────────────────────────────────────────────────────────
function saveAsAlert() {
  const filters = getFilters();
  const parts = [];
  if (filters.manufacturer) parts.push(document.getElementById('f-manufacturer').selectedOptions[0]?.text || filters.manufacturer);
  if (filters.model)        parts.push(filters.model);
  if (filters.licenseType)  parts.push(`רישיון ${filters.licenseType}`);
  if (filters.yearFrom)     parts.push(`משנת ${filters.yearFrom}`);
  if (filters.priceMax)     parts.push(`עד ₪${parseInt(filters.priceMax).toLocaleString()}`);
  const label = parts.length ? parts.join(', ') : 'חיפוש כללי';

  const html = `
    <div class="modal-title">שמירת התראה</div>
    <div class="form-group">
      <label>שם ההתראה</label>
      <input type="text" id="alert-label" value="${label}">
    </div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:16px;">
      הכלי יבדוק כל 10 דקות ויסמן מודעות חדשות התואמות לחיפוש הנוכחי.
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn-primary" onclick="confirmSaveAlert(${JSON.stringify(filters).replace(/"/g,'&quot;')})">שמור התראה</button>
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
    </div>`;
  openModal(html);
}

async function confirmSaveAlert(filters) {
  const label = document.getElementById('alert-label').value;
  try {
    const res = await fetch(`${API}/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...filters, label }),
    });
    const data = await res.json();
    if (data.ok) { closeModal(); showToast('✓ ההתראה נשמרה!'); }
  } catch { showToast('שגיאה בשמירת ההתראה'); }
}

async function loadAlerts() {
  const el = document.getElementById('alerts-list');
  el.innerHTML = '<div class="loading-spinner">טוען...</div>';
  try {
    const res = await fetch(`${API}/alerts`);
    const data = await res.json();
    if (!data.alerts.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div><p>אין התראות פעילות.<br>שמור חיפוש כהתראה בלשונית החיפוש.</p></div>';
      return;
    }
    el.innerHTML = data.alerts.map(a => alertCardHTML(a)).join('');
  } catch {
    el.innerHTML = '<div class="error-banner">שגיאה בטעינת התראות. ודא שהשרת רץ.</div>';
  }
}

function alertCardHTML(a) {
  const params = [];
  if (a.manufacturer) params.push(`יצרן: ${a.manufacturer}`);
  if (a.model)        params.push(`דגם: ${a.model}`);
  if (a.licenseType)  params.push(`רישיון: ${a.licenseType}`);
  if (a.yearFrom)     params.push(`משנת: ${a.yearFrom}`);
  if (a.priceMax)     params.push(`עד: ₪${parseInt(a.priceMax).toLocaleString()}`);

  const newBadge = a.newCount > 0
    ? `<span class="alert-new-count">${a.newCount} חדשות</span>` : '';
  const lastChecked = a.lastChecked
    ? `בדיקה אחרונה: ${new Date(a.lastChecked).toLocaleString('he-IL')}`
    : 'טרם נבדק';

  return `<div class="alert-card">
    <div class="alert-header">
      <div>
        <div class="alert-label">🔔 ${a.label}</div>
        <div class="alert-params">${params.join(' · ') || 'כל הרכבים'}</div>
      </div>
      <button class="btn-danger" onclick="deleteAlert('${a.id}')">מחק</button>
    </div>
    <div class="alert-footer">
      ${newBadge}
      ${a.lastNewItems?.length ? `<button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showNewItems(${JSON.stringify(a.lastNewItems).replace(/"/g,'&quot;')})">צפה במודעות חדשות</button>` : ''}
      <span class="alert-meta">${lastChecked}</span>
    </div>
  </div>`;
}

async function deleteAlert(id) {
  await fetch(`${API}/alerts/${id}`, { method: 'DELETE' });
  loadAlerts();
  showToast('ההתראה נמחקה');
}

async function checkAllAlerts() {
  showToast('בודק התראות...');
  await fetch(`${API}/alerts/check`, { method: 'POST' });
  loadAlerts();
  showToast('✓ הבדיקה הושלמה');
}

function showNewItems(items) {
  const html = `
    <div class="modal-title">מודעות חדשות</div>
    ${items.map(item => itemHTML(item)).join('')}`;
  openModal(html);
}

// ─── Tracking ──────────────────────────────────────────────────────────────
async function loadTracking() {
  const el = document.getElementById('tracking-list');
  el.innerHTML = '<div class="loading-spinner">טוען...</div>';
  try {
    const res = await fetch(`${API}/history`);
    const data = await res.json();
    if (!data.items.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><p>בצע חיפושים כדי לצבור היסטוריית מחירים</p></div>';
      return;
    }
    // Show only items with price change or multiple data points
    const interesting = data.items.filter(i => i.priceCount >= 2).sort((a,b) => Math.abs(b.change) - Math.abs(a.change));
    const rest = data.items.filter(i => i.priceCount < 2);
    const all = [...interesting, ...rest].slice(0, 50);

    el.innerHTML = `
      <p style="font-size:13px;color:var(--text3);margin-bottom:14px;">עוקב אחר ${data.items.length} מודעות. ${interesting.length} עם שינוי מחיר.</p>
      ${all.map(item => trackingCardHTML(item)).join('')}`;
  } catch {
    el.innerHTML = '<div class="error-banner">שגיאה בטעינת היסטוריה. ודא שהשרת רץ.</div>';
  }
}

function trackingCardHTML(item) {
  const change = item.change;
  const changeEl = change === 0 ? '<span style="color:var(--text3);font-size:12px">ללא שינוי</span>'
    : change > 0 ? `<span class="change-up">▲ ₪${change.toLocaleString()}</span>`
    : `<span class="change-down">▼ ₪${Math.abs(change).toLocaleString()}</span>`;

  const firstP = item.firstPrice?.price || 0;
  const lastP = item.lastPrice?.price || 0;

  return `<div class="tracking-card" onclick="loadHistoryDetail('${item.id}', '${item.title.replace(/'/g, "\\'")}')">
    <div class="tracking-header">
      <div class="tracking-title">${item.title}</div>
      <div>${changeEl}</div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);">
      <span>מחיר ראשון: ${firstP ? '₪' + firstP.toLocaleString() : '—'}</span>
      <span>מחיר אחרון: ${lastP ? '₪' + lastP.toLocaleString() : '—'}</span>
      <span>${item.priceCount} נקודות נתון</span>
    </div>
  </div>`;
}

async function loadHistoryDetail(id, title) {
  const res = await fetch(`${API}/history/${id}`);
  const data = await res.json();
  if (!data.ok || !data.prices.length) return;

  const maxP = Math.max(...data.prices.map(p => p.price));
  const bars = data.prices.map(p => {
    const h = Math.round((p.price / maxP) * 100);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0">
      <div style="font-size:9px;color:var(--text3);writing-mode:vertical-rl;transform:rotate(180deg)">${p.date.slice(5)}</div>
      <div style="height:${h}px;width:100%;background:var(--accent-bg);border-top:2px solid var(--accent);border-radius:2px 2px 0 0;min-height:4px"></div>
      <div style="font-size:9px;color:var(--text2)">₪${Math.round(p.price/1000)}K</div>
    </div>`;
  }).join('');

  const html = `
    <div class="modal-title">${title}</div>
    <div style="display:flex;align-items:flex-end;height:140px;gap:4px;margin:16px 0 8px;">${bars}</div>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <tr style="color:var(--text3);font-size:11px">
        <th style="text-align:right;padding:4px 0">תאריך</th>
        <th style="text-align:right;padding:4px 0">מחיר</th>
        <th style="text-align:right;padding:4px 0">שינוי</th>
      </tr>
      ${data.prices.map((p, i) => {
        const prev = data.prices[i-1];
        const diff = prev ? p.price - prev.price : 0;
        const diffEl = diff === 0 ? '' : diff > 0
          ? `<span class="change-up">+${diff.toLocaleString()}</span>`
          : `<span class="change-down">${diff.toLocaleString()}</span>`;
        return `<tr style="border-top:1px solid var(--border)">
          <td style="padding:5px 0">${p.date}</td>
          <td style="padding:5px 0">₪${p.price.toLocaleString()}</td>
          <td style="padding:5px 0">${diffEl}</td>
        </tr>`;
      }).join('')}
    </table>`;
  openModal(html);
}

// ─── Modal ─────────────────────────────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal').style.display = 'flex';
}
function closeModal(e) {
  if (!e || e.target.classList.contains('modal-overlay')) {
    document.getElementById('modal').style.display = 'none';
  }
}

// ─── Toast ─────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ─── Enter key on inputs ───────────────────────────────────────────────────
document.querySelectorAll('.fg input').forEach(inp => {
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(1); });
});
