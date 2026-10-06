// 画面と操作
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.5 12.5 4.2 4.2 8.8-9.4"/></svg>';
  const TRASH_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.8h5V7M7 7l.8 12.2h8.4L17 7M10.3 10.5v5.5M13.7 10.5v5.5"/></svg>';
  const GRIP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';

  const state = {
    day: null,          // 表示中の「今日」
    view: 'today',
    detailKey: null,
    editing: null,      // { kind: 'item'|'routine', id }
  };

  Store.load();

  // ================= 日付の切り替え =================
  function checkDay() {
    const k = DateUtil.todayKey();
    if (k !== state.day) {
      const first = state.day === null;
      state.day = k;
      Store.ensureDay(k); // 新しい日：ルーティン＋前日の未完了でリストを作成（前日分は履歴として残る）
      const carried = Store.carryOnce(k);
      if (carried && first) setTimeout(() => toast(`前日の未完了 ${carried}件を繰り越しました`), 300);
      renderAll();
      if (!first) toast(`${DateUtil.shortLabel(k)}のリストを始めました`);
      return true;
    }
    return false;
  }

  // ================= 今日 =================
  function itemHtml(item, readonly) {
    let tag = item.source === 'routine' ? '<span class="tag">毎日</span>' : '';
    if (item.source === 'carry' && item.carriedFrom) {
      const p = DateUtil.parts(item.carriedFrom);
      tag = `<span class="tag carry">繰越 ${p.m}/${p.d}〜</span>`;
    }
    const when = item.done && item.completedAt ? `<span class="when">${DateUtil.timeLabel(item.completedAt)} 完了</span>` : '';
    const handle = !readonly && !item.done ? '<span class="handle" aria-hidden="true">' + GRIP_SVG + '</span>' : '';
    return `<li class="item${item.done ? ' is-done' : ''}" data-id="${item.id}">
      <button type="button" class="check" ${readonly ? 'tabindex="-1" aria-disabled="true"' : ''}
        aria-pressed="${item.done}" aria-label="${item.done ? '未完了に戻す' : '完了にする'}：${esc(item.text)}">
        <span class="box">${CHECK_SVG}</span></button>
      <button type="button" class="text" ${readonly ? 'tabindex="-1"' : ''}><span class="text-main">${esc(item.text)}</span>${tag}${when}</button>
      ${readonly ? '' : `<button type="button" class="del-btn" aria-label="削除：${esc(item.text)}">${TRASH_SVG}</button>`}
      ${handle}
    </li>`;
  }

  function renderToday(flashId) {
    const k = state.day;
    $('#today-date').textContent = DateUtil.label(k);
    const { open, done } = Store.sortedItems(k);
    $('#open-list').innerHTML = open.map((i) => itemHtml(i)).join('');
    $('#done-list').innerHTML = done.map((i) => itemHtml(i)).join('');
    const total = open.length + done.length;
    $('#empty-today').hidden = total > 0;
    $('#done-sep').hidden = done.length === 0;
    $('#done-count').textContent = done.length;
    $('#today-count').textContent = `${done.length} / ${total} 完了`;
    $('#today-bar').style.width = total ? `${(done.length / total) * 100}%` : '0';
    if (flashId) {
      const el = document.querySelector(`#view-today .item[data-id="${flashId}"]`);
      if (el) { el.classList.add('flash'); }
    }
  }

  function onListClick(e) {
    const li = e.target.closest('.item');
    if (!li || e.target.closest('.handle') || dragJustEnded) return;
    checkDay();
    const id = li.dataset.id;
    if (e.target.closest('.del-btn')) {
      // その場で削除し、数秒間だけ「元に戻す」を出す
      const day = state.day;
      const removed = Store.deleteItem(day, id);
      if (!removed) return;
      li.classList.add('removing');
      setTimeout(() => renderToday(), 160);
      toast(`削除しました：${removed.text}`, 5000, {
        label: '元に戻す',
        fn: () => { if (Store.restoreItem(day, removed) && day === state.day) renderToday(removed.id); },
      });
      return;
    }
    if (e.target.closest('.check')) {
      const item = Store.toggle(state.day, id);
      renderToday(item && item.id);
    } else if (e.target.closest('.text')) {
      const item = Store.findItem(state.day, id);
      if (item) openEdit('item', item.id, item.text);
    }
  }
  $('#open-list').addEventListener('click', onListClick);
  $('#done-list').addEventListener('click', onListClick);

  // ---- 並べ替え（右端のつまみを押したまま上下に動かす） ----
  const openList = $('#open-list');
  let drag = null;
  let dragJustEnded = false;

  openList.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.handle');
    if (!h || drag) return;
    e.preventDefault();
    checkDay();
    const li = h.closest('.item');
    const items = [...openList.children];
    drag = {
      li, pid: e.pointerId, items,
      from: items.indexOf(li), to: items.indexOf(li),
      startY: e.clientY, lastY: e.clientY, startScroll: window.scrollY,
      rects: items.map((el) => { const r = el.getBoundingClientRect(); return { top: r.top + window.scrollY, h: r.height }; }),
      raf: 0,
    };
    try { h.setPointerCapture(e.pointerId); } catch (err) {}
    openList.classList.add('sorting');
    document.body.classList.add('is-sorting');
    li.classList.add('dragging');
    if (navigator.vibrate) navigator.vibrate(10);
    autoScroll();
  });

  function layoutDrag() {
    const d = drag;
    const dy = d.lastY - d.startY + (window.scrollY - d.startScroll);
    const me = d.rects[d.from];
    const center = me.top + me.h / 2 + dy;
    // 指の位置から、新しい順番を決める
    let to = 0;
    d.rects.forEach((r, i) => { if (i !== d.from && center > r.top + r.h / 2) to++; });
    d.to = to;
    d.items.forEach((el, i) => {
      if (i === d.from) { el.style.transform = `translateY(${dy}px)`; return; }
      let shift = 0;
      if (d.from < to && i > d.from && i <= to) shift = -me.h;
      if (d.from > to && i < d.from && i >= to) shift = me.h;
      el.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }
  // 画面の端に近づいたら自動でスクロール
  function autoScroll() {
    if (!drag) return;
    const topEdge = 90;
    const bottomEdge = window.innerHeight - 160;
    let v = 0;
    if (drag.lastY < topEdge) v = -Math.ceil((topEdge - drag.lastY) / 8);
    else if (drag.lastY > bottomEdge) v = Math.ceil((drag.lastY - bottomEdge) / 8);
    if (v) { window.scrollBy(0, v); layoutDrag(); }
    drag.raf = requestAnimationFrame(autoScroll);
  }
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    e.preventDefault();
    drag.lastY = e.clientY;
    layoutDrag();
  }, { passive: false });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.pid)) return;
    const d = drag; drag = null;
    cancelAnimationFrame(d.raf);
    d.items.forEach((el) => { el.style.transform = ''; });
    openList.classList.remove('sorting');
    document.body.classList.remove('is-sorting');
    d.li.classList.remove('dragging');
    if (d.to !== d.from) {
      const ids = d.items.map((el) => el.dataset.id);
      const [moved] = ids.splice(d.from, 1);
      ids.splice(d.to, 0, moved);
      Store.reorder(state.day, ids);
      renderToday(moved);
    }
    // 指を動かしたときだけ、直後のタップを少しだけ無視する（誤タップ防止）
    if (Math.abs(d.lastY - d.startY) > 6) { dragJustEnded = true; setTimeout(() => { dragJustEnded = false; }, 150); }
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  // iOSで、つまみを触っている間に画面がスクロールしないようにする
  openList.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });

  // ---- キーボード追加 ----
  const addInput = $('#add-input');
  addInput.addEventListener('input', () => { $('#add-btn').hidden = !addInput.value.trim(); });
  $('#add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    checkDay();
    const item = Store.addItem(state.day, addInput.value, 'keyboard');
    if (item) {
      addInput.value = '';
      $('#add-btn').hidden = true;
      renderToday(item.id);
      scrollToItem(item.id);
    }
  });

  function scrollToItem(id) {
    const el = document.querySelector(`#view-today .item[data-id="${id}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ================= 音声入力 =================
  const voiceSheet = $('#voice-sheet');
  let voiceErr = false;

  function closeVoice() { voiceSheet.hidden = true; }
  function fallbackToKeyboard(msg) {
    closeVoice();
    toast(msg, 4500);
    addInput.focus();
  }

  $('#mic-btn').addEventListener('click', () => {
    checkDay();
    if (!Speech.supported) { fallbackToKeyboard(Speech.errorMessage('unsupported')); return; }
    voiceErr = false;
    $('#voice-text').textContent = '';
    $('#voice-status').textContent = '聞いています…';
    voiceSheet.hidden = false;
    Speech.start({
      onInterim: (t) => { $('#voice-text').textContent = t; },
      onFinal: (t) => {
        const item = Store.addItem(state.day, t, 'voice');
        closeVoice();
        if (item) { renderToday(item.id); scrollToItem(item.id); toast(`追加しました：${item.text}`); }
      },
      onError: (code) => {
        if (code === 'aborted') return;
        voiceErr = true;
        const msg = Speech.errorMessage(code);
        if (code === 'no-speech') { closeVoice(); toast(msg); }
        else fallbackToKeyboard(msg);
      },
      onEnd: (t) => {
        if (!t && !voiceErr && !voiceSheet.hidden) { closeVoice(); toast('聞き取れませんでした。もう一度どうぞ。'); }
      },
    });
  });
  $('#voice-done').addEventListener('click', () => { $('#voice-status').textContent = '確定中…'; Speech.finish(); });
  $('#voice-cancel').addEventListener('click', () => { voiceErr = true; Speech.stop(); closeVoice(); });

  // ================= 編集シート（To Do・ルーティン共通） =================
  const editSheet = $('#edit-sheet');
  const editInput = $('#edit-input');
  const delBtn = $('#edit-delete');

  const timeRow = $('#edit-time-row');
  const timeInput = $('#edit-time');

  function openEdit(kind, id, text) {
    state.editing = { kind, id };
    const item = kind === 'item' ? Store.findItem(state.day, id) : null;
    const showTime = !!(item && item.done && item.completedAt);
    timeRow.hidden = !showTime;
    timeInput.value = showTime ? DateUtil.timeLabel(item.completedAt) : '';
    $('#edit-title').textContent = kind === 'routine' ? 'ルーティンを編集' : 'To Doを編集';
    editInput.value = text;
    disarm(delBtn, '削除');
    editSheet.hidden = false;
    editInput.focus();
    const n = editInput.value.length; editInput.setSelectionRange(n, n);
  }
  function closeEdit() { editSheet.hidden = true; state.editing = null; }

  $('#edit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const ed = state.editing; if (!ed) return;
    const text = editInput.value;
    if (!text.trim()) { toast('内容が空です'); return; }
    if (ed.kind === 'item') {
      Store.updateText(state.day, ed.id, text);
      if (!timeRow.hidden && /^\d{2}:\d{2}$/.test(timeInput.value)) {
        Store.setCompletedAt(state.day, ed.id, DateUtil.isoAt(state.day, timeInput.value));
      }
      renderToday(ed.id);
    }
    else { Store.updateRoutine(ed.id, text); renderSettings(); }
    closeEdit();
  });
  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#edit-form').requestSubmit(); }
  });
  $('#edit-cancel').addEventListener('click', closeEdit);
  editSheet.addEventListener('click', (e) => { if (e.target === editSheet) closeEdit(); });
  delBtn.addEventListener('click', () => {
    const ed = state.editing; if (!ed) return;
    if (!delBtn.classList.contains('armed')) { arm(delBtn, 'もう一度押すと削除'); return; }
    if (ed.kind === 'item') { Store.deleteItem(state.day, ed.id); renderToday(); }
    else { Store.deleteRoutine(ed.id); renderSettings(); }
    closeEdit();
    toast('削除しました');
  });

  // 2回押しの確認（ダイアログを使わない）
  function arm(btn, label) {
    btn.classList.add('armed'); btn.dataset.label = btn.dataset.label || btn.textContent; btn.textContent = label;
    clearTimeout(btn._t); btn._t = setTimeout(() => disarm(btn), 3500);
  }
  function disarm(btn, label) {
    btn.classList.remove('armed'); clearTimeout(btn._t);
    if (label || btn.dataset.label) btn.textContent = label || btn.dataset.label;
  }

  // ================= 履歴 =================
  function renderHistory() {
    const keys = Store.historyKeys(state.day);
    $('#empty-history').hidden = keys.length > 0;
    $('#history-list').innerHTML = keys.map((k) => {
      const items = Store.getDay(k).items;
      const done = items.filter((i) => i.done).length;
      const p = items.length ? Math.round((done / items.length) * 100) : 0;
      return `<li><button type="button" data-key="${k}">
        <span class="h-ring" style="--p:${p}" aria-hidden="true"></span>
        <span class="h-date">${DateUtil.shortLabel(k)}</span>
        <span class="h-meta">${done} / ${items.length} 完了</span>
        <span class="chev" aria-hidden="true">›</span></button></li>`;
    }).join('');
  }
  $('#history-list').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-key]');
    if (b) { state.detailKey = b.dataset.key; show('history-detail'); }
  });
  function renderDetail() {
    const k = state.detailKey;
    const { open, done } = Store.sortedItems(k);
    $('#detail-date').textContent = DateUtil.label(k);
    const total = open.length + done.length;
    $('#detail-summary').textContent = total ? `${total}件中 ${done.length}件完了・未完了 ${open.length}件` : 'この日の項目はありません';
    $('#detail-open').innerHTML = open.map((i) => itemHtml(i, true)).join('');
    $('#detail-done').innerHTML = done.map((i) => itemHtml(i, true)).join('');
    $('#detail-sep').hidden = done.length === 0;
    $('#detail-done-count').textContent = done.length;
  }
  $('#back-btn').addEventListener('click', () => show('history'));

  // ================= 設定（ルーティン） =================
  const ICON_UP = '<svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>';
  const ICON_DOWN = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
  const ICON_DEL = '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.8h5V7M7 7l.8 12.2h8.4L17 7"/></svg>';

  function renderSettings() {
    const list = Store.routines();
    $('#empty-routines').hidden = list.length > 0;
    $('#routine-list').innerHTML = list.map((r, i) => `
      <li class="r-item" data-id="${r.id}">
        <button type="button" class="r-text" aria-label="編集：${esc(r.text)}">${esc(r.text)}</button>
        <button type="button" class="icon-btn" data-act="up" aria-label="上へ" ${i === 0 ? 'disabled' : ''}>${ICON_UP}</button>
        <button type="button" class="icon-btn" data-act="down" aria-label="下へ" ${i === list.length - 1 ? 'disabled' : ''}>${ICON_DOWN}</button>
        <button type="button" class="icon-btn del" data-act="del" aria-label="削除">${ICON_DEL}</button>
      </li>`).join('');
    $('#apply-routines').hidden = list.length === 0;
    $('#carry-toggle').checked = Store.carryEnabled();
  }
  $('#carry-toggle').addEventListener('change', (e) => {
    Store.setCarryEnabled(e.target.checked);
    toast(e.target.checked ? '未完了を翌日に繰り越します' : '繰り越しをオフにしました');
  });
  $('#routine-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#routine-input');
    const r = Store.addRoutine(inp.value);
    if (r) { inp.value = ''; renderSettings(); toast(`「${r.text}」を登録しました（明日から自動で入ります）`); }
  });
  $('#routine-list').addEventListener('click', (e) => {
    const li = e.target.closest('.r-item'); if (!li) return;
    const id = li.dataset.id;
    const btn = e.target.closest('button'); if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'up') { Store.moveRoutine(id, -1); renderSettings(); }
    else if (act === 'down') { Store.moveRoutine(id, 1); renderSettings(); }
    else if (act === 'del') {
      if (!btn.classList.contains('armed')) {
        btn.classList.add('armed'); btn.style.color = '#fff'; btn.style.background = 'var(--danger)';
        toast('もう一度押すと削除します', 2500);
        setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.style.color = ''; btn.style.background = ''; } }, 3000);
        return;
      }
      Store.deleteRoutine(id); renderSettings(); toast('ルーティンを削除しました');
    } else if (btn.classList.contains('r-text')) {
      const r = Store.routines().find((x) => x.id === id);
      if (r) openEdit('routine', r.id, r.text);
    }
  });
  $('#apply-routines').addEventListener('click', () => {
    checkDay();
    const n = Store.applyRoutinesTo(state.day);
    renderToday();
    toast(n ? `今日のリストに${n}件追加しました` : '今日のリストにはすべて入っています');
  });

  // ---- バックアップ ----
  $('#export-btn').addEventListener('click', async () => {
    const json = Store.exportJson();
    const area = $('#export-area');
    area.value = json; area.hidden = false;
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `todo-backup-${state.day}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { /* ダウンロード不可の環境では下のテキストを使う */ }
    try { await navigator.clipboard.writeText(json); toast('書き出しました（コピーもしました）'); }
    catch (e) { area.select(); toast('書き出しました'); }
  });
  $('#import-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      Store.importJson(await f.text());
      state.day = null; checkDay(); renderAll();
      toast('バックアップを読み込みました');
    } catch (err) { toast('読み込めませんでした：' + err.message, 4000); }
    e.target.value = '';
  });

  // ================= 画面切り替え =================
  function show(view) {
    state.view = view;
    document.body.dataset.view = view === 'today' ? 'today' : 'other';
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
    const tab = view === 'history-detail' ? 'history' : view;
    document.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.go === tab) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (view === 'today') renderToday();
    if (view === 'history') renderHistory();
    if (view === 'history-detail') renderDetail();
    if (view === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { checkDay(); show(t.dataset.go); }));

  function renderAll() {
    renderToday();
    if (state.view === 'history') renderHistory();
    if (state.view === 'history-detail') renderDetail();
    if (state.view === 'settings') renderSettings();
  }

  // ================= トースト =================
  let toastT;
  function toast(msg, ms = 2400, action) {
    const t = $('#toast');
    t.textContent = '';
    const span = document.createElement('span');
    span.className = 'toast-msg'; span.textContent = msg;
    t.appendChild(span);
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'toast-action'; b.textContent = action.label;
      b.addEventListener('click', () => { t.hidden = true; clearTimeout(toastT); action.fn(); });
      t.appendChild(b);
    }
    t.classList.toggle('has-action', !!action);
    t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ================= 起動 =================
  checkDay();
  show('today');
  // 24時をまたいだら自動で新しい日へ（開いたまま・バックグラウンド復帰の両方に対応）
  setInterval(checkDay, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
  window.addEventListener('focus', checkDay);
  window.addEventListener('pageshow', checkDay);

  // データが消えにくいよう永続化を依頼
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  // オフライン対応（ホーム画面アプリ用）
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // テスト・デバッグ用
  window.__app = { state, checkDay, renderAll };
})();
