// =============================================================
// tests/tests.js — ブラウザで開くと結果が出るテスト
// 「今の日時」は全部ここで決めて渡す。保存データ（localStorage）は使わない。
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

// 日本時間で日時を作る（例 jst('2026-11-04 10:00')）
function jst(text) {
  return new Date(text.replace(' ', 'T') + ':00+09:00');
}

// 空の保存データ
function emptyRecords() {
  return { version: DATA_VERSION, bookings: [], blocks: [] };
}

function booking(date, start, courseId, placeId) {
  const end = Availability.toTime(Availability.toMinutes(start) + Availability.findCourse(courseId).minutes);
  return { id: 'test-' + date + start, date, start, end, courseId, placeId, status: 'active' };
}

function day(condition, now) {
  return Availability.getAvailability(condition, now).days[0];
}

function slotAt(dayResult, start) {
  return dayResult.slots.find((s) => s.start === start);
}

// 基準の「今」：2026-11-04（水）10:00 日本時間
const NOW = jst('2026-11-04 10:00');
const OFFICE = { courseId: 'beginner', placeId: 'office' };

// ---------- 指示書のテスト ----------

test('土日が×になる（2026-11-07 土・11-08 日）', () => {
  const sat = day({ ...OFFICE, date: '2026-11-07', records: emptyRecords() }, NOW);
  const sun = day({ ...OFFICE, date: '2026-11-08', records: emptyRecords() }, NOW);
  assertEqual(sat.mark, '×', '土曜の印');
  assertEqual(sat.reasonText, '休み', '土曜の理由');
  assertEqual(sun.mark, '×', '日曜の印');
});

test('祝日が×になる（2026-11-23 勤労感謝の日・月曜）', () => {
  const d = day({ ...OFFICE, date: '2026-11-23', records: emptyRecords() }, NOW);
  assertEqual(d.mark, '×', '祝日の印');
  assertEqual(d.reasonText, '休み', '祝日の理由');
  assertEqual(d.holidayName, '勤労感謝の日', '祝日の名前');
});

test('前の営業日の18時までなら選べる（11-04 水 17:59 → 11-05 木）', () => {
  const d = day({ ...OFFICE, date: '2026-11-05', records: emptyRecords() }, jst('2026-11-04 17:59'));
  assertEqual(d.mark, '○', '翌日の印');
});

test('前の営業日の18時を過ぎると選べない（11-04 水 18:01 → 11-05 木）', () => {
  const d = day({ ...OFFICE, date: '2026-11-05', records: emptyRecords() }, jst('2026-11-04 18:01'));
  assertEqual(d.mark, '×', '翌日の印');
  assertEqual(d.reasonText, '締め切り後', '翌日の理由');
});

test('月曜の締め切りは、土日をまたいで金曜の18時（11-09 月 → 11-06 金）', () => {
  const fri = day({ ...OFFICE, date: '2026-11-09', records: emptyRecords() }, jst('2026-11-06 17:59'));
  const sat = day({ ...OFFICE, date: '2026-11-09', records: emptyRecords() }, jst('2026-11-07 10:00'));
  assertEqual(fri.mark, '○', '金曜 17:59');
  assertEqual(sat.reasonText, '締め切り後', '土曜 10:00');
});

test('祝日の次の日の締め切りは、祝日の前の営業日（11-24 火 → 11-20 金）', () => {
  assertEqual(Availability.deadlineDateOf('2026-11-24'), '2026-11-20', '締め切りの日');
  const sun = day({ ...OFFICE, date: '2026-11-24', records: emptyRecords() }, jst('2026-11-22 10:00'));
  assertEqual(sun.reasonText, '締め切り後', '日曜 10:00');
});

test('年末年始（12/29〜1/3）は休み。1/4 の締め切りは 12/28 の18時', () => {
  const now = jst('2026-12-01 10:00');
  ['2026-12-29', '2026-12-31', '2027-01-03'].forEach((date) => {
    const d = day({ ...OFFICE, date, records: emptyRecords() }, now);
    assertEqual(d.reasonText, '休み', date);
  });
  assertEqual(day({ ...OFFICE, date: '2026-12-28', records: emptyRecords() }, now).mark, '○', '12-28');
  assertEqual(Availability.deadlineDateOf('2027-01-04'), '2026-12-28', '1/4 の締め切りの日');
});

test('出張の予約の前後60分に、別の予約が入らない', () => {
  const records = emptyRecords();
  records.bookings.push(booking('2026-11-10', '13:00', 'advanced', 'visit')); // 13:00〜14:00 出張
  const d = day({ ...OFFICE, date: '2026-11-10', records }, NOW);
  assertEqual(slotAt(d, '11:00').available, true, '11:00（12:00に終わる＝60分あく）');
  assertEqual(slotAt(d, '11:30').reasonText, '移動時間', '11:30');
  assertEqual(slotAt(d, '12:00').reasonText, '移動時間', '12:00');
  assertEqual(slotAt(d, '13:00').reasonText, '予約済み', '13:00');
  assertEqual(slotAt(d, '14:00').reasonText, '移動時間', '14:00');
  assertEqual(slotAt(d, '14:30').reasonText, '移動時間', '14:30');
  assertEqual(slotAt(d, '15:00').available, true, '15:00（60分あく）');
});

test('事務所の予約のあとに出張を入れるときも、60分あける', () => {
  const records = emptyRecords();
  records.bookings.push(booking('2026-11-10', '10:00', 'beginner', 'office')); // 10:00〜11:00 事務所
  const d = day({ courseId: 'beginner', placeId: 'visit', date: '2026-11-10', records }, NOW);
  assertEqual(slotAt(d, '11:00').reasonText, '移動時間', '出張 11:00');
  assertEqual(slotAt(d, '12:00').available, true, '出張 12:00');
});

test('事務所どうしなら、続けて予約できる', () => {
  const records = emptyRecords();
  records.bookings.push(booking('2026-11-10', '10:00', 'beginner', 'office'));
  const d = day({ ...OFFICE, date: '2026-11-10', records }, NOW);
  assertEqual(slotAt(d, '09:00').available, true, '09:00');
  assertEqual(slotAt(d, '09:30').reasonText, '予約済み', '09:30（重なる）');
  assertEqual(slotAt(d, '11:00').available, true, '11:00');
});

test('予約を受けない時間が×になる（午前だけ）', () => {
  const records = emptyRecords();
  records.blocks.push({ id: 'b1', date: '2026-11-11', start: '09:00', end: '12:00', reason: '所用のため' });
  const d = day({ ...OFFICE, date: '2026-11-11', records }, NOW);
  assertEqual(slotAt(d, '09:00').reasonText, '受けない時間', '09:00');
  assertEqual(slotAt(d, '11:30').reasonText, '受けない時間', '11:30（12:30まで）');
  assertEqual(slotAt(d, '12:00').available, true, '12:00');
});

test('出張の予約だけは、受けない時間の前後60分もあける', () => {
  const records = emptyRecords();
  records.blocks.push({ id: 'b1', date: '2026-11-11', start: '09:00', end: '12:00', reason: '所用のため' });
  const visit = day({ courseId: 'beginner', placeId: 'visit', date: '2026-11-11', records }, NOW);
  assertEqual(slotAt(visit, '12:00').reasonText, '移動時間', '出張 12:00');
  assertEqual(slotAt(visit, '12:30').reasonText, '移動時間', '出張 12:30');
  assertEqual(slotAt(visit, '13:00').available, true, '出張 13:00');
  const online = day({ courseId: 'beginner', placeId: 'online', date: '2026-11-11', records }, NOW);
  assertEqual(slotAt(online, '12:00').available, true, 'オンライン 12:00');
});

test('予約を受けない時間が終日なら、その日が×になる', () => {
  const records = emptyRecords();
  records.blocks.push({ id: 'b2', date: '2026-11-12', start: '09:00', end: '18:00', reason: '出張のため' });
  const d = day({ ...OFFICE, date: '2026-11-12', records }, NOW);
  assertEqual(d.mark, '×', '印');
  assertEqual(d.reasonText, '受けない時間', '理由');
});

test('確定直前に枠が埋まっていたら、確定できない', () => {
  const records = emptyRecords();
  const draft = { date: '2026-11-13', start: '10:00', courseId: 'beginner', placeId: 'office',
    name: '見本 太郎（見本）', phone: '090-0000-0000', email: 'demo@example.com', note: '' };
  assertEqual(Availability.isStillAvailable(draft, NOW, records), true, '最初は空いている');

  // 入力している間に、別の人が同じ枠を取った
  records.bookings.push(booking('2026-11-13', '10:00', 'intermediate', 'online'));
  assertEqual(Availability.isStillAvailable(draft, NOW, records), false, '埋まったあと');

  const result = Store.addBooking(records, draft, NOW);
  assertEqual(result.ok, false, '確定できたか');
  assertEqual(result.message, '先に予約が入りました。別の時間をお選びください', '案内の文');
  assertEqual(records.bookings.length, 1, '予約の件数（増えていない）');
  assertEqual(draft.name, '見本 太郎（見本）', '入力内容が残っている');
});

test('金額の表示が「2,000円（税込2,200円）」の形になる', () => {
  assertEqual(Price.format(2000), '2,000円（税込2,200円）', '2000円');
  assertEqual(Price.formatCourse(Availability.findCourse('beginner')), '2,000円（税込2,200円）', '初級');
  assertEqual(Price.formatCourse(Availability.findCourse('advanced')), '4,000円（税込4,400円）', '上級');
  assertEqual(Price.formatCourse(Availability.findCourse('master')), '10,000円（税込11,000円）', '最上級');
  assertEqual(Price.formatCourse(Availability.findCourse('free')), '無料（初回のみ）', '初回無料相談');
});

// ---------- そのほかの確かめ ----------

test('チケットの金額の書き方', () => {
  assertEqual(Price.formatTicket(TICKETS[0]), '初級 5回分 10,000円（税込11,000円）', '初級');
  assertEqual(Price.formatTicket(TICKETS[1]), '中級 10回分 20,000円（税込22,000円）', '中級');
  assertEqual(Price.formatTicket(TICKETS[2]), '上級 10回分 40,000円（税込44,000円）', '上級');
  assertEqual(Price.formatTicket(TICKETS[3]), '最上級 5回分 50,000円（税込55,000円）', '最上級');
});

test('開始時刻は30分刻みで、60分の講座が18:00までに終わるもの（9:00〜17:00）', () => {
  const d = day({ ...OFFICE, date: '2026-11-10', records: emptyRecords() }, NOW);
  assertEqual(d.slots.length, 17, '枠の数');
  assertEqual(d.slots[0].start, '09:00', '最初');
  assertEqual(d.slots[16].start, '17:00', '最後');
  assertEqual(d.slots[16].end, '18:00', '最後の終わり');
});

test('空きが3割以下なら△、0なら×', () => {
  const records = emptyRecords();
  // 9:00〜14:00 と 15:00〜17:00 を埋める → 空きは 14:00 と 17:00 の2枠（2/17）
  records.blocks.push({ id: 'b', date: '2026-11-16', start: '09:00', end: '14:00', reason: '' });
  records.blocks.push({ id: 'c', date: '2026-11-16', start: '15:00', end: '17:00', reason: '' });
  const d = day({ ...OFFICE, date: '2026-11-16', records }, NOW);
  assertEqual(d.openCount, 2, '空きの数');
  assertEqual(d.mark, '△', '印');
});

test('60日先までは選べて、61日先は選べない', () => {
  const now = jst('2026-11-05 10:00'); // 60日先＝2027-01-04（月）
  const in60 = day({ ...OFFICE, date: '2027-01-04', records: emptyRecords() }, now);
  const in61 = day({ ...OFFICE, date: '2027-01-05', records: emptyRecords() }, now);
  assertEqual(in60.mark, '○', '60日先');
  assertEqual(in61.mark, '×', '61日先');
  assertEqual(in61.reasonText, '受付期間外', '61日先の理由');
});

test('日本時間で判定する（世界標準時では11-04 09:30でも、日本は18:30）', () => {
  const now = new Date('2026-11-04T09:30:00Z');
  const d = day({ ...OFFICE, date: '2026-11-05', records: emptyRecords() }, now);
  assertEqual(d.reasonText, '締め切り後', '翌日の理由');
});

test('キャンセルした予約の枠は空く', () => {
  const records = emptyRecords();
  const b = booking('2026-11-10', '10:00', 'beginner', 'office');
  b.status = 'cancelled';
  records.bookings.push(b);
  const d = day({ ...OFFICE, date: '2026-11-10', records }, NOW);
  assertEqual(slotAt(d, '10:00').available, true, '10:00');
});

test('最短で取れる枠：締め切り前なら翌日、18時を過ぎたら翌々日の9:00', () => {
  // 11-04（水）10:00 なら 11-05（木）が取れる。18:30 なら 11-06（金）になる
  const r1 = Availability.getAvailability({ ...OFFICE, records: emptyRecords() }, NOW);
  assertEqual(r1.earliest.date + ' ' + r1.earliest.start, '2026-11-05 09:00', '10:00のとき');
  const r2 = Availability.getAvailability({ ...OFFICE, records: emptyRecords() }, jst('2026-11-04 18:30'));
  assertEqual(r2.earliest.date + ' ' + r2.earliest.start, '2026-11-06 09:00', '18:30のとき');
});

test('月ごとの空き：2026年11月は30日分', () => {
  const r = Availability.getAvailability({ ...OFFICE, month: '2026-11', records: emptyRecords() }, NOW);
  assertEqual(r.days.length, 30, '日数');
  assertEqual(r.days[0].date, '2026-11-01', '最初の日');
  assertEqual(r.days[29].date, '2026-11-30', '最後の日');
});

test('予約番号は EE-年月日-3桁で、同じ日は連番', () => {
  const records = emptyRecords();
  const draft = { date: '2026-11-05', start: '10:00', courseId: 'beginner', placeId: 'office', name: 'a', phone: '', email: '' };
  const r1 = Store.addBooking(records, draft, NOW);
  const r2 = Store.addBooking(records, { ...draft, start: '13:00' }, NOW);
  assertEqual(r1.booking.id, 'EE-20261105-001', '1件目');
  assertEqual(r2.booking.id, 'EE-20261105-002', '2件目');
});

test('見本データ：これから2週間に6〜8件、受けない時間2件、名前に（見本）、互いに重ならない', () => {
  const records = Store.seed(NOW);
  const limit = Availability.addDays('2026-11-04', 14);
  assertEqual(records.bookings.length >= 6 && records.bookings.length <= 8, true, '件数');
  assertEqual(records.blocks.length, 2, '受けない時間の件数');
  records.bookings.forEach((b) => {
    assertEqual(b.name.endsWith('（見本）'), true, b.name);
    assertEqual(/^090-0000-\d{4}$/.test(b.phone), true, b.phone);
    assertEqual(b.date > '2026-11-04' && b.date <= limit, true, b.date + ' が2週間以内');
    // 自分以外の予約と受けない時間に対して、空いている枠に入っているか
    const others = { bookings: records.bookings.filter((o) => o !== b), blocks: records.blocks };
    const past = jst('2026-10-01 10:00'); // 締め切りに関係なく、重なりだけを見る
    assertEqual(Availability.isStillAvailable(b, past, others), true, b.id + ' が重ならない');
  });
});

test('教室側でキャンセルすると、その枠がお客さん側でまた選べる', () => {
  const records = emptyRecords();
  const draft = { date: '2026-11-13', start: '10:00', courseId: 'beginner', placeId: 'office', name: 'a', phone: '', email: '' };
  const r = Store.addBooking(records, draft, NOW);
  assertEqual(Availability.isStillAvailable(draft, NOW, records), false, '予約のあと');
  Store.cancelBooking(records, r.booking.id);
  assertEqual(records.bookings[0].status, 'cancelled', '状態');
  assertEqual(Availability.isStillAvailable(draft, NOW, records), true, 'キャンセルのあと');
});

test('教室側で受けない時間を登録すると×になり、削除すると空く', () => {
  const records = emptyRecords();
  const added = Store.addBlock(records, { date: '2026-11-12', start: '09:00', end: '18:00', reason: '出張のため' });
  assertEqual(day({ ...OFFICE, date: '2026-11-12', records }, NOW).mark, '×', '登録のあと');
  Store.removeBlock(records, added.id);
  assertEqual(day({ ...OFFICE, date: '2026-11-12', records }, NOW).mark, '○', '削除のあと');
});

test('受けない時間に重なる予約を数える（キャンセル済みは数えない）', () => {
  const records = emptyRecords();
  records.bookings.push(booking('2026-11-12', '10:00', 'beginner', 'office'));
  records.bookings.push(booking('2026-11-12', '14:00', 'beginner', 'online'));
  const c = booking('2026-11-12', '11:00', 'beginner', 'office');
  c.status = 'cancelled';
  records.bookings.push(c);
  assertEqual(Availability.bookingsOverlapping(records, '2026-11-12', '09:00', '12:00').length, 1, '午前');
  assertEqual(Availability.bookingsOverlapping(records, '2026-11-12', '09:00', '18:00').length, 2, '終日');
  assertEqual(Availability.bookingsOverlapping(records, '2026-11-12', '11:00', '14:00').length, 0, '11:00〜14:00');
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
