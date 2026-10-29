// =============================================================
// shop/js/settings.js — お店の設定を確かめる・書き出す・読み込む
// 画面（shop/js/admin.js）とは分けて、テストで確かめられるようにしている。
// =============================================================

const ShopSettings = (function () {
  const FILE_FORMAT = 'ee-shop-settings'; // 書き出したファイルの目印

  const isTime = (t) => typeof t === 'string' && /^([01]\d|2[0-4]):[0-5]\d$/.test(t);
  const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  const m = (t) => ShopAvailability.toMinutes(t);

  // 設定にまちがいがないかを調べる。まちがいの文を並べて返す（なければ空の配列）
  function validate(shop) {
    const errors = [];
    const add = (text) => errors.push(text);

    if (!shop.name || !shop.name.trim()) add('店名を入れてください');
    if (!/^[A-Z]{2}$/.test(shop.bookingPrefix || '')) add('予約番号の頭は、英字の大文字2字にしてください（例 YZ）');
    if (!SHOP_COLORS.some((c) => c.id === shop.color)) add('色を5色から選んでください');

    // 営業
    let openDays = 0;
    let maxParts = 0;
    for (let w = 0; w < 7; w++) {
      const parts = shop.weeklyHours[w] || [];
      const dayName = '日月火水木金土'[w] + '曜';
      if (parts.length > 2) add(dayName + '：営業時間は1日2部までです');
      parts.forEach((p, i) => {
        if (!isTime(p.start) || !isTime(p.end) || m(p.start) >= m(p.end)) add(dayName + '：第' + (i + 1) + '部の終わりは、始まりより後にしてください');
      });
      if (parts.length === 2 && isTime(parts[0].end) && isTime(parts[1].start) && m(parts[1].start) < m(parts[0].end)) {
        add(dayName + '：第2部は、第1部が終わってから始めてください');
      }
      if (!shop.closedWeekdays.includes(w) && parts.length > 0) openDays++;
      if (!shop.closedWeekdays.includes(w)) maxParts = Math.max(maxParts, parts.length);
    }
    if (openDays === 0) add('営業する曜日が1日もありません');
    if (!Array.isArray(shop.specialClosedDates) || !shop.specialClosedDates.every(isDate)) add('臨時休業の日付の形がちがいます');

    // メニュー
    if (!shop.menus.length) add('メニューを1つ以上入れてください');
    shop.menus.forEach((x, i) => {
      const label = 'メニュー' + (i + 1) + '（' + (x.name || '名前なし') + '）';
      if (!x.name || !x.name.trim()) add('メニュー' + (i + 1) + '：名前を入れてください');
      if (!isInt(x.minutes, 15, 600)) add(label + '：所要時間を選んでください');
      if (x.price !== null && !isInt(x.price, 0, 10000000)) add(label + '：金額は0以上の整数で入れてください（金額なしは空のまま）');
      if (!Array.isArray(x.parts) || x.parts.some((p) => p >= Math.max(maxParts, 1))) add(label + '：受ける部が、営業時間にありません');
    });

    // 席・担当
    if (shop.type === 'restaurant') {
      if (!shop.seats || !shop.seats.length) add('席を1つ以上入れてください');
      (shop.seats || []).forEach((s, i) => {
        if (!s.name || !s.name.trim()) add('席' + (i + 1) + '：名前を入れてください');
        if (!SEAT_KINDS.includes(s.kind)) add('席' + (i + 1) + '：種類を選んでください');
        if (!isInt(s.capacity, 1, 20)) add('席' + (i + 1) + '：定員を選んでください');
      });
    } else {
      if (!shop.staff || !shop.staff.length) add('担当を1人以上入れてください');
      (shop.staff || []).forEach((s, i) => {
        if (!s.name || !s.name.trim()) add('担当' + (i + 1) + '：名前を入れてください');
      });
    }

    // 予約のきまり
    const r = shop.rules;
    if (!isInt(r.deadlineHours, 0, 72)) add('締め切りは0〜72時間前で選んでください');
    if (!isInt(r.maxDaysAhead, 1, 365)) add('何日先まで受けるかは1〜365日で選んでください');
    if (![15, 30, 60].includes(r.stepMinutes)) add('開始時刻の刻みは15・30・60分から選んでください');
    if (!isInt(r.cleanupMinutes, 0, 120)) add('片付けの時間は0〜120分で選んでください');

    if (!ASK_FOR_OPTIONS.some((o) => o.id === shop.askFor)) add('お客さんに聞くことを3つから選んでください');
    if (shop.cancel.feeEnabled && !(shop.cancel.feeDetail || '').trim()) add('キャンセル料ありのときは、金額や率を書いてください');

    return errors;
  }

  // 書き出すファイルの中身（JSON の文字）
  function exportText(shop) {
    return JSON.stringify({ format: FILE_FORMAT, version: SHOP_DATA_VERSION, shop }, null, 2);
  }

  // 読み込んだファイルの中身を確かめる。同じ id・同じ型のお店の設定だけを受けつける
  // 返すもの：{ ok: true, shop } か { ok: false, message }
  function importText(text, shops) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, message: 'ファイルを読めませんでした。書き出した設定のファイル（.json）を選んでください' };
    }
    if (!parsed || parsed.format !== FILE_FORMAT || !parsed.shop) {
      return { ok: false, message: 'このファイルは、お店の設定のファイルではありません' };
    }
    const shop = parsed.shop;
    const same = shops.find((s) => s.id === shop.id);
    if (!same) return { ok: false, message: '見本の2店のどちらかの設定ファイルを選んでください' };
    if (same.type !== shop.type) return { ok: false, message: '型（飲食店・サロン）がちがう設定ファイルです' };
    let errors;
    try {
      errors = validate(shop);
    } catch (e) {
      errors = ['設定の形が足りません'];
    }
    if (errors.length) return { ok: false, message: '設定にまちがいがあります：' + errors[0] };
    return { ok: true, shop };
  }

  return { validate, exportText, importText };
})();
