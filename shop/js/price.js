// =============================================================
// shop/js/price.js — 金額の計算と書き方（この1か所だけに書く）
// レッスン予約の js/price.js を写したもの。書き方は「1,200円（税込1,320円）」
// =============================================================

const ShopPrice = (function () {
  // 税込みの金額（1円未満は切り捨て。小数の誤差が出ないよう整数でかけてから割る）
  function withTax(amount) {
    return Math.floor(amount * (100 + SHOP_COMMON.taxPercent) / 100);
  }

  function yen(amount) {
    return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円';
  }

  // 1200 → '1,200円（税込1,320円）'
  function format(amount) {
    return yen(amount) + '（税込' + yen(withTax(amount)) + '）';
  }

  // メニューの金額。金額なし（席のみなど）は空の文字
  function formatMenu(menu) {
    return menu.price === null ? '' : format(menu.price);
  }

  return { withTax, yen, format, formatMenu };
})();
