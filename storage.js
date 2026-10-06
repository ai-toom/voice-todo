// データ層：画面(app.js)はここの関数だけを使う。
// 保存先(adapter)を差し替えれば、将来 iCloud・クラウドDB 等へ移行できる。
(function (global) {
  const STORAGE_KEY = 'voiceTodo.v1';
  const SCHEMA_VERSION = 1;

  // ---- 保存先アダプタ（現在は端末内 localStorage） ----
  const LocalAdapter = {
    read() {
      try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : null; }
      catch (e) { console.warn('read failed', e); return null; }
    },
    write(data) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
      catch (e) { console.warn('write failed', e); return false; }
    },
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const nowIso = () => new Date().toISOString();

  function emptyData() {
    return { schemaVersion: SCHEMA_VERSION, days: {}, routines: [], settings: {} };
  }

  /*
   データ構造
   days[YYYY-MM-DD] = { date, createdAt, items: [Item] }
   Item = {
     id, text, done, createdAt, completedAt, date, order,
     source: 'keyboard' | 'voice' | 'routine' | 'carry',
     routineId,         // ルーティン由来なら元のID
     carriedFrom: null, // 繰り越し項目なら、最初に登録された日付
     carriedFromId,     // 繰り越し元（前日）の項目ID
   }
   routines = [{ id, text, order, createdAt }]
  */

  let adapter = LocalAdapter;
  let data = null;

  const Store = {
    useAdapter(a) { adapter = a; data = null; },

    load() {
      const raw = adapter.read();
      data = raw && raw.days ? raw : emptyData();
      data.routines = data.routines || [];
      data.settings = data.settings || {};
      return data;
    },
    save() { return adapter.write(data); },
    get data() { if (!data) this.load(); return data; },

    // ---- 日 ----
    hasDay(key) { return !!this.data.days[key]; },
    ensureDay(key) {
      const d = this.data;
      if (!d.days[key]) {
        d.days[key] = { date: key, createdAt: nowIso(), items: [] };
        // 新しい日：ルーティンを未完了状態で自動追加
        d.routines.slice().sort((a, b) => a.order - b.order)
          .forEach((r) => this._push(key, r.text, 'routine', r.id));
        // その下に、前日の未完了を繰り越す
        if (this.carryEnabled()) this._carryInto(key);
        d.days[key].carryChecked = true;
        this.save();
      }
      return d.days[key];
    },

    // ---- 繰り越し ----
    carryEnabled() { return this.data.settings.carryOver !== false; },
    setCarryEnabled(on) { this.data.settings.carryOver = !!on; this.save(); },

    // 繰り越し機能ができる前に作られた「今日」に、一度だけ繰り越しを行う
    carryOnce(key) {
      const day = this.getDay(key);
      if (!day || day.carryChecked) return 0;
      day.carryChecked = true;
      const n = this.carryEnabled() ? this._carryInto(key) : 0;
      this.save();
      return n;
    },

    // 直前の日（アプリを開かなかった日があれば、最後に使った日）の未完了を key の日へ
    // ルーティン由来の項目は毎日自動で入るので繰り越さない
    _carryInto(key) {
      const d = this.data;
      const prevKey = Object.keys(d.days).filter((k) => k < key).sort().pop();
      if (!prevKey) return 0;
      const day = d.days[key];
      const prev = d.days[prevKey].items
        .filter((i) => !i.done && i.source !== 'routine')
        .sort((a, b) => a.order - b.order);
      const haveIds = new Set(day.items.map((i) => i.carriedFromId).filter(Boolean));
      const haveText = new Set(day.items.filter((i) => !i.done).map((i) => i.text));
      let n = 0;
      prev.forEach((p) => {
        if (haveIds.has(p.id) || haveText.has(p.text)) return;
        const it = this._push(key, p.text, 'carry');
        it.carriedFrom = p.carriedFrom || prevKey;
        it.carriedFromId = p.id;
        n++;
      });
      if (n) {
        // 並び：ルーティン → 繰り越し → その日に追加した項目
        const rank = (i) => (i.source === 'routine' ? 0 : i.source === 'carry' ? 1 : 2);
        day.items.slice()
          .sort((a, b) => rank(a) - rank(b) || a.order - b.order)
          .forEach((i, idx) => { i.order = idx + 1; });
      }
      return n;
    },
    getDay(key) { return this.data.days[key] || null; },

    // 未完了 → 上（追加順）、完了 → 下（完了した順。最後に完了したものが一番下）
    sortedItems(key) {
      const day = this.getDay(key);
      if (!day) return { open: [], done: [] };
      const open = day.items.filter((i) => !i.done).sort((a, b) => a.order - b.order);
      const done = day.items.filter((i) => i.done)
        .sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || ''));
      return { open, done };
    },

    // 履歴：今日以外の日付（新しい順）
    historyKeys(todayKey) {
      return Object.keys(this.data.days).filter((k) => k !== todayKey).sort().reverse();
    },

    // ---- To Do 項目 ----
    _push(key, text, source, routineId) {
      const day = this.data.days[key];
      const maxOrder = day.items.reduce((m, i) => Math.max(m, i.order || 0), 0);
      const item = {
        id: uid(), text, done: false, createdAt: nowIso(), completedAt: null,
        date: key, order: maxOrder + 1, source, routineId: routineId || null, carriedFrom: null,
      };
      day.items.push(item);
      return item;
    },
    addItem(key, text, source = 'keyboard') {
      text = (text || '').trim();
      if (!text) return null;
      this.ensureDay(key);
      const item = this._push(key, text, source);
      this.save();
      return item;
    },
    findItem(key, id) {
      const day = this.getDay(key);
      return day ? day.items.find((i) => i.id === id) : null;
    },
    updateText(key, id, text) {
      const item = this.findItem(key, id);
      text = (text || '').trim();
      if (!item || !text) return false;
      item.text = text;
      this.save();
      return true;
    },
    toggle(key, id) {
      const item = this.findItem(key, id);
      if (!item) return null;
      item.done = !item.done;
      item.completedAt = item.done ? nowIso() : null;
      this.save();
      return item;
    },
    // 未完了リストの並べ替え（ids は新しい順番）。
    // 既存の order の値を使い回すので、完了済み項目を戻したときの位置関係は保たれる。
    reorder(key, ids) {
      const day = this.getDay(key);
      if (!day) return false;
      const items = ids.map((id) => day.items.find((i) => i.id === id)).filter(Boolean);
      const slots = items.map((i) => i.order).sort((a, b) => a - b);
      items.forEach((it, n) => { it.order = slots[n]; });
      this.save();
      return true;
    },
    setCompletedAt(key, id, iso) {
      const item = this.findItem(key, id);
      if (!item || !item.done || !iso) return false;
      item.completedAt = iso;
      this.save();
      return true;
    },
    // 削除した項目を返す（「元に戻す」用）
    deleteItem(key, id) {
      const day = this.getDay(key);
      if (!day) return null;
      const item = day.items.find((i) => i.id === id);
      if (!item) return null;
      day.items = day.items.filter((i) => i.id !== id);
      this.save();
      return item;
    },
    // 削除を取り消す（並び順・完了状態もそのまま戻る）
    restoreItem(key, item) {
      const day = this.getDay(key);
      if (!day || !item || day.items.some((i) => i.id === item.id)) return false;
      day.items.push(item);
      this.save();
      return true;
    },

    // ---- ルーティン ----
    routines() { return this.data.routines.slice().sort((a, b) => a.order - b.order); },
    addRoutine(text) {
      text = (text || '').trim();
      if (!text) return null;
      const max = this.data.routines.reduce((m, r) => Math.max(m, r.order || 0), 0);
      const r = { id: uid(), text, order: max + 1, createdAt: nowIso() };
      this.data.routines.push(r);
      this.save();
      return r;
    },
    updateRoutine(id, text) {
      const r = this.data.routines.find((x) => x.id === id);
      text = (text || '').trim();
      if (!r || !text) return false;
      r.text = text;
      this.save();
      return true;
    },
    deleteRoutine(id) {
      this.data.routines = this.data.routines.filter((r) => r.id !== id);
      this.save();
    },
    moveRoutine(id, dir) {
      const list = this.routines();
      const i = list.findIndex((r) => r.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      const tmp = list[i].order; list[i].order = list[j].order; list[j].order = tmp;
      this.save();
    },
    // 今日のリストに、まだ入っていないルーティンを追加（途中登録したとき用）
    applyRoutinesTo(key) {
      this.ensureDay(key);
      const day = this.data.days[key];
      const have = new Set(day.items.map((i) => i.routineId).filter(Boolean));
      let added = 0;
      this.routines().forEach((r) => {
        if (!have.has(r.id)) { this._push(key, r.text, 'routine', r.id); added++; }
      });
      this.save();
      return added;
    },

    // ---- バックアップ ----
    exportJson() { return JSON.stringify(this.data, null, 2); },
    importJson(text) {
      const obj = JSON.parse(text);
      if (!obj || typeof obj !== 'object' || !obj.days) throw new Error('形式が正しくありません');
      data = obj;
      data.routines = data.routines || [];
      data.settings = data.settings || {};
      this.save();
    },
  };

  global.Store = Store;
})(window);
