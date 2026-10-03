// 日付ユーティリティ（日本時間 Asia/Tokyo 基準）
(function (global) {
  const TZ = 'Asia/Tokyo';
  const keyFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  const timeFmt = new Intl.DateTimeFormat('ja-JP', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  });

  // テスト用に「現在時刻」を差し替えられるようにしておく
  let nowFn = () => new Date();

  const DateUtil = {
    TZ,
    now() { return nowFn(); },
    setNow(fn) { nowFn = fn || (() => new Date()); },

    // 'YYYY-MM-DD'（日本時間）
    todayKey() { return keyFmt.format(nowFn()); },
    keyOf(date) { return keyFmt.format(date); },

    // 'YYYY-MM-DD' → { y, m, d, w }
    parts(key) {
      const [y, m, d] = key.split('-').map(Number);
      const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      return { y, m, d, w };
    },
    // 2026年10月03日（土）
    label(key) {
      const p = this.parts(key);
      return `${p.y}年${String(p.m).padStart(2, '0')}月${String(p.d).padStart(2, '0')}日（${WEEK[p.w]}）`;
    },
    // 10月3日（土）
    shortLabel(key) {
      const p = this.parts(key);
      return `${p.m}月${p.d}日（${WEEK[p.w]}）`;
    },
    weekday(key) { return WEEK[this.parts(key).w]; },

    // ISO日時 → 'HH:MM'（日本時間）
    timeLabel(iso) { return iso ? timeFmt.format(new Date(iso)) : ''; },
    // 'YYYY-MM-DD' と 'HH:MM'（日本時間）→ ISO日時
    isoAt(key, hhmm) { return new Date(`${key}T${hhmm}:00+09:00`).toISOString(); },
  };

  global.DateUtil = DateUtil;
})(window);
