// The dashboard: five pages over backend.mjs (window.api.call). Vietnamese UI; the explorers keep their Japanese names.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const call = (name, ...args) => window.api.call(name, ...args);
const toast = text => { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3500); };
const safe = fn => async (...a) => { try { await fn(...a); } catch (e) { toast('⚠ ' + (e.message ?? e).replace(/^Error invoking remote method 'call': Error: /, '')); } };

const TASKS = { garden: 'Làm vườn', fertilize: 'Bón phân', orchard: 'Hái quả', animals: 'Chăm vật nuôi', market: 'Bán hàng', cook: 'Nấu ăn', expand: 'Mở luống',
  fight: 'Đánh quái', gather: 'Săn nguyên liệu', challenge: 'Thử thách nhanh', boss: 'Săn boss', travel: 'Bay sang hành tinh', mine: 'Đào mỏ', fishing: 'Câu cá', harpoon: 'Phóng lao',
  shop: 'Mua sắm', crystal: 'Nâng pha lê', gearBuy: 'Mua vũ khí', forge: 'Rèn vũ khí', craft: 'Chế tạo', wardrobe: 'Thay đồ', sightsee: 'Dạo chơi', tidy: 'Dọn kho', browse: 'Ngắm nghía', home: 'Về nhà', rescue: 'Cứu bạn', attic: 'Phòng kỷ niệm',
  penUpgrade: 'Nâng chuồng', penHelper: 'Trợ thủ chuồng trại', dish: 'Nấu món đặc biệt', snack: 'Ăn món hiệu ứng', decorate: 'Trang trí làng', bolt: 'Robot Bolt', lava: 'Hang dung nham', dragon: 'Đánh rồng', gifts: 'Mở quà Đồ chơi', reroll: 'Đổi nhiệm vụ ngày', dressFriend: 'Mặc đồ cho bạn', visitFriend: 'Thăm bạn', disguise: 'Cải trang' };
const STYLE = { fishing: 'Câu cá', hunt: 'Săn quái', boss: 'Đánh boss', space: 'Du hành vũ trụ', titan: 'Đánh Titan', story: 'Cốt truyện', village: 'Xây làng', forge: 'Rèn đồ', quests: 'Nhiệm vụ', helpers: 'Trợ thủ & bạn bè', events: 'Sự kiện hành tinh' };
const DAYS = [[1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7'], [0, 'CN']];
const ago = ms => { if (!ms) return '—'; const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };
let page = 'overview', colors = {}, themes = {}, scenarios = [];

document.querySelectorAll('.nav button').forEach(b => b.onclick = () => { page = b.dataset.page; document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('active', x === b)); document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page)); render(); });

// ---- sidebar load --------------------------------------------------------------------------------------------
const bar = (label, v, hot = 70, over = 88) => `<div>${label} <b>${v ?? '—'}%</b><div class="bar ${v > over ? 'over' : v > hot ? 'hot' : ''}"><i style="width:${Math.min(100, v ?? 0)}%"></i></div></div>`;
async function sidebar() {
  const l = await call('load');
  $('#nav-load').innerHTML = `${bar('CPU', l.cpu)}${bar('RAM', l.ram)}${l.gpu ? bar('Card đồ hoạ', l.gpu.gpu) + bar('NVENC', l.gpu.enc) : ''}
    <div>Đang chạy <b>${l.running}/${l.capacity}</b> acc${l.waiting.length ? ` · chờ ${l.waiting.length}` : ''}</div><div>Ổ trống <b>${l.disk ?? '—'} GB</b></div>`;
}

// ---- 1. overview --------------------------------------------------------------------------------------------
/** Card size for the live view, remembered on this PC: small fits 4–5 games a row. */
let cardSize = (() => { try { return localStorage.getItem('zg-card-size') || 's'; } catch { return 's'; } })();
async function overview() {
  const [live, msgs] = await Promise.all([call('live'), call('messages')]);
  const cards = live.map(r => `<div class="card">
      <div class="shot" style="${r.preview ? `background-image:url('${r.preview}')` : ''}">${r.preview ? '' : 'Đang mở game…'}</div>
      <div class="body">
        <div class="row"><b><span class="dot" style="background:${r.color}"></span>${esc(r.name)}</b><span class="muted small">${esc(r.id)}</span><span class="chip on" style="margin-left:auto">Clip ${r.clip ? `${r.clip.index}/${r.clip.of}` : `${r.done}/${r.total}`}</span></div>
        <div class="small clip-title">${r.clip ? esc(r.clip.title.replace(/^【[^】]*】/, '')) : 'Chuẩn bị clip…'}</div>
        <div class="small muted">Đang: <b>${esc(TASKS[r.task] ?? r.task ?? '—')}</b>${r.clip?.started ? ` · clip chạy ${Math.round((Date.now() - Date.parse(r.clip.started)) / 60000)} phút` : ''}</div>
        <div class="mono muted small tail">${esc(r.tail.slice(-2).join('\n'))}</div>
        <div class="row"><button class="btn small danger" data-stop="${r.id}">Dừng</button><button class="btn small" data-show="${r.id}" data-on="${r.show ? 1 : 0}">${r.show ? 'Ẩn cửa sổ' : 'Hiện cửa sổ'}</button><span class="small muted hint">(áp dụng từ clip sau)</span></div>
      </div></div>`).join('');
  $('#page-overview').innerHTML = `<div class="row"><div><h1>Tổng quan</h1><p class="sub">Các acc đang chơi và quay. Ảnh cập nhật mỗi vài giây.</p></div>
      <div class="row" style="margin-left:auto;gap:4px"><span class="small muted">Cỡ ô:</span>${[['s', 'Nhỏ'], ['m', 'Vừa'], ['l', 'Lớn']].map(([k, v]) => `<button class="btn small ${cardSize === k ? 'primary' : ''}" data-size="${k}">${v}</button>`).join('')}</div></div>
    ${live.length ? `<div class="cards size-${cardSize}">${cards}</div>` : `<div class="empty">Chưa có acc nào đang chạy.<br><br><button class="btn primary" id="run-scheduled">▶ Chạy ngay các acc đã bật lịch</button></div>`}
    <h2>Hoạt động gần đây</h2><div class="panel log small">${msgs.map(m => `<div><span class="muted">${new Date(m.at).toLocaleTimeString('vi-VN')}</span> ${esc(m.text)}</div>`).join('') || '<span class="muted">Chưa có.</span>'}</div>`;
  document.querySelectorAll('[data-size]').forEach(b => b.onclick = () => { cardSize = b.dataset.size; try { localStorage.setItem('zg-card-size', cardSize); } catch {} render(); });
  document.querySelectorAll('[data-stop]').forEach(b => b.onclick = safe(async () => { await call('stop', b.dataset.stop); toast('Đã dừng ' + b.dataset.stop); render(); }));
  document.querySelectorAll('[data-show]').forEach(b => b.onclick = safe(async () => { await call('editAccount', b.dataset.show, { show: b.dataset.on !== '1' }); render(); }));
  const run = $('#run-scheduled'); if (run) run.onclick = safe(async () => { const c = await call('control'); const ids = Object.entries(c.schedule).filter(([, e]) => e.enabled).map(([id]) => id); if (!ids.length) return toast('Chưa có acc nào bật lịch.'); toast('Đang khởi động ' + ids.length + ' acc…'); await call('startNow', ids); render(); });
}

// ---- 2. accounts --------------------------------------------------------------------------------------------
async function accountsPage() {
  const list = await call('accounts'), active = list.filter(a => !a.archived), archived = list.filter(a => a.archived);
  const row = a => `<tr>
      <td><span class="dot" style="background:${a.color}"></span><b>${esc(a.name)}</b><div class="small muted">${esc(a.id)}</div></td>
      <td>Lv.${a.level}</td><td>Hạng ${a.villageRank}</td><td class="small">${esc(a.title || '—')}</td><td>${a.days} ngày</td><td>${a.videos}</td><td class="small">${ago(a.lastPlayed)}</td>
      <td>${a.archived ? '<span class="chip off">Lưu trữ</span>' : a.running ? '<span class="chip on">Đang chạy</span>' : a.schedule?.enabled ? `<span class="chip wait">Lịch ${esc(a.schedule.start)}</span>` : '<span class="chip off">Nghỉ</span>'}</td>
      <td class="row">${a.archived ? `<button class="btn small" data-unarchive="${a.id}">Khôi phục</button><button class="btn small danger" data-del="${a.id}">Xoá</button>`
        : `${a.running ? `<button class="btn small danger" data-stop="${a.id}">Dừng</button>` : `<button class="btn small primary" data-run="${a.id}">Chạy ngay</button>`}<button class="btn small" data-edit="${a.id}">Sửa</button><button class="btn small" data-open="${esc(a.videosDir)}">Video</button><button class="btn small" data-archive="${a.id}">Lưu trữ</button>`}</td></tr>`;
  $('#page-accounts').innerHTML = `<div class="row"><div><h1>Tài khoản</h1><p class="sub">Mỗi acc là một thư mục riêng; tên nhân vật trong game bằng tiếng Nhật.</p></div><button class="btn primary" id="new-acc" style="margin-left:auto">＋ Tạo acc mới</button></div>
    ${active.length ? `<table><tr><th>Acc</th><th>Cấp</th><th>Làng</th><th>Danh hiệu</th><th>Đã chơi</th><th>Video</th><th>Lần chơi cuối</th><th>Trạng thái</th><th></th></tr>${active.map(row).join('')}</table>` : '<div class="empty">Chưa có acc nào. Bấm “Tạo acc mới”.</div>'}
    ${archived.length ? `<h2>Đã lưu trữ</h2><table>${archived.map(row).join('')}</table>` : ''}`;
  $('#new-acc').onclick = () => accountForm();
  document.querySelectorAll('[data-run]').forEach(b => b.onclick = safe(async () => { toast('Đang khởi động ' + b.dataset.run + '…'); await call('startNow', [b.dataset.run]); render(); }));
  document.querySelectorAll('[data-stop]').forEach(b => b.onclick = safe(async () => { await call('stop', b.dataset.stop); render(); }));
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => accountForm(list.find(a => a.id === b.dataset.edit)));
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => window.api.open(b.dataset.open));
  document.querySelectorAll('[data-archive]').forEach(b => b.onclick = safe(async () => { await call('editAccount', b.dataset.archive, { archived: true }); await call('setSchedule', b.dataset.archive, { enabled: false }); render(); }));
  document.querySelectorAll('[data-unarchive]').forEach(b => b.onclick = safe(async () => { await call('editAccount', b.dataset.unarchive, { archived: false }); render(); }));
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = safe(async () => { if (!confirm(`Xoá acc ${b.dataset.del}? Thư mục (save và video) được chuyển vào accounts/_deleted, có thể lấy lại.`)) return; await call('removeAccount', b.dataset.del); toast('Đã chuyển vào _deleted'); render(); }));
}

/** Create (no account) or edit an account: folder id, Japanese name, colour, play style; new ones also get a schedule. */
function accountForm(a) {
  const style = a?.style ?? {}, sel = a?.color ?? Object.values(colors)[1];
  const m = $('#modal'), f = $('#modal-body');
  f.innerHTML = `<h2 style="margin:0">${a ? 'Sửa acc ' + esc(a.id) : 'Tạo acc mới'}</h2>
    <div class="grid2">
      <label class="field">Tên thư mục (chữ không dấu, để phân biệt clip)<input type="text" id="f-id" value="${esc(a?.id ?? '')}" ${a ? 'disabled' : ''} placeholder="vd: sakura"></label>
      <label class="field">Tên nhân vật (tiếng Nhật)<input type="text" id="f-name" value="${esc(a?.name ?? '')}" placeholder="vd: さくら"></label>
    </div>
    <div class="field">Màu nhân vật<div class="swatches">${Object.entries(colors).map(([k, hex]) => `<button type="button" data-color="${hex}" title="${k}" class="${hex === sel ? 'sel' : ''}" style="background:${hex}"></button>`).join('')}</div></div>
    <div class="field">Tính cách chơi (độ ưu tiên chủ đề clip; 1 = bình thường)${Object.entries(STYLE).map(([k, v]) => `<div class="slider"><span>${v}</span><input type="range" min="0.5" max="3" step="0.25" data-style="${k}" value="${style[k] ?? 1}"><b>${style[k] ?? 1}</b></div>`).join('')}</div>
    ${a ? '' : `<div class="grid2"><label class="field">Giờ chạy hằng ngày<input type="time" id="f-start" value="08:00"></label><label class="field">Số clip mỗi ngày<input type="number" id="f-clips" min="1" max="20" value="10"></label></div>
      <label class="row small"><input type="checkbox" id="f-enabled" checked> Bật lịch chạy ngay (có thể chỉnh ở trang Lịch chạy)</label>`}
    <div class="row" style="justify-content:flex-end"><button class="btn" value="cancel">Huỷ</button><button class="btn primary" id="f-save" type="button">${a ? 'Lưu' : 'Tạo acc'}</button></div>`;
  let color = sel;
  f.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { color = b.dataset.color; f.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('sel', x === b)); });
  f.querySelectorAll('[data-style]').forEach(r => r.oninput = () => { r.nextElementSibling.textContent = r.value; });
  $('#f-save').onclick = safe(async () => {
    const name = $('#f-name').value.trim(), styleOut = Object.fromEntries([...f.querySelectorAll('[data-style]')].map(r => [r.dataset.style, Number(r.value)]).filter(([, v]) => v !== 1));
    if (!name) return toast('Hãy nhập tên nhân vật.');
    if (a) await call('editAccount', a.id, { name, color, style: styleOut });
    else {
      const id = $('#f-id').value.trim(); if (!/^[a-z0-9_-]{2,24}$/i.test(id)) return toast('Tên thư mục: 2–24 chữ cái không dấu, số, - hoặc _.');
      await call('newAccount', { id, name, color, style: styleOut });
      await call('setSchedule', id, { enabled: $('#f-enabled').checked, start: $('#f-start').value || '08:00', clips: Number($('#f-clips').value) || 10 });
    }
    m.close(); toast(a ? 'Đã lưu' : 'Đã tạo acc'); render();
  });
  m.showModal();
}

// ---- 3. schedule ------------------------------------------------------------------------------------------------
/** Wall-clock minutes per clip: the recorded length plus opening the game, the unrecorded finish and the pause (~3 min). */
const CLIP_OVERHEAD = 3;
/** 24-hour time picker: hours 00–23, minutes in steps of 5. */
const timePicker = hm => { const [h, m] = (hm || '08:00').split(':').map(Number); return `<select class="s-h">${Array.from({ length: 24 }, (_, i) => `<option ${i === h ? 'selected' : ''}>${String(i).padStart(2, '0')}</option>`).join('')}</select> : <select class="s-m">${Array.from({ length: 12 }, (_, i) => i * 5).map(i => `<option ${i === m - m % 5 ? 'selected' : ''}>${String(i).padStart(2, '0')}</option>`).join('')}</select>`; };
/** When an account's day ends: start + clips × (length + overhead), with a +1 day mark past midnight. */
const finishAt = (hm, clips, minutes) => { const [h, m] = hm.split(':').map(Number), end = h * 60 + m + clips * (minutes + CLIP_OVERHEAD), day = Math.floor(end / 1440), t = end % 1440; return `~${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}${day ? ' (hôm sau)' : ''}`; };
/** Scenario weights: off, a little, normal, a lot. */
const WEIGHTS = [[0, 'Tắt'], [1, 'Ít'], [2, 'Vừa'], [3, 'Nhiều']];
const mixOf = mix => Object.entries(mix ?? {}).filter(([, w]) => w > 0);
/** The schedule's scenario button: clips per scenario for the day, or the automatic day. */
const mixText = (mix, clips) => { const p = shares(mix, clips); return p.length ? p.map(x => `${themes[x.id]?.icon ?? x.id}${x.n}`).join(' ') : '🎲 Tự động'; };
/** How many of `clips` each scenario gets (the director's own share-out; scenarios not open yet are skipped then). */
function shares(mix, clips) {
  const m = mixOf(mix), total = m.reduce((n, [, w]) => n + w, 0); if (!total) return [];
  const out = m.map(([id, w]) => ({ id, exact: clips * w / total })).map(p => ({ ...p, n: Math.floor(p.exact) }));
  for (const p of [...out].sort((a, b) => (b.exact - b.n) - (a.exact - a.n)).slice(0, clips - out.reduce((n, p) => n + p.n, 0))) p.n++;
  return out.filter(p => p.n);
}
/** Pick an account's scenarios and how much of each: saved with the row's current settings. */
function mixForm(tr, entry) {
  const m = $('#modal'), f = $('#modal-body'), mix = { ...(entry.mix ?? {}) }, clips = () => Number(tr.querySelector('.s-clips').value) || 10;
  const draw = () => {
    const share = shares(mix, clips());
    f.innerHTML = `<h2 style="margin:0">Kịch bản cho ${esc(tr.dataset.name)}</h2>
      <p class="small muted" style="margin:0">Chọn một hay nhiều kịch bản và mức nhiều ít. Mỗi clip là một kịch bản, chia theo tỉ lệ, không lặp liền nhau. Kịch bản chưa mở (chưa đủ cấp) sẽ tự bỏ qua. Không chọn gì = Tự động.</p>
      <div class="mix-list">${scenarios.filter(sc => sc.id !== 'auto').map(sc => `<div class="mix-row"><span>${sc.icon} ${esc(sc.vi)}${sc.need ? ` <span class="small muted">(${esc(sc.need)})</span>` : ''}</span>
        <div class="seg">${WEIGHTS.map(([w, l]) => `<button type="button" data-mix="${sc.id}" data-w="${w}" class="${(mix[sc.id] ?? 0) === w ? 'on' : ''}">${l}</button>`).join('')}</div></div>`).join('')}</div>
      <div class="panel small">${share.length ? `${clips()} clip/ngày ≈ ${share.map(p => `${themes[p.id]?.icon} ${esc(themes[p.id]?.vi)} <b>${p.n}</b>`).join(' · ')}` : '🎲 Tự động: sáng Trang trại, tối Thư giãn, giữa trộn đa dạng các kịch bản đã mở.'}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn" type="button" id="mix-auto">Về Tự động</button><button class="btn" value="cancel">Huỷ</button><button class="btn primary" id="mix-save" type="button">Lưu</button></div>`;
    f.querySelectorAll('[data-mix]').forEach(b => b.onclick = () => { mix[b.dataset.mix] = Number(b.dataset.w); draw(); });
    $('#mix-auto').onclick = () => { for (const k of Object.keys(mix)) delete mix[k]; draw(); };
    $('#mix-save').onclick = safe(async () => {
      await call('setSchedule', tr.dataset.id, { ...rowEntry(tr), mix: Object.fromEntries(mixOf(mix)) });
      m.close(); toast('Đã lưu kịch bản'); render();
    });
  };
  draw(); m.showModal();
}
/** A schedule row's settings as shown. */
const rowEntry = tr => ({ enabled: tr.querySelector('.s-on').checked, start: `${tr.querySelector('.s-h').value}:${tr.querySelector('.s-m').value}`, days: [...tr.querySelectorAll('.s-day:checked')].map(i => Number(i.value)), clips: Number(tr.querySelector('.s-clips').value) || 10 });
async function schedulePage() {
  const [list, c, w, waiting] = await Promise.all([call('accounts'), call('control'), call('waves'), call('waiting')]);
  const rows = list.filter(a => !a.archived).map(a => { const e = c.schedule[a.id] ?? { enabled: false, days: [1, 2, 3, 4, 5, 6, 0], start: '08:00', clips: c.settings.clips };
    return `<tr data-id="${a.id}" data-name="${esc(a.name)}"><td><span class="dot" style="background:${a.color}"></span><b>${esc(a.name)}</b> <span class="small muted">${esc(a.id)}</span></td>
      <td><input type="checkbox" class="s-on" ${e.enabled ? 'checked' : ''}></td><td class="row" style="gap:4px;flex-wrap:nowrap">${timePicker(e.start)}</td>
      <td><div class="days">${DAYS.map(([d, l]) => `<label><input type="checkbox" class="s-day" value="${d}" ${e.days?.includes(d) ? 'checked' : ''}>${l}</label>`).join('')}</div></td>
      <td><button class="btn small s-mix" type="button" title="Chọn kịch bản">${mixText(e.mix, e.clips ?? c.settings.clips)}</button></td><td><input type="number" class="s-clips" min="1" max="20" value="${e.clips ?? c.settings.clips}" style="width:70px"></td><td class="s-end">${finishAt(e.start, e.clips ?? c.settings.clips, c.settings.minutes)}</td><td class="small muted">${c.lastRun[a.id] ? 'đã chạy ' + c.lastRun[a.id] : '—'}</td></tr>`; }).join('');
  $('#page-schedule').innerHTML = `<h1>Lịch chạy</h1><p class="sub">App chạy ngầm ở khay hệ thống và tự bắt đầu các acc đúng giờ. Khi số acc đến giờ nhiều hơn sức máy, acc sau chờ lượt và tự chạy khi có chỗ.</p>
    ${w.overloaded ? `<div class="warn">Hôm nay có lúc ${w.overlap} acc chạy cùng lúc, máy chỉ chạy được ${w.capacity}. Các acc dư sẽ chờ lượt (xong muộn hơn). Có thể giãn giờ bắt đầu.</div>` : `<div class="ok">Lịch hôm nay vừa sức máy (tối đa ${w.capacity} acc cùng lúc).</div>`}
    ${waiting.length ? `<div class="warn">Đang chờ lượt: ${waiting.map(esc).join(', ')}</div>` : ''}
    ${rows ? `<table><tr><th>Acc</th><th>Bật</th><th>Giờ bắt đầu</th><th>Ngày</th><th>Kịch bản</th><th>Số clip</th><th>Xong khoảng</th><th>Lần cuối</th></tr>${rows}</table>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="s-save">Lưu lịch</button><span class="small muted">Mỗi video dài đúng ${c.settings.minutes} phút; tính cả mở game và chuyển clip, mỗi clip chiếm khoảng ${c.settings.minutes + CLIP_OVERHEAD} phút · 10 clip ≈ ${(10 * (c.settings.minutes + CLIP_OVERHEAD) / 60).toFixed(1).replace('.', ',')} giờ</span></div>` : '<div class="empty">Chưa có acc.</div>'}`;
  const save = $('#s-save'); if (save) save.onclick = safe(async () => {
    for (const tr of document.querySelectorAll('#page-schedule tr[data-id]')) await call('setSchedule', tr.dataset.id, rowEntry(tr));
    toast('Đã lưu lịch'); render();
  });
  // The finish time follows the start and the clip count as they change.
  for (const tr of document.querySelectorAll('#page-schedule tr[data-id]')) {
    const update = () => { tr.querySelector('.s-end').textContent = finishAt(`${tr.querySelector('.s-h').value}:${tr.querySelector('.s-m').value}`, Number(tr.querySelector('.s-clips').value) || 1, c.settings.minutes); };
    tr.querySelectorAll('select, .s-clips').forEach(el => { el.oninput = update; el.onchange = update; });
    tr.querySelector('.s-mix').onclick = () => mixForm(tr, c.schedule[tr.dataset.id] ?? {});
  }
}

// ---- 4. hardware --------------------------------------------------------------------------------------------
let quick = null;
async function hardwarePage() {
  const [hw, b] = await Promise.all([call('hardware'), call('benchmarkState')]);
  if (!quick) quick = await call('quickCheck');
  const i = quick.info, steps = b?.steps?.length ? b.steps : hw?.steps ?? [];
  $('#page-hardware').innerHTML = `<h1>Phần cứng</h1><p class="sub">Máy này chạy được bao nhiêu acc cùng lúc (vừa chơi vừa quay).</p>
    <div class="grid2">
      <div class="panel"><h2 style="margin-top:0">Thông số</h2><table>
        <tr><td>CPU</td><td>${esc(i.cpu)} · ${i.cores} nhân / ${i.threads} luồng</td></tr><tr><td>RAM</td><td>${i.ramGB} GB</td></tr>
        <tr><td>Card đồ hoạ</td><td>${esc(i.gpu)} · driver ${esc(i.driver ?? '—')}</td></tr><tr><td>NVENC (quay bằng card)</td><td>${i.nvenc ? `✅ tối đa ${i.nvencSessions} luồng` : '❌ quay bằng CPU'}</td></tr>
        <tr><td>Google Chrome</td><td>${i.chrome ? '✅' : '❌ chưa cài'}</td></tr><tr><td>Ổ dữ liệu còn trống</td><td>${i.diskFreeGB ?? '—'} GB (≈ ${i.diskFreeGB ? Math.round(i.diskFreeGB / (Math.max(1, hw?.capacity ?? await call('estimate')) * 10)) : '—'} ngày quay với mỗi acc 10 giờ/ngày)</td></tr></table>
        ${quick.warnings.map(w => `<div class="warn">${esc(w)}</div>`).join('')}<button class="btn small" id="h-quick">Kiểm tra lại</button></div>
      <div class="panel"><h2 style="margin-top:0">Sức máy</h2>
        <div class="big">${hw ? `${hw.capacity} acc` : `≈ ${await call('estimate')} acc`}</div><div class="muted">${hw ? `cùng lúc · giới hạn: ${esc(hw.limit)} · đo lúc ${new Date(hw.at).toLocaleString('vi-VN')}` : 'Ước tính theo số luồng CPU. Bấm “Đo sức máy” để chạy thử thật.'}</div>
        <p class="small muted">Chạy thử 1, 2, 3… acc ngầm vừa chơi vừa quay (mỗi bước khoảng 2 phút), đo CPU, card, RAM và số khung hình. Dừng ở bước đầu tiên vượt ngưỡng (CPU 85%, card 90%, RAM trống dưới 3 GB, dưới 26 khung/giây).</p>
        <button class="btn primary" id="h-bench" ${b?.running ? 'disabled' : ''}>${b?.running ? 'Đang đo…' : 'Đo sức máy (5–12 phút)'}</button>
        ${b?.note ? `<div class="${b.running ? 'warn' : 'ok'}">${esc(b.note)}</div>` : ''}</div>
    </div>
    ${steps.length ? `<h2>Kết quả từng bước</h2><table><tr><th>Số acc</th><th>CPU</th><th>Card đồ hoạ</th><th>NVENC</th><th>RAM</th><th>Khung/giây (thấp nhất)</th><th></th></tr>${steps.map(s => `<tr><td>${s.accounts}</td><td>${s.cpu}%</td><td>${s.gpu}%</td><td>${s.encoder}%</td><td>${s.ram}%${s.ramFreeGB !== undefined ? ` (trống ${s.ramFreeGB} GB)` : ''}</td><td>${s.fps}</td><td>${s.ok ? '✅' : '❌'}</td></tr>`).join('')}</table>` : ''}`;
  $('#h-quick').onclick = safe(async () => { quick = await call('quickCheck'); render(); });
  $('#h-bench').onclick = safe(async () => { toast('Bắt đầu đo, giữ máy yên vài phút…'); call('benchmark').then(() => { quick = null; render(); }).catch(e => toast('⚠ ' + e.message)); setTimeout(render, 1000); });
}

// ---- 5. settings --------------------------------------------------------------------------------------------
/** The update state in words. */
const updateText = u => ({ dev: 'bản phát triển (không tự cập nhật)', idle: 'chưa kiểm tra', checking: 'đang kiểm tra…', latest: 'đã là bản mới nhất', downloading: `đang tải bản ${esc(u.version)} (${u.progress}%)`, ready: `bản ${esc(u.version)} đã tải xong, sẽ tự cài khi không có acc nào chơi`, error: `lỗi kiểm tra: ${esc(u.error)}` })[u.status] ?? u.status;
async function settingsPage() {
  const c = await call('control'), s = c.settings, hw = await call('hardware'), info = await window.api.app('info');
  $('#page-settings').innerHTML = `<h1>Cài đặt</h1><p class="sub">Áp dụng cho các lần chạy sau.</p><div class="panel" style="display:grid;gap:14px;max-width:560px">
    <label class="row"><input type="checkbox" id="o-auto" ${s.autostart ? 'checked' : ''}> Tự khởi động cùng Windows (chạy ngầm ở khay hệ thống)</label>
    <label class="row"><input type="checkbox" id="o-sound" ${s.sound ? 'checked' : ''}> Âm thanh của bot (mặc định tắt để không ồn; áp dụng từ clip sau)</label>
    <label class="field">Số acc chạy cùng lúc tối đa (0 = theo kết quả đo: ${hw?.capacity ?? 'chưa đo'})<input type="number" id="o-max" min="0" max="8" value="${s.maxParallel}"></label>
    <label class="field">Số clip mỗi ngày (mặc định cho acc mới)<input type="number" id="o-clips" min="1" max="20" value="${s.clips}"></label>
    <label class="field">Độ dài mỗi clip (phút)<input type="number" id="o-min" min="1" max="180" value="${s.minutes}"></label>
    <div class="row"><button class="btn primary" id="o-save">Lưu</button></div></div>
    <h2>Thư mục dữ liệu</h2><div class="panel" style="display:grid;gap:10px;max-width:560px"><div class="mono">${esc(info.dataDir)}</div>
      <div class="row"><button class="btn small" id="o-open">Mở thư mục</button><button class="btn small" id="o-move">Đổi thư mục…</button><span class="small muted">Đổi thư mục không chuyển dữ liệu cũ sang; app sẽ khởi động lại.</span></div></div>
    <h2>Phiên bản và cập nhật</h2><div class="panel" style="display:grid;gap:10px;max-width:560px"><div>Phiên bản <b>${esc(info.version)}</b> · ${updateText(info.update)}</div>
      <div class="row"><button class="btn small" id="o-check" ${info.packaged ? '' : 'disabled'}>Kiểm tra cập nhật</button>${info.update.status === 'ready' ? '<button class="btn small primary" id="o-install">Cài bản mới ngay</button>' : ''}</div>
      <div class="small muted">App tự kiểm tra bản mới mỗi 6 giờ, tải ngầm và tự cài khi không có acc nào đang chơi.</div></div>`;
  $('#o-open').onclick = () => window.api.open(info.dataDir);
  $('#o-move').onclick = safe(async () => { const dir = await window.api.app('chooseFolder', info.dataDir); if (dir && confirm(`Dùng thư mục ${dir}? App sẽ khởi động lại.`)) await window.api.app('setDataDir', dir); });
  $('#o-check').onclick = safe(async () => { toast('Đang kiểm tra…'); await window.api.app('checkUpdate'); render(); });
  const install = $('#o-install'); if (install) install.onclick = safe(async () => { await window.api.app('installUpdate'); });
  $('#o-save').onclick = safe(async () => { await call('setSettings', { autostart: $('#o-auto').checked, sound: $('#o-sound').checked, maxParallel: Number($('#o-max').value) || 0, clips: Number($('#o-clips').value) || 10, minutes: Number($('#o-min').value) || 60 }); toast('Đã lưu cài đặt'); });
}

// ---- refresh --------------------------------------------------------------------------------------------------
const PAGES = { overview, accounts: accountsPage, schedule: schedulePage, hardware: hardwarePage, settings: settingsPage };
const render = safe(async () => { if ($('#modal').open) return; await PAGES[page](); });
/** First run: pick the data folder (accounts, saves, videos), see what this PC has, then the app restarts there. */
async function firstRun(info) {
  const check = await call('quickCheck'), i = check.info, m = $('#modal'), f = $('#modal-body');
  f.innerHTML = `<h2 style="margin:0">Chào mừng! Thiết lập lần đầu</h2>
    <p class="small">Chọn nơi lưu acc, save và video. Mỗi acc quay khoảng <b>10 GB video mỗi ngày</b>, nên hãy chọn ổ còn trống nhiều.</p>
    <label class="field">Thư mục dữ liệu<div class="row"><input type="text" id="w-dir" value="${esc(info.dataDir)}" style="flex:1"><button class="btn small" type="button" id="w-pick">Chọn…</button></div></label>
    <table><tr><td>CPU</td><td>${esc(i.cpu)} (${i.threads} luồng)</td></tr><tr><td>RAM</td><td>${i.ramGB} GB</td></tr><tr><td>Card đồ hoạ</td><td>${esc(i.gpu)}</td></tr>
      <tr><td>Quay bằng card (NVENC)</td><td>${i.nvenc ? '✅' : '⚠ không có, quay bằng CPU'}</td></tr><tr><td>Trình duyệt cho bot</td><td>${i.chrome ? '✅' : '❌'}</td></tr></table>
    ${check.warnings.map(w => `<div class="warn">${esc(w)}</div>`).join('')}
    <p class="small muted">Ước tính máy này chạy được khoảng <b>${await call('estimate')} acc</b> cùng lúc. Sau khi thiết lập, vào trang Phần cứng để đo chính xác.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" type="button" id="w-go">Bắt đầu</button></div>`;
  $('#w-pick').onclick = safe(async () => { const dir = await window.api.app('chooseFolder', $('#w-dir').value); if (dir) $('#w-dir').value = dir; });
  $('#w-go').onclick = safe(async () => { toast('Đang thiết lập, app sẽ mở lại…'); await window.api.app('setDataDir', $('#w-dir').value.trim()); });
  m.addEventListener('cancel', e => e.preventDefault());
  m.showModal();
}
(async () => {
  [colors, themes, scenarios] = await Promise.all([call('colors'), call('themes'), call('scenarios')]);
  const info = await window.api.app('info'); if (info.needsSetup) firstRun(info);
  render(); sidebar();
  setInterval(() => { sidebar(); if (page === 'overview' || (page === 'hardware' && document.querySelector('#h-bench')?.disabled)) render(); }, 3000);
  setInterval(() => { if (page === 'accounts' || page === 'schedule') render(); }, 15000);
})();
