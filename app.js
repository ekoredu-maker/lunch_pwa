/* 점심 정산 PWA — GitHub Pages + Supabase */
'use strict';
const CFG = window.APP_CONFIG;
const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const PRICES = [8000, 8500, 9000, 9500, 10000, 11000];
const DOW = '일월화수목금토';
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// ---------------- state ----------------
const now = new Date();
let ym = { y: now.getFullYear(), m: now.getMonth() + 1 };
let members = [], shops = [], shopCounts = {}, bosses = {}, meals = [], rsvps = [];
let me = Number(ls.get('lunch-me')) || null;
let favEditing = false, showAllShops = false, busy = false;
let f = blankForm();
function blankForm(keep) {
  return { id: null, date: keep?.date || todayStr(), shop: '', price: keep?.price || 9000, sel: {}, shared: 0, payer: null, memo: '' };
}
const ymKey = () => `${ym.y}-${pad(ym.m)}`;
const memberById = (id) => members.find((m) => m.id === id);
const nameOf = (id) => memberById(id)?.name ?? '(삭제된 사람)';
const activeMembers = () => members.filter((m) => m.active);

// ---------------- ui helpers ----------------
function toast(t, ms = 1800) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = t;
  document.body.append(d); setTimeout(() => d.remove(), ms);
}
function fail(err, what) {
  console.error(err);
  const msg = err?.message || String(err);
  if (/JWT|session|not authenticated/i.test(msg)) { showLogin(); return; }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) toast(`${what} 실패: 인터넷 연결을 확인하세요`, 2600);
  else toast(`${what} 실패: ${msg}`, 3200);
}
function chip(html, on, cls, fn) {
  const b = document.createElement('button'); b.type = 'button';
  b.className = 'chip' + (cls ? ' ' + cls : '') + (on ? ' on' : '');
  b.innerHTML = html; b.onclick = fn; b.setAttribute('aria-pressed', !!on); return b;
}

// ---------------- auth ----------------
function showLogin() { $('login').hidden = false; $('app').hidden = true; $('nav').hidden = true; }
function showApp() { $('login').hidden = true; $('app').hidden = false; $('nav').hidden = false; }
$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('loginBtn').disabled = true; $('loginErr').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: CFG.GROUP_EMAIL, password: $('pw').value });
  $('loginBtn').disabled = false;
  if (error) { $('loginErr').textContent = /Invalid/i.test(error.message) ? '비밀번호가 맞지 않아요' : error.message; return; }
  $('pw').value = ''; showApp(); await loadAll(); runPendingIntent();
};
let pendingIntent = null;
function runPendingIntent() {
  if (!pendingIntent) return;
  const p = pendingIntent; pendingIntent = null;
  handleRsvpIntent(p.rsvp, p.date);
}
$('logoutBtn').onclick = async () => { await sb.auth.signOut(); showLogin(); };

// ---------------- data ----------------
async function loadAll() {
  try {
    const [m, s, b, c, rv] = await Promise.all([
      sb.from('members').select('*').order('sort').order('id'),
      sb.from('shops').select('*').order('name'),
      sb.from('bosses').select('*'),
      sb.from('meals').select('shop').limit(5000),
      sb.from('rsvps').select('*').eq('date', todayStr()),
    ]);
    for (const r of [m, s, b, c, rv]) if (r.error) throw r.error;
    rsvps = rv.data;
    members = m.data; shops = s.data;
    bosses = Object.fromEntries(b.data.map((x) => [x.ym, x.member_id]));
    shopCounts = {}; for (const x of c.data) shopCounts[x.shop] = (shopCounts[x.shop] || 0) + 1;
    if (me && !memberById(me)) me = null;
    await loadMonth(false);
    $('netNote').hidden = true;
  } catch (e) {
    fail(e, '불러오기');
    $('netNote').textContent = '서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 [설정 → 새로고침]을 누르세요.';
    $('netNote').hidden = false;
  }
  renderAll();
}
async function loadMonth(render = true) {
  const start = `${ym.y}-${pad(ym.m)}-01`;
  const n = ym.m === 12 ? { y: ym.y + 1, m: 1 } : { y: ym.y, m: ym.m + 1 };
  const end = `${n.y}-${pad(n.m)}-01`;
  const r = await sb.from('meals').select('*, meal_items(member_id, amount)')
    .gte('date', start).lt('date', end).order('date').order('id');
  if (r.error) { fail(r.error, '불러오기'); return; }
  meals = r.data;
  if (render) renderAll();
}
const mealTotal = (x) => x.meal_items.reduce((s, i) => s + i.amount, 0) + (x.shared || 0);

// ---------------- form (입력) ----------------
function renderForm() {
  $('fDate').value = f.date;
  $('editBar').hidden = !f.id;
  if (f.id) $('editText').textContent = '기록 수정 중';

  // 식당
  const sc = $('fShops');
  const favs = shops.filter((s) => s.favorite).map((s) => s.name);
  const order = shops.map((s) => s.name).sort((a, b) =>
    (favs.includes(b) - favs.includes(a)) || ((shopCounts[b] || 0) - (shopCounts[a] || 0)) || a.localeCompare(b, 'ko'));
  sc.classList.toggle('editing', favEditing);
  let shown;
  if (favEditing) shown = order;
  else {
    shown = showAllShops || !favs.length ? order : order.filter((s) => favs.includes(s));
    if (f.shop && !shown.includes(f.shop) && order.includes(f.shop)) shown = [f.shop, ...shown];
  }
  sc.replaceChildren(...shown.map((name) => {
    const fav = favs.includes(name);
    const html = `${fav || favEditing ? `<span class="st">${fav ? '★' : '☆'}</span>` : ''}${esc(name)}${shopCounts[name] ? `<span class="c">${shopCounts[name]}회</span>` : ''}`;
    return chip(html, !favEditing && f.shop === name, fav ? 'fav' : '', async () => {
      if (favEditing) {
        const s = shops.find((x) => x.name === name); s.favorite = !fav; renderForm();
        const { error } = await sb.from('shops').update({ favorite: s.favorite }).eq('id', s.id);
        if (error) { s.favorite = fav; renderForm(); fail(error, '즐겨찾기 저장'); }
      } else { f.shop = name; $('fShop').value = ''; renderForm(); }
    });
  }));
  $('favEdit').textContent = favEditing ? '완료' : '☆ 즐겨찾기 편집';
  const rest = order.length - favs.length;
  $('moreShops').hidden = favEditing || !favs.length || rest <= 0;
  $('moreShops').textContent = showAllShops ? '즐겨찾기만 보기 ▲' : `다른 식당 ${rest}곳 더보기 ▼`;

  // 가격
  $('fPrices').replaceChildren(...PRICES.map((p) => chip(won(p), f.price === p, '', () => {
    for (const k in f.sel) if (f.sel[k] === f.price) f.sel[k] = p;
    f.price = p; renderForm();
  })));
  $('priceShow').textContent = won(f.price) + '원';

  // 사람
  const pool = members.filter((m) => m.active || m.id in f.sel);
  $('fPeople').replaceChildren(...pool.map((m) => {
    const on = m.id in f.sel;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'person' + (on ? ' on' : '');
    b.setAttribute('aria-pressed', on);
    b.innerHTML = `<span class="n">${esc(m.name)}</span><span class="a">${on ? won(f.sel[m.id]) : '—'}</span>`;
    b.onclick = () => { if (on) delete f.sel[m.id]; else f.sel[m.id] = f.price; renderForm(); };
    return b;
  }));
  const ids = pool.filter((m) => m.id in f.sel).map((m) => m.id);
  $('cntShow').textContent = ids.length ? ids.length + '명' : '';
  $('adjBox').hidden = !ids.length;
  $('fAdj').replaceChildren(...ids.map((id) => {
    const d = document.createElement('div'); d.className = 'adj-item';
    const s = document.createElement('span'); s.textContent = nameOf(id);
    const minus = document.createElement('button'); minus.className = 'step'; minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', nameOf(id) + ' 500원 빼기');
    const inp = document.createElement('input'); inp.type = 'number'; inp.inputMode = 'numeric'; inp.step = 500; inp.min = 0; inp.id = 'amt-' + id; inp.value = f.sel[id];
    const plus = document.createElement('button'); plus.className = 'step'; plus.type = 'button'; plus.textContent = '＋'; plus.setAttribute('aria-label', nameOf(id) + ' 500원 더하기');
    minus.onclick = () => { f.sel[id] = Math.max(0, f.sel[id] - 500); renderForm(); };
    plus.onclick = () => { f.sel[id] += 500; renderForm(); };
    inp.onchange = () => { f.sel[id] = Math.max(0, Math.round(+inp.value || 0)); renderForm(); };
    d.append(s, minus, inp, plus); return d;
  }));

  // 결제자 (먹은 사람 먼저)
  const payers = [...pool.filter((m) => m.id in f.sel), ...pool.filter((m) => !(m.id in f.sel))];
  $('fPayer').replaceChildren(...payers.map((m) => chip(esc(m.name), f.payer === m.id, 'pay', () => { f.payer = m.id; renderForm(); })));
  if (document.activeElement !== $('fShared')) $('fShared').value = f.shared || '';
  if (document.activeElement !== $('fMemo')) $('fMemo').value = f.memo || '';

  const total = ids.reduce((s, id) => s + f.sel[id], 0) + (+f.shared || 0);
  const shop = f.shop || $('fShop').value.trim();
  const ok = ids.length && f.payer && shop && f.date && !busy;
  $('saveBtn').disabled = !ok;
  $('saveBtn').textContent = busy ? '저장 중…' : ok ? `${ids.length}명 · ${won(total)}원 ${f.id ? '수정 저장' : '저장'}`
    : (!shop ? '식당을 고르세요' : !ids.length ? '먹은 사람을 고르세요' : '결제자를 고르세요');
}
$('fDate').onchange = (e) => { f.date = e.target.value; renderForm(); };
$('fShop').oninput = () => { f.shop = ''; renderForm(); };
$('fShared').oninput = (e) => { f.shared = Math.max(0, Math.round(+e.target.value || 0)); renderForm(); };
$('fMemo').oninput = (e) => { f.memo = e.target.value; };
$('favEdit').onclick = () => { favEditing = !favEditing; renderForm(); };
$('moreShops').onclick = () => { showAllShops = !showAllShops; renderForm(); };
$('editCancel').onclick = () => { f = blankForm(f); $('fShop').value = ''; renderForm(); };
$('saveBtn').onclick = async () => {
  const shop = f.shop || $('fShop').value.trim();
  const items = Object.entries(f.sel).filter(([, a]) => a > 0).map(([id, a]) => ({ member_id: +id, amount: a }));
  busy = true; renderForm();
  const { error } = await sb.rpc('save_meal', {
    p_id: f.id, p_date: f.date, p_shop: shop, p_shared: +f.shared || 0, p_payer: f.payer, p_memo: f.memo || '', p_items: items,
  });
  busy = false;
  if (error) { renderForm(); fail(error, '저장'); return; }
  const wasEdit = !!f.id;
  const [y, m] = f.date.split('-').map(Number); ym = { y, m };
  f = blankForm(f); $('fShop').value = '';
  toast(wasEdit ? '수정했어요' : '저장했어요');
  await loadAll();
};

// ---------------- 내역 ----------------
function renderList() {
  const box = $('list');
  if (!meals.length) { box.innerHTML = '<div class="empty">이번 달 기록이 아직 없어요.<br>[입력] 탭에서 첫 점심을 기록하세요.</div>'; return; }
  box.replaceChildren(...meals.slice().reverse().map((x) => {
    const d = new Date(x.date + 'T00:00');
    const base = x.meal_items[0]?.amount;
    const who = x.meal_items.map((i) => i.amount !== base ? `${nameOf(i.member_id)} ${won(i.amount)}` : nameOf(i.member_id)).join(', ');
    const el = document.createElement('div'); el.className = 'meal';
    el.innerHTML = `<div class="top"><span class="d">${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]}) · ${esc(x.shop)}</span><span class="t">${won(mealTotal(x))}원</span></div>
      <div class="who">${esc(who)}${x.shared ? ` · 공동 ${won(x.shared)}` : ''}</div>
      <div class="foot"><span>결제 ${esc(nameOf(x.payer_id))}${x.memo ? ' · ' + esc(x.memo) : ''}</span><span class="acts"></span></div>`;
    const ed = document.createElement('button'); ed.className = 'link accent'; ed.textContent = '수정';
    ed.onclick = () => {
      f = { id: x.id, date: x.date, shop: x.shop, price: base || 9000, sel: Object.fromEntries(x.meal_items.map((i) => [i.member_id, i.amount])), shared: x.shared, payer: x.payer_id, memo: x.memo || '' };
      if (!shops.some((s) => s.name === x.shop)) { $('fShop').value = x.shop; f.shop = ''; } else $('fShop').value = '';
      goTab('add'); renderForm();
    };
    const del = document.createElement('button'); del.className = 'link'; del.textContent = '삭제';
    del.onclick = async () => {
      if (!del.dataset.arm) { del.dataset.arm = 1; del.textContent = '한 번 더 누르면 삭제'; return; }
      const { error } = await sb.from('meals').delete().eq('id', x.id);
      if (error) return fail(error, '삭제');
      toast('삭제했어요'); await loadAll();
    };
    el.querySelector('.acts').append(ed, del); return el;
  }));
}

// ---------------- 정산 ----------------
function settle() {
  const bossId = bosses[ymKey()] ?? null;
  const rows = members.map((m) => ({ id: m.id, n: m.name, eat: 0, shared: 0, paid: 0 }));
  const idx = Object.fromEntries(rows.map((r, i) => [r.id, i]));
  for (const x of meals) {
    const eaters = x.meal_items.filter((i) => i.amount > 0);
    const per = eaters.length ? (x.shared || 0) / eaters.length : 0;
    for (const i of eaters) if (i.member_id in idx) { rows[idx[i.member_id]].eat += i.amount; rows[idx[i.member_id]].shared += per; }
    if (x.payer_id in idx) rows[idx[x.payer_id]].paid += mealTotal(x);
  }
  for (const r of rows) {
    r.mine = r.eat + r.shared; r.net = r.mine - r.paid;
    const isBoss = r.id === bossId;
    r.send = isBoss ? 0 : Math.max(0, Math.round(r.net / 10) * 10);
    r.recv = isBoss ? 0 : Math.max(0, Math.round(-r.net / 10) * 10);
  }
  return { rows, bossId, total: meals.reduce((s, x) => s + mealTotal(x), 0) };
}
function acctOf(id) { const m = memberById(id); return m && (m.bank || m.account) ? `${m.bank || ''} ${m.account || ''}`.trim() : ''; }
function renderSettle() {
  const s = settle(); const bossName = s.bossId ? nameOf(s.bossId) : null;
  $('meChips').replaceChildren(...members.filter((m) => m.active || m.id === me).map((m) =>
    chip(esc(m.name), me === m.id, '', () => setMe(m.id))));
  const card = $('meCard');
  const r = s.rows.find((x) => x.id === me);
  const acct = s.bossId ? acctOf(s.bossId) : '';
  let head;
  if (!r) head = `<div class="cap">위에서 내 이름을 누르면 내 금액만 크게 보여요</div>`;
  else if (!bossName) head = `<div class="cap">이달 총무가 정해지지 않았어요</div><div class="big">[설정]에서 총무를 고르세요</div>`;
  else if (me === s.bossId) head = `<div class="cap">이번 달 총무예요</div><div class="big">받을 돈 ${won(s.rows.reduce((a, x) => a + x.send, 0))}원</div><div class="cap">돌려줄 돈 ${won(s.rows.reduce((a, x) => a + x.recv, 0))}원 · 내 몫은 자동으로 맞춰져요</div>`;
  else if (r.send) head = `<div class="cap">${esc(bossName)} 님에게 보낼 금액</div><div class="big send">${won(r.send)}원</div><div class="acct"><span>${esc(bossName)} · ${esc(acct || '계좌 미등록 ([설정]에서 입력)')}</span>${acct ? '<button class="btn" id="cpAcct" style="padding:6px 10px">복사</button>' : ''}</div>`;
  else if (r.recv) head = `<div class="cap">${esc(bossName)} 님에게서 받을 금액</div><div class="big recv">${won(r.recv)}원</div>`;
  else head = `<div class="cap">이번 달 정산</div><div class="big">주고받을 돈 없음</div>`;
  card.innerHTML = head + (r ? `<dl><dt>내가 먹은 식대</dt><dd>${won(r.eat)}</dd><dt>공동분담 몫</dt><dd>${won(r.shared)}</dd><dt>내가 결제한 금액</dt><dd>${won(r.paid)}</dd></dl>` : '');
  const ca = $('cpAcct'); if (ca) ca.onclick = () => copy(acct.replace(/\s*\(.*\)\s*$/, ''), '계좌번호를 복사했어요');

  $('bossShow').textContent = bossName ? '총무 ' + bossName : '총무 미정';
  const vis = s.rows.filter((x) => x.mine || x.paid);
  $('tbl').innerHTML = '<tr><th>이름</th><th>내 몫</th><th>결제</th><th>보낼 돈</th><th>받을 돈</th></tr>' +
    (vis.map((x) => `<tr class="${x.id === s.bossId ? 'boss' : ''}"><td>${esc(x.n)}${x.id === s.bossId ? ' (총무)' : ''}</td><td>${won(x.mine)}</td><td>${won(x.paid)}</td><td class="${x.send ? 's' : ''}">${x.send ? won(x.send) : '-'}</td><td class="${x.recv ? 'r' : ''}">${x.recv ? won(x.recv) : '-'}</td></tr>`).join('')
      || '<tr><td colspan="5" style="text-align:center;color:var(--muted)">기록이 없어요</td></tr>');

  const lines = [`[${ym.m}월 점심 정산] 총무: ${bossName || '미정'}`, `총 ${meals.length}회 · ${won(s.total)}원`, '', '▶ 총무에게 보낼 금액',
    ...s.rows.filter((x) => x.send).map((x) => `· ${x.n} ${won(x.send)}원`)];
  const rc = s.rows.filter((x) => x.recv);
  if (rc.length) lines.push('', '▶ 총무가 돌려드릴 금액', ...rc.map((x) => `· ${x.n} ${won(x.recv)}원`));
  if (bossName) lines.push('', `송금: ${bossName} ${acct}`);
  lines.push('', '내 금액 확인: ' + location.href.split('#')[0]);
  $('kakao').textContent = lines.join('\n');
}
async function copy(t, msg) {
  try { await navigator.clipboard.writeText(t); toast(msg); }
  catch (e) {
    const r = document.createRange(); r.selectNodeContents($('kakao'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('선택됐어요. 길게 눌러 복사하세요');
  }
}
$('copyBtn').onclick = () => copy($('kakao').textContent, '공지문을 복사했어요');
$('shareBtn').onclick = async () => {
  const text = $('kakao').textContent;
  if (navigator.share) {
    try { await navigator.share({ text }); } catch (e) { if (e.name !== 'AbortError') copy(text, '공지문을 복사했어요'); }
  } else copy(text, '공유가 안 되는 기기라 복사했어요. 카톡에 붙여넣으세요');
};

// ---------------- 설정 ----------------
function renderSettings() {
  $('setBossYm').textContent = `${ym.y}년 ${ym.m}월`;
  const sel = $('bossSel'); const cur = bosses[ymKey()] ?? '';
  sel.innerHTML = '<option value="">(미정)</option>' + members.filter((m) => m.active || m.id === cur)
    .map((m) => `<option value="${m.id}" ${m.id === cur ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const list = $('memberList');
  list.replaceChildren(...members.map((m) => {
    const d = document.createElement('div'); d.className = 'mrow' + (m.active ? '' : ' off');
    d.innerHTML = `<div class="top"><input type="text" id="mn-${m.id}" value="${esc(m.name)}" aria-label="이름"></div>
      <div class="grid"><input type="text" id="mb-${m.id}" value="${esc(m.bank || '')}" placeholder="은행" aria-label="은행">
        <input type="text" id="ma-${m.id}" value="${esc(m.account || '')}" placeholder="계좌번호" aria-label="계좌번호" inputmode="text"></div>
      <div class="bot"><label class="toggle"><input type="checkbox" id="mact-${m.id}" ${m.active ? 'checked' : ''}> 참여</label>
        <label class="toggle">총무 순번 <input type="number" id="mo-${m.id}" value="${m.boss_order ?? ''}" min="1" inputmode="numeric"></label></div>`;
    const save = async (patch) => {
      const { error } = await sb.from('members').update(patch).eq('id', m.id);
      if (error) { fail(error, '명단 저장'); return loadAll(); }
      Object.assign(m, patch); toast('저장했어요', 1000);
      d.className = 'mrow' + (m.active ? '' : ' off');
      renderHeader(); renderForm(); renderList(); renderSettle(); // 설정 목록은 다시 그리지 않음 (입력 중 포커스 유지)
    };
    d.querySelector(`#mn-${m.id}`).onchange = (e) => { const v = e.target.value.trim(); if (v) save({ name: v }); else e.target.value = m.name; };
    d.querySelector(`#mb-${m.id}`).onchange = (e) => save({ bank: e.target.value.trim() || null });
    d.querySelector(`#ma-${m.id}`).onchange = (e) => save({ account: e.target.value.trim() || null });
    d.querySelector(`#mact-${m.id}`).onchange = (e) => save({ active: e.target.checked });
    d.querySelector(`#mo-${m.id}`).onchange = (e) => save({ boss_order: e.target.value ? +e.target.value : null });
    return d;
  }));
}
$('bossSel').onchange = async (e) => {
  const v = e.target.value;
  const q = v ? sb.from('bosses').upsert({ ym: ymKey(), member_id: +v }) : sb.from('bosses').delete().eq('ym', ymKey());
  const { error } = await q;
  if (error) return fail(error, '총무 저장');
  if (v) bosses[ymKey()] = +v; else delete bosses[ymKey()];
  toast('총무를 바꿨어요'); renderAll();
};
$('addMember').onclick = async () => {
  let name = '새 사람', i = 1; while (members.some((m) => m.name === name)) name = `새 사람 ${++i}`;
  const sort = Math.max(0, ...members.map((m) => m.sort)) + 1;
  const { error } = await sb.from('members').insert({ name, sort });
  if (error) return fail(error, '추가');
  await loadAll(); toast('추가했어요. 이름을 고쳐 주세요');
  const last = members.find((m) => m.name === name); if (last) $('mn-' + last.id)?.focus();
};
$('reloadBtn').onclick = () => loadAll().then(() => toast('새로 불러왔어요'));

// ---------------- 오늘 점심 신청 ----------------
async function setMe(id) {
  me = id; ls.set('lunch-me', id);
  renderRsvp(); renderSettle(); renderPush();
  // 이 휴대폰이 알림을 받고 있으면, 알림 대상 이름도 바꿔 둠
  const sub = await currentSub();
  if (sub) await sb.from('push_subs').update({ member_id: id }).eq('endpoint', sub.endpoint);
}
function renderRsvp() {
  const card = $('rsvpCard');
  const d = new Date(); const today = todayStr();
  const head = `<div class="head"><b>오늘 ${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]}) 점심 신청</b>`;
  if (!me || !memberById(me)) {
    card.innerHTML = head + '</div><div class="cap" style="font-size:13px;color:var(--muted)">먼저 내 이름을 눌러 주세요. 이 휴대폰에 기억돼요.</div><div class="chips" id="rsvpWho"></div>';
    $('rsvpWho').replaceChildren(...activeMembers().map((m) => chip(esc(m.name), false, '', () => setMe(m.id))));
    return;
  }
  const mine = rsvps.find((r) => r.member_id === me && r.date === today)?.status;
  const yes = activeMembers().filter((m) => rsvps.some((r) => r.member_id === m.id && r.status === 'yes'));
  const no = activeMembers().filter((m) => rsvps.some((r) => r.member_id === m.id && r.status === 'no'));
  const none = activeMembers().filter((m) => !rsvps.some((r) => r.member_id === m.id));
  card.innerHTML = head + `<select id="rsvpMe" aria-label="내 이름">${activeMembers().map((m) => `<option value="${m.id}" ${m.id === me ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    <div class="choice"><button type="button" class="yes ${mine === 'yes' ? 'on' : ''}" id="rsvpYes">🍚 신청</button><button type="button" class="no ${mine === 'no' ? 'on' : ''}" id="rsvpNo">미신청</button></div>
    <div class="sum"><div class="y">신청 <b>${yes.length}명</b>${yes.length ? ' · ' + yes.map((m) => esc(m.name)).join(', ') : ''}</div>
    <div>미신청 ${no.length}명${no.length ? ' · ' + no.map((m) => esc(m.name)).join(', ') : ''}</div>
    <div>아직 안 고름 ${none.length}명${none.length ? ' · ' + none.map((m) => esc(m.name)).join(', ') : ''}</div></div>
    ${yes.length ? '<button type="button" class="btn" id="rsvpFill">신청한 사람으로 오늘 기록 시작</button>' : ''}`;
  $('rsvpMe').onchange = (e) => setMe(+e.target.value);
  $('rsvpYes').onclick = () => setRsvp(mine === 'yes' ? null : 'yes');
  $('rsvpNo').onclick = () => setRsvp(mine === 'no' ? null : 'no');
  const fill = $('rsvpFill');
  if (fill) fill.onclick = () => {
    f = { ...blankForm(f), date: today, price: f.price, sel: Object.fromEntries(yes.map((m) => [m.id, f.price])) };
    renderForm(); $('fPeople').scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(`${yes.length}명을 선택했어요. 식당과 결제자만 고르세요`, 2200);
  };
}
async function setRsvp(status, date = todayStr()) {
  if (!me) { toast('먼저 내 이름을 골라 주세요'); return; }
  const before = rsvps.slice();
  rsvps = rsvps.filter((r) => !(r.member_id === me && r.date === date));
  if (status) rsvps.push({ date, member_id: me, status });
  renderRsvp();
  const q = status
    ? sb.from('rsvps').upsert({ date, member_id: me, status, updated_at: new Date().toISOString() }, { onConflict: 'date,member_id' })
    : sb.from('rsvps').delete().eq('date', date).eq('member_id', me);
  const { error } = await q;
  if (error) { rsvps = before; renderRsvp(); fail(error, '신청 저장'); return; }
  toast(status === 'yes' ? '점심 신청했어요' : status === 'no' ? '오늘은 미신청으로 표시했어요' : '선택을 취소했어요');
}
// 알림의 [신청]/[미신청] 버튼 또는 알림 클릭으로 들어온 경우
async function handleRsvpIntent(rsvp, date) {
  goTab('add'); window.scrollTo(0, 0);
  if ((rsvp === 'yes' || rsvp === 'no') && date === todayStr()) await setRsvp(rsvp, date);
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'rsvp' && !$('app').hidden) loadAll().then(() => handleRsvpIntent(e.data.rsvp, e.data.date));
  });
}

// ---------------- 알림 켜기/끄기 ----------------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
async function currentSub() {
  if (!pushSupported()) return null;
  try { const reg = await navigator.serviceWorker.getRegistration(); return reg ? await reg.pushManager.getSubscription() : null; }
  catch (e) { return null; }
}
function b64uToBytes(s) {
  const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function renderPush() {
  const on = $('pushOn'), off = $('pushOff'), st = $('pushState');
  if (!pushSupported()) {
    on.hidden = true; off.hidden = true;
    st.textContent = '이 브라우저는 지원 안 함';
    $('pushHint').textContent = isIOS() && !isStandalone()
      ? '아이폰은 사파리에서 [공유 → 홈 화면에 추가]로 설치한 뒤, 홈 화면의 앱을 열어 여기서 켜 주세요.'
      : '이 브라우저에서는 알림을 받을 수 없어요. 안드로이드는 크롬, 아이폰은 홈 화면에 추가한 앱에서 켜 주세요.';
    return;
  }
  const sub = await currentSub();
  const denied = Notification.permission === 'denied';
  st.textContent = sub ? `켜짐 (${me ? nameOf(me) : '이름 미선택'})` : denied ? '차단됨' : '꺼짐';
  on.hidden = !!sub; off.hidden = !sub;
  if (denied) $('pushHint').textContent = '알림이 차단돼 있어요. 휴대폰 설정 → 앱(또는 크롬) → 알림에서 이 사이트 알림을 허용한 뒤 다시 눌러 주세요.';
}
$('pushOn').onclick = async () => {
  if (!me) { toast('먼저 [입력] 탭에서 내 이름을 골라 주세요', 2400); goTab('add'); return; }
  if (!CFG.VAPID_PUBLIC_KEY) { toast('config.js 에 VAPID_PUBLIC_KEY 가 없어요', 2600); return; }
  $('pushOn').disabled = true;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('알림 허용을 눌러야 받을 수 있어요', 2400); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(CFG.VAPID_PUBLIC_KEY) });
    const { error } = await sb.from('push_subs').upsert({ endpoint: sub.endpoint, member_id: me, sub: sub.toJSON() }, { onConflict: 'endpoint' });
    if (error) throw error;
    toast('알림을 켰어요. 평일 아침 9시에 와요', 2200);
  } catch (e) { fail(e, '알림 켜기'); }
  finally { $('pushOn').disabled = false; renderPush(); }
};
$('pushOff').onclick = async () => {
  const sub = await currentSub();
  if (sub) {
    await sb.from('push_subs').delete().eq('endpoint', sub.endpoint);
    try { await sub.unsubscribe(); } catch (e) { /* 무시 */ }
  }
  toast('알림을 껐어요'); renderPush();
};

// ---------------- 공통 ----------------
function renderHeader() {
  $('mTitle').textContent = `${ym.y}년 ${ym.m}월 점심`;
  const s = settle();
  $('mSub').textContent = `총무 ${s.bossId ? nameOf(s.bossId) : '미정'} · ${meals.length}회 · ${won(s.total)}원`;
}
function renderAll() { renderHeader(); renderRsvp(); renderForm(); renderList(); renderSettle(); renderSettings(); renderPush(); }
function goTab(t) {
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x.dataset.tab === t));
  for (const k of ['add', 'list', 'settle', 'set']) $('tab-' + k).hidden = k !== t;
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => goTab(b.dataset.tab)));
$('prevM').onclick = () => { ym.m--; if (!ym.m) { ym.m = 12; ym.y--; } loadMonth(); };
$('nextM').onclick = () => { ym.m++; if (ym.m > 12) { ym.m = 1; ym.y++; } loadMonth(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('app').hidden && !busy) loadAll(); });

(async function start() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (/YOUR-PROJECT-ID/.test(CFG.SUPABASE_URL)) {
    showLogin(); $('loginErr').textContent = 'config.js 에 수파베이스 주소와 키를 먼저 넣어 주세요 (README 참고)'; return;
  }
  // 알림에서 들어온 경우: ?rsvp=yes|no&date=YYYY-MM-DD
  const qs = new URLSearchParams(location.search);
  pendingIntent = qs.has('rsvp') || qs.has('from') ? { rsvp: qs.get('rsvp'), date: qs.get('date') } : null;
  if (location.search) history.replaceState(null, '', location.pathname);
  const { data } = await sb.auth.getSession();
  if (data.session) { showApp(); await loadAll(); runPendingIntent(); } else showLogin();
})();
