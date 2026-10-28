// =============================================================
// js/app.js — 画面を描く
// 段階1では骨組みだけ。お客さん側の①〜⑦は段階2、教室側は段階3で作る。
// =============================================================

document.getElementById('demo-notice').textContent = DEMO_NOTICE;
document.getElementById('site-name').textContent = SCHOOL.name + ' レッスン予約';

document.getElementById('app').innerHTML =
  '<h1>準備中です</h1>' +
  '<p>予約の画面は、次の段階で作ります。</p>' +
  '<p><a href="tests/index.html">空きの計算と金額のテストを見る</a></p>';
