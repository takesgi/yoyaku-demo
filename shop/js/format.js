// =============================================================
// shop/js/format.js — 画面に出すときの書き方
// レッスン予約の js/format.js を写して、お店の文（キャンセルのきまり）を足したもの
// =============================================================

const ShopFormat = (function () {
  // 入力された文字をそのまま画面に出すときは、必ずこれを通す
  function esc(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // '09:00' → '9:00'
  function fmtTime(time) {
    return time.replace(/^0/, '');
  }

  // '2026-11-05' → '11月5日（木）'（withYear なら '2026年11月5日（木）'）
  function fmtDate(date, withYear) {
    const [y, m, d] = date.split('-').map(Number);
    const w = '日月火水木金土'[ShopAvailability.weekday(date)];
    return (withYear ? y + '年' : '') + m + '月' + d + '日（' + w + '）';
  }

  function fmtSlot(date, start, end, withYear) {
    return fmtDate(date, withYear) + ' ' + fmtTime(start) + '〜' + fmtTime(end);
  }

  // 変更・キャンセルのきまりの文（確認画面・完了画面・確認メールで使う）
  // キャンセル料ありのときは、その中身を必ず入れる
  function cancelPolicyLines(shop) {
    const c = shop.cancel;
    const lines = [
      '変更・キャンセルは、' + c.deadlineText + 'に' + c.contactText,
      '電話：' + shop.phone,
    ];
    if (c.feeEnabled) lines.push('キャンセル料：' + c.feeDetail);
    return lines;
  }

  return { esc, fmtTime, fmtDate, fmtSlot, cancelPolicyLines };
})();
