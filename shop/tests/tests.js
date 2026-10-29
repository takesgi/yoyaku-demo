// =============================================================
// shop/tests/tests.js — ブラウザで開くと結果が出るテスト
// 「今の日時」とお店の設定は全部ここで決めて渡す。保存データ（localStorage）は使わない。
// =============================================================

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, message: e.message });
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + '：期待 ' + JSON.stringify(expected) + ' ／ 実際 ' + JSON.stringify(actual));
  }
}

function jst(text) {
  return new Date(text.replace(' ', 'T') + ':00+09:00');
}

// 見本のお店の設定を写して使う（changes で一部を書きかえられる）
function shopOf(id, changes) {
  const shop = JSON.parse(JSON.stringify(SAMPLE_SHOPS.find((s) => s.id === id)));
  return Object.assign(shop, changes || {});
}

function empty() {
  return { bookings: [], blocks: [] };
}

// 予約を1件入れる（空きの確かめつき。入らなければテストを止める）
function book(shop, records, draft, now) {
  const r = ShopStore.addBooking(shop, records, { name: '見本（見本）', phone: '', ...draft }, now || NOW);
  if (!r.ok) throw new Error('予約が入りませんでした：' + JSON.stringify(draft));
  return r.booking;
}

function slotsOf(shop, condition, now) {
  return ShopAvailability.getAvailability(shop, condition, now || NOW).days[0];
}

function slotAt(day, start) {
  const s = day.slots.find((x) => x.start === start);
  if (!s) throw new Error(start + ' の枠がありません');
  return s;
}

// 基準の「今」：2026-11-04（水）9:00 日本時間
// 11/4 水＝ゆずり葉の定休日、11/5 木＝こもれびの森さんのお休み、11/6 金＝全員出勤
const NOW = jst('2026-11-04 09:00');

// ---------- 指示書のテスト ----------

test('4名は2名用の席に入らない', () => {
  const shop = shopOf('yuzuriha', {
    seats: [
      { id: 'a', name: '2名席', kind: 'テーブル', capacity: 2 },
      { id: 'b', name: '4名席', kind: 'テーブル', capacity: 4 },
    ],
  });
  const records = empty();
  const four = { menuId: 'lunch', partySize: 4, seatKind: 'any', date: '2026-11-05', records };
  assertEqual(slotAt(slotsOf(shop, four), '12:00').resourceId, 'b', '4名が入る席');
  book(shop, records, { date: '2026-11-05', start: '12:00', menuId: 'lunch', partySize: 4, seatKind: 'any' });
  assertEqual(slotAt(slotsOf(shop, four), '12:00').reasonText, '満席', '4名席がふさがったあとの4名');
  const two = { menuId: 'lunch', partySize: 2, seatKind: 'any', date: '2026-11-05', records };
  assertEqual(slotAt(slotsOf(shop, two), '12:00').resourceId, 'a', '2名なら2名席に入る');
});

test('6名は個室だけになる', () => {
  const shop = shopOf('yuzuriha');
  const records = empty();
  const six = { menuId: 'lunch', partySize: 6, seatKind: 'any', date: '2026-11-05', records };
  assertEqual(slotAt(slotsOf(shop, six), '12:00').resourceId, 'r1', '6名の席');
  book(shop, records, { date: '2026-11-05', start: '12:00', menuId: 'lunch', partySize: 6, seatKind: 'any' });
  assertEqual(slotAt(slotsOf(shop, six), '12:00').reasonText, '満席', '個室がふさがったあとの6名');
  const four = { menuId: 'lunch', partySize: 4, seatKind: 'any', date: '2026-11-05', records };
  assertEqual(slotAt(slotsOf(shop, four), '12:00').available, true, '4名はテーブルに入れる');
  const seven = { menuId: 'lunch', partySize: 7, seatKind: 'any', date: '2026-11-05', records };
  assertEqual(slotAt(slotsOf(shop, seven), '12:00').reasonText, '人数に合う席がありません', '7名');
});

test('席の種類の希望（カウンター・2名まで×2）を選ぶと、その種類の席だけを使う', () => {
  const shop = shopOf('yuzuriha');
  const records = empty();
  const two = { menuId: 'lunch', partySize: 2, seatKind: 'カウンター', date: '2026-11-05', records };
  assertEqual(slotAt(slotsOf(shop, two), '12:00').resourceId, 'c1', '2名・カウンター');
  book(shop, records, { date: '2026-11-05', start: '12:00', menuId: 'lunch', partySize: 2, seatKind: 'カウンター' });
  assertEqual(slotAt(slotsOf(shop, two), '12:00').resourceId, 'c2', '2組目はもう1つのカウンター');
  const three = { menuId: 'lunch', partySize: 3, seatKind: 'カウンター', date: '2026-11-05', records: empty() };
  assertEqual(slotAt(slotsOf(shop, three), '12:00').reasonText, '人数に合う席がありません', '3名・カウンター');
  const anyTwo = { menuId: 'lunch', partySize: 2, seatKind: 'any', date: '2026-11-05', records: empty() };
  assertEqual(slotAt(slotsOf(shop, anyTwo), '12:00').resourceId, 'c1', '2名・どれでもよい（小さい席から）');
});

test('同じ席に、片付けの時間（15分）を含めて重ならない', () => {
  const shop = shopOf('yuzuriha', {
    seats: [{ id: 'a', name: '4名席', kind: 'テーブル', capacity: 4 }],
    rules: { deadlineHours: 3, maxDaysAhead: 30, stepMinutes: 15, cleanupMinutes: 15 },
    // 13:15 開始の昼のおまかせ（60分）が入るよう、昼の部を15:00までにのばす
    weeklyHours: sameHoursEveryDay([{ start: '11:30', end: '15:00' }, { start: '17:30', end: '21:00' }]),
  });
  const records = empty();
  book(shop, records, { date: '2026-11-05', start: '12:00', menuId: 'lunch', partySize: 2, seatKind: 'any' }); // 12:00〜13:00
  const day = slotsOf(shop, { menuId: 'lunch', partySize: 2, seatKind: 'any', date: '2026-11-05', records });
  assertEqual(slotAt(day, '11:30').reasonText, '満席', '11:30（12:30＋片付けで12:45まで）');
  assertEqual(slotAt(day, '11:45').reasonText, '満席', '11:45');
  assertEqual(slotAt(day, '13:00').reasonText, '満席', '13:00（片付けが13:15まで）');
  assertEqual(slotAt(day, '13:15').available, true, '13:15');
});

test('同じ担当に、片付けの時間（10分）を含めて重ならない', () => {
  const shop = shopOf('komorebi');
  const records = empty();
  book(shop, records, { date: '2026-11-06', start: '12:00', menuId: 'cut', staffId: 's1' }); // 12:00〜13:00
  const day = slotsOf(shop, { menuId: 'cut', staffId: 's1', date: '2026-11-06', records });
  assertEqual(slotAt(day, '10:30').available, true, '10:30（11:30＋10分で11:40まで）');
  assertEqual(slotAt(day, '11:00').reasonText, '満席', '11:00（12:00＋10分が重なる）');
  assertEqual(slotAt(day, '13:00').reasonText, '満席', '13:00（片付けが13:10まで）');
  assertEqual(slotAt(day, '13:30').available, true, '13:30');
});

test('「指名なし」で、空いている担当に割り当てられる。全員ふさがっていれば×', () => {
  const shop = shopOf('komorebi');
  const records = empty();
  const any = { menuId: 'cut', staffId: 'any', date: '2026-11-06', records };
  book(shop, records, { date: '2026-11-06', start: '10:00', menuId: 'cut', staffId: 's1' });
  book(shop, records, { date: '2026-11-06', start: '10:00', menuId: 'cut', staffId: 's2' });
  assertEqual(slotAt(slotsOf(shop, any), '10:00').resourceId, 's3', '残っている森さん');
  const b = book(shop, records, { date: '2026-11-06', start: '10:00', menuId: 'cut', staffId: 'any' });
  assertEqual(b.resourceId, 's3', '確定した予約の担当');
  assertEqual(b.requested, 'any', 'お客さんの希望は指名なし');
  assertEqual(slotAt(slotsOf(shop, any), '10:00').reasonText, '満席', '全員ふさがったあと');
});

test('昼の部に夜のコースが出ない（昼のみ・夜のみ）', () => {
  const shop = shopOf('yuzuriha');
  const dinner = slotsOf(shop, { menuId: 'dinner', partySize: 2, seatKind: 'any', date: '2026-11-05', records: empty() });
  assertEqual(dinner.slots.every((s) => s.partIndex === 1 && s.start >= '17:30'), true, '夜のおまかせは夜の部だけ');
  assertEqual(dinner.slots[dinner.slots.length - 1].start, '19:00', '120分なので最後は19:00（21:00に終わる）');
  const lunch = slotsOf(shop, { menuId: 'lunch', partySize: 2, seatKind: 'any', date: '2026-11-05', records: empty() });
  assertEqual(lunch.slots.every((s) => s.partIndex === 0 && s.end <= '14:00'), true, '昼のおまかせは昼の部だけ');
  const seat = slotsOf(shop, { menuId: 'seat', partySize: 2, seatKind: 'any', date: '2026-11-05', records: empty() });
  assertEqual(seat.slots.some((s) => s.partIndex === 0) && seat.slots.some((s) => s.partIndex === 1), true, '席のみはどちらの部も');
});

test('定休日が×になる（ゆずり葉 水曜・こもれび 火曜）', () => {
  const y = slotsOf(shopOf('yuzuriha'), { menuId: 'lunch', partySize: 2, seatKind: 'any', date: '2026-11-11', records: empty() });
  assertEqual(y.mark, '×', 'ゆずり葉 11/11 水');
  assertEqual(y.reasonText, '定休日', 'ゆずり葉の理由');
  const k = slotsOf(shopOf('komorebi'), { menuId: 'cut', staffId: 'any', date: '2026-11-10', records: empty() });
  assertEqual(k.reasonText, '定休日', 'こもれび 11/10 火');
});

test('臨時休業が×になる', () => {
  const shop = shopOf('komorebi', { specialClosedDates: ['2026-11-06'] });
  const d = slotsOf(shop, { menuId: 'cut', staffId: 'any', date: '2026-11-06', records: empty() });
  assertEqual(d.mark, '×', '印');
  assertEqual(d.reasonText, '臨時休業', '理由');
});

test('担当の休みの曜日が×になる（森さんは木曜休み）', () => {
  const shop = shopOf('komorebi');
  const mori = slotsOf(shop, { menuId: 'cut', staffId: 's3', date: '2026-11-05', records: empty() });
  assertEqual(mori.mark, '×', '森さんを指名した木曜');
  assertEqual(mori.reasonText, '担当のお休み', '理由');
  const any = slotsOf(shop, { menuId: 'cut', staffId: 'any', date: '2026-11-05', records: empty() });
  assertEqual(any.mark, '○', '指名なしなら木曜も取れる');
  const records = empty();
  book(shop, records, { date: '2026-11-05', start: '10:00', menuId: 'cut', staffId: 's1' });
  book(shop, records, { date: '2026-11-05', start: '10:00', menuId: 'cut', staffId: 's2' });
  const after = slotsOf(shop, { menuId: 'cut', staffId: 'any', date: '2026-11-05', records });
  assertEqual(slotAt(after, '10:00').reasonText, '満席', '木曜は2人ともふさがると×（森さんに割り当てない）');
});

test('締め切り（3時間前）を過ぎた枠が選べない', () => {
  const shop = shopOf('yuzuriha');
  const day = slotsOf(shop, { menuId: 'lunch', partySize: 2, seatKind: 'any', date: '2026-11-05', records: empty() }, jst('2026-11-05 09:00'));
  assertEqual(slotAt(day, '11:30').reasonText, '締め切り後', '11:30（2時間30分前）');
  assertEqual(slotAt(day, '12:00').available, true, '12:00（ちょうど3時間前）');
  const late = slotsOf(shop, { menuId: 'lunch', partySize: 2, seatKind: 'any', date: '2026-11-05', records: empty() }, jst('2026-11-05 09:01'));
  assertEqual(slotAt(late, '12:00').reasonText, '締め切り後', '12:00（2時間59分前）');
});

test('キャンセル料ありのとき、確認画面の文にその金額が入る', () => {
  const on = shopOf('yuzuriha');
  on.cancel = { contactText: 'お電話でご連絡ください。', deadlineText: 'ご予約の前日まで', feeEnabled: true, feeDetail: '当日のキャンセルは1名につき1,000円' };
  const text = ShopFormat.cancelPolicyLines(on).join('\n');
  assertEqual(text.includes('キャンセル料：当日のキャンセルは1名につき1,000円'), true, 'オンのとき');
  assertEqual(text.includes('ご予約の前日までにお電話でご連絡ください。'), true, '期限と連絡方法');
  on.cancel.feeEnabled = false;
  assertEqual(ShopFormat.cancelPolicyLines(on).join('\n').includes('キャンセル料'), false, 'オフのときは出さない');
});

test('金額の表示が税込併記になる', () => {
  assertEqual(ShopPrice.format(1200), '1,200円（税込1,320円）', '1,200円');
  const y = shopOf('yuzuriha');
  const k = shopOf('komorebi');
  assertEqual(ShopPrice.formatMenu(ShopAvailability.findMenu(y, 'lunch')), '1,800円（税込1,980円）', '昼のおまかせ');
  assertEqual(ShopPrice.formatMenu(ShopAvailability.findMenu(y, 'dinner')), '5,000円（税込5,500円）', '夜のおまかせ');
  assertEqual(ShopPrice.formatMenu(ShopAvailability.findMenu(y, 'seat')), '', '席のみ（金額なし）');
  assertEqual(ShopPrice.formatMenu(ShopAvailability.findMenu(k, 'cutcolor')), '9,800円（税込10,780円）', 'カット＋カラー');
});

test('飲食店は1名あたりと、人数をかけた合計の両方を出す', () => {
  const y = shopOf('yuzuriha');
  const k = shopOf('komorebi');
  const dinner = ShopAvailability.findMenu(y, 'dinner');
  assertEqual(ShopPrice.formatPerPersonTotal(5000, 2), '1名 5,000円（税込5,500円）× 2名＝合計 10,000円（税込11,000円）', '夜のおまかせ 2名');
  assertEqual(ShopPrice.formatMenuFor(y, dinner, 2), '1名 5,000円（税込5,500円）× 2名＝合計 10,000円（税込11,000円）', 'お店の設定から');
  assertEqual(ShopPrice.formatMenuFor(y, dinner, null), '1名 5,000円（税込5,500円）', '人数がまだのとき');
  assertEqual(ShopPrice.formatMenuFor(y, ShopAvailability.findMenu(y, 'seat'), 3), '', '席のみ');
  assertEqual(ShopPrice.formatMenuFor(k, ShopAvailability.findMenu(k, 'cut'), null), '4,000円（税込4,400円）', 'サロンは人数をかけない');
});

// ---------- そのほかの確かめ ----------

test('確定直前に枠が埋まっていたら、確定できない（入力は残す）', () => {
  const shop = shopOf('komorebi');
  const records = empty();
  const draft = { date: '2026-11-06', start: '10:00', menuId: 'cut', staffId: 's1', name: '見本 太郎（見本）', phone: '090-0000-0000' };
  book(shop, records, { date: '2026-11-06', start: '10:00', menuId: 'cut', staffId: 's1' });
  const r = ShopStore.addBooking(shop, records, draft, NOW);
  assertEqual(r.ok, false, '確定できたか');
  assertEqual(r.message, '先に予約が入りました。別の時間をお選びください', '案内の文');
  assertEqual(draft.name, '見本 太郎（見本）', '入力内容が残っている');
});

test('予約番号は 店の頭文字2字-年月日-3桁', () => {
  const shop = shopOf('yuzuriha');
  const records = empty();
  const a = book(shop, records, { date: '2026-11-05', start: '12:00', menuId: 'lunch', partySize: 2, seatKind: 'any' });
  const b = book(shop, records, { date: '2026-11-05', start: '12:00', menuId: 'lunch', partySize: 2, seatKind: 'any' });
  assertEqual(a.id, 'YZ-20261105-001', '1件目');
  assertEqual(b.id, 'YZ-20261105-002', '2件目');
  assertEqual(a.resourceId !== b.resourceId, true, '同じ時間の2組は別の席');
});

test('受けない時間が×になる（お店全体）', () => {
  const shop = shopOf('komorebi');
  const records = empty();
  ShopStore.addBlock(records, { date: '2026-11-06', start: '10:00', end: '12:00', reason: '講習のため' });
  const day = slotsOf(shop, { menuId: 'cut', staffId: 'any', date: '2026-11-06', records });
  assertEqual(slotAt(day, '11:00').reasonText, '受けない時間', '11:00');
  assertEqual(slotAt(day, '12:00').available, true, '12:00');
});

test('受付は30日先まで', () => {
  const shop = shopOf('komorebi');
  const ok = slotsOf(shop, { menuId: 'cut', staffId: 'any', date: '2026-12-04', records: empty() }); // 30日先（金）
  const ng = slotsOf(shop, { menuId: 'cut', staffId: 'any', date: '2026-12-05', records: empty() }); // 31日先
  assertEqual(ok.mark, '○', '30日先');
  assertEqual(ng.reasonText, '受付期間外', '31日先');
});

test('キャンセルした予約の席・担当は空く', () => {
  const shop = shopOf('komorebi');
  const records = empty();
  const b = book(shop, records, { date: '2026-11-06', start: '10:00', menuId: 'cut', staffId: 's1' });
  ShopStore.cancelBooking(records, b.id);
  const day = slotsOf(shop, { menuId: 'cut', staffId: 's1', date: '2026-11-06', records });
  assertEqual(slotAt(day, '10:00').available, true, '10:00');
});

test('見本データ：各店6〜8件・受けない時間1件・名前に（見本）・同じ席／担当で重ならない', () => {
  const data = ShopStore.seed(NOW);
  assertEqual(data.shops.length, 2, 'お店の数');
  data.shops.forEach((shop) => {
    assertEqual(shop.name.endsWith('（見本）'), true, shop.name);
    const r = data.records[shop.id];
    assertEqual(r.bookings.length >= 6 && r.bookings.length <= 8, true, shop.name + ' の予約 ' + r.bookings.length + '件');
    assertEqual(r.blocks.length, 1, shop.name + ' の受けない時間');
    r.bookings.forEach((b) => {
      assertEqual(b.name.endsWith('（見本）'), true, b.name);
      r.bookings.forEach((o) => {
        if (o === b || o.date !== b.date || o.resourceId !== b.resourceId) return;
        const c = shop.rules.cleanupMinutes;
        const m = ShopAvailability.toMinutes;
        const clash = m(b.start) < m(o.end) + c && m(o.start) < m(b.end) + c;
        assertEqual(clash, false, b.id + ' と ' + o.id + ' が重ならない');
      });
    });
  });
});

test('見本の元データ（SAMPLE_SHOPS）は、見本を作っても書きかわらない', () => {
  const before = JSON.stringify(SAMPLE_SHOPS);
  const data = ShopStore.seed(NOW);
  data.shops[0].name = '書きかえ';
  assertEqual(JSON.stringify(SAMPLE_SHOPS), before, '元データ');
});

// ---------- 段階3：設定 ----------

test('見本の2店の設定には、まちがいがない', () => {
  SAMPLE_SHOPS.forEach((x) => assertEqual(ShopSettings.validate(x).join('／'), '', x.name));
});

test('設定のまちがいを見つける（終わりが始まりより前・メニューなし・キャンセル料の中身なし・頭文字）', () => {
  const shop = shopOf('yuzuriha');
  shop.weeklyHours[1][0] = { start: '14:00', end: '11:30' };
  shop.menus = [];
  shop.cancel.feeDetail = '';
  shop.bookingPrefix = 'ゆず';
  const errors = ShopSettings.validate(shop).join('\n');
  assertEqual(errors.includes('月曜：第1部の終わりは、始まりより後にしてください'), true, '営業時間');
  assertEqual(errors.includes('メニューを1つ以上入れてください'), true, 'メニュー');
  assertEqual(errors.includes('キャンセル料ありのときは、金額や率を書いてください'), true, 'キャンセル料');
  assertEqual(errors.includes('予約番号の頭は'), true, '頭文字');
});

test('書き出したファイルを読み込むと、同じ設定になる', () => {
  const shop = shopOf('komorebi');
  shop.menus[0].minutes = 45;
  shop.staff.push({ id: 's4', name: '追加（見本）', offWeekdays: [1] });
  const text = ShopSettings.exportText(shop);
  const result = ShopSettings.importText(text, SAMPLE_SHOPS);
  assertEqual(result.ok, true, '読み込めたか');
  assertEqual(JSON.stringify(result.shop), JSON.stringify(shop), '中身が同じ');
});

test('ちがうファイルは読み込まない（形がちがう・知らないお店・型がちがう）', () => {
  assertEqual(ShopSettings.importText('こわれた文字', SAMPLE_SHOPS).ok, false, 'JSONでない');
  assertEqual(ShopSettings.importText(JSON.stringify({ hello: 1 }), SAMPLE_SHOPS).ok, false, '形がちがう');
  const other = shopOf('komorebi', { id: 'unknown' });
  assertEqual(ShopSettings.importText(ShopSettings.exportText(other), SAMPLE_SHOPS).message, '見本の2店のどちらかの設定ファイルを選んでください', '知らないお店');
  const wrongType = shopOf('komorebi', { id: 'yuzuriha' });
  assertEqual(ShopSettings.importText(ShopSettings.exportText(wrongType), SAMPLE_SHOPS).message, '型（飲食店・サロン）がちがう設定ファイルです', '型');
});

test('設定でメニューの時間や営業時間を変えると、選べる枠が変わる', () => {
  const shop = shopOf('komorebi');
  const before = slotsOf(shop, { menuId: 'cut', staffId: 'any', date: '2026-11-06', records: empty() });
  shop.weeklyHours[5] = [{ start: '10:00', end: '15:00' }]; // 金曜を15時までに
  shop.menus[0].minutes = 30;
  shop.rules.stepMinutes = 60;
  const after = slotsOf(shop, { menuId: 'cut', staffId: 'any', date: '2026-11-06', records: empty() });
  assertEqual(before.slots[before.slots.length - 1].start, '18:00', '変える前の最後（19時まで・60分）');
  assertEqual(after.slots.map((x) => x.start).join(','), '10:00,11:00,12:00,13:00,14:00', '変えたあと（15時まで・30分・60分刻み）');
});

test('受けない時間に重なる予約を数える（キャンセル済みは数えない）', () => {
  const shop = shopOf('komorebi');
  const records = empty();
  book(shop, records, { date: '2026-11-06', start: '10:00', menuId: 'cut', staffId: 's1' });
  const c = book(shop, records, { date: '2026-11-06', start: '11:00', menuId: 'cut', staffId: 's2' });
  ShopStore.cancelBooking(records, c.id);
  assertEqual(ShopAvailability.bookingsOverlapping(records, '2026-11-06', '10:00', '12:00').length, 1, '午前');
});

test('設定を置きかえても、予約は残る', () => {
  const data = ShopStore.seed(NOW);
  const count = data.records.yuzuriha.bookings.length;
  const changed = JSON.parse(JSON.stringify(data.shops[0]));
  changed.name = '和食 ゆずり葉 本店（見本）';
  ShopStore.replaceShop(data, changed);
  assertEqual(data.shops[0].name, '和食 ゆずり葉 本店（見本）', '店名');
  assertEqual(data.records.yuzuriha.bookings.length, count, '予約の件数');
});

test('そのメニュー・席・担当を使っている予約の数（キャンセル済みは数えない）', () => {
  const shop = shopOf('komorebi');
  const records = empty();
  book(shop, records, { date: '2026-11-06', start: '10:00', menuId: 'cut', staffId: 's1' });
  book(shop, records, { date: '2026-11-06', start: '12:00', menuId: 'cut', staffId: 's1' });
  const c = book(shop, records, { date: '2026-11-06', start: '14:00', menuId: 'color', staffId: 's1' });
  ShopStore.cancelBooking(records, c.id);
  assertEqual(ShopStore.countBookingsUsing(records, 'menuId', 'cut'), 2, 'カット');
  assertEqual(ShopStore.countBookingsUsing(records, 'menuId', 'color'), 0, 'カラー（キャンセル済み）');
  assertEqual(ShopStore.countBookingsUsing(records, 'resourceId', 's1'), 2, '木村さん');
});

// ---------- 結果を画面に出す ----------

const list = document.getElementById('results');
results.forEach((r) => {
  const li = document.createElement('li');
  li.className = r.ok ? 'test-ok' : 'test-ng';
  li.textContent = (r.ok ? '✓ ' : '✗ ') + r.name + (r.ok ? '' : ' — ' + r.message);
  list.appendChild(li);
});

const passed = results.filter((r) => r.ok).length;
const summary = document.getElementById('summary');
summary.textContent = results.length + '件中 ' + passed + '件 成功' +
  (passed === results.length ? '（全部通りました）' : '（' + (results.length - passed) + '件 失敗）');
summary.dataset.result = passed === results.length ? 'pass' : 'fail';
