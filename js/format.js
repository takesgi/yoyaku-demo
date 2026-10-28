// =============================================================
// js/format.js — 画面に出すときの書き方（お客さん側と教室側で共通）
// =============================================================

const Format = (function () {
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
    const w = '日月火水木金土'[Availability.weekday(date)];
    return (withYear ? y + '年' : '') + m + '月' + d + '日（' + w + '）';
  }

  function fmtSlot(date, start, end, withYear) {
    return fmtDate(date, withYear) + ' ' + fmtTime(start) + '〜' + fmtTime(end);
  }

  // 場所の説明（出張は出張費、事務所は駐車場の文も）
  function placeDetail(p) {
    return [p.detail, p.feeText, p.parkingText].filter(Boolean).map(esc).join('<br>');
  }

  return { esc, fmtTime, fmtDate, fmtSlot, placeDetail };
})();
