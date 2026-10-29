// =============================================================
// shop/js/app.js — 画面を描く
// 段階1では骨組みだけ（見本の2店を並べる）。お客さん側は段階2、お店側の設定は段階3で作る。
// =============================================================

(function () {
  const { esc, fmtTime } = ShopFormat;
  const data = ShopStore.load(new Date()); // 見本データがなければ作る

  document.getElementById('demo-notice').textContent = SHOP_COMMON.demoNotice;

  const typeName = { restaurant: '飲食店の型', salon: 'サロンの型' };
  const cards = data.shops.map((shop) => {
    const hours = shop.weeklyHours[1]
      .map((p, i) => (shop.partNames[i] ? shop.partNames[i] + ' ' : '') + fmtTime(p.start) + '〜' + fmtTime(p.end))
      .join('／');
    const count = data.records[shop.id].bookings.length;
    return '<section class="shop-card">' +
      '<h2>' + esc(shop.name) + '</h2>' +
      '<p class="sub">' + typeName[shop.type] + '　' + esc(hours) + '　見本の予約 ' + count + '件</p>' +
      '</section>';
  }).join('');

  document.getElementById('app').innerHTML =
    '<h1>準備中です</h1>' +
    '<p>お客さん側の予約の画面は次の段階で、お店の設定の画面はその次の段階で作ります。</p>' +
    '<div class="shop-cards">' + cards + '</div>' +
    '<p class="section"><a href="tests/index.html">お店の空きの計算と金額のテストを見る</a></p>';
})();
