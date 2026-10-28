// =============================================================
// js/price.js — 金額の計算と書き方（この1か所だけに書く）
// 書き方は「2,000円（税込2,200円）」にそろえる。
// 使うデータ：js/data.js（RULES.taxPercent・COURSES・TICKETS）
// =============================================================

const Price = (function () {
  // 税込みの金額（1円未満は切り捨て）
  // 小数のかけ算で誤差が出ないよう、先に整数でかけてから割る
  function withTax(amount) {
    return Math.floor(amount * (100 + RULES.taxPercent) / 100);
  }

  // 2000 → '2,000円'
  function yen(amount) {
    return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円';
  }

  // 2000 → '2,000円（税込2,200円）'
  function format(amount) {
    return yen(amount) + '（税込' + yen(withTax(amount)) + '）';
  }

  // 講座の1回の金額。無料の講座は「無料（初回のみ）」
  function formatCourse(course) {
    if (course.price === 0) return course.freeLabel;
    return format(course.price);
  }

  // チケット：'初級 5回分 10,000円（税込11,000円）'
  function formatTicket(ticket) {
    const course = COURSES.find((c) => c.id === ticket.courseId);
    return course.name + ' ' + ticket.count + '回分 ' + format(ticket.price);
  }

  return { withTax, yen, format, formatCourse, formatTicket };
})();
