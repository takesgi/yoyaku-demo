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

  // 1名あたりと、人数をかけた合計（飲食店）
  // 5000, 2 → '1名 5,000円（税込5,500円）× 2名＝合計 10,000円（税込11,000円）'
  function formatPerPersonTotal(price, partySize) {
    return '1名 ' + format(price) + '× ' + partySize + '名＝合計 ' + format(price * partySize);
  }

  // 飲食店のメニューの金額。人数がまだなら1名あたりだけ。金額なしは空の文字
  function formatMenuFor(shop, menu, partySize) {
    if (menu.price === null) return '';
    if (shop.type !== 'restaurant') return format(menu.price);
    return partySize ? formatPerPersonTotal(menu.price, partySize) : '1名 ' + format(menu.price);
  }

  return { withTax, yen, format, formatMenu, formatPerPersonTotal, formatMenuFor };
})();
