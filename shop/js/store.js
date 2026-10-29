// =============================================================
// shop/js/store.js — お店の設定と予約を、ブラウザの中（localStorage）に保存する
// 見本なので、どこにも送信しない。レッスン予約とは別の名前で保存する。
//
// 保存するもの：
//   { version, shops: [お店の設定…], records: { お店のid: { bookings, blocks } } }
// 予約の確定などは records を書きかえるだけ。保存は呼んだ側で save(data) する
// （テストが本物の保存データを書きかえないように）。
// =============================================================

const ShopStore = (function () {
  let memory = null; // localStorage が使えないときは、開いている間だけ覚えておく

  function readRaw() {
    try {
      const text = localStorage.getItem(SHOP_COMMON.storageKey);
      return text ? JSON.parse(text) : null;
    } catch (e) {
      return memory;
    }
  }

  function save(data) {
    memory = data;
    try {
      localStorage.setItem(SHOP_COMMON.storageKey, JSON.stringify(data));
    } catch (e) {
      // 保存できなくても、開いている間は memory で動く
    }
  }

  function load(now) {
    const data = readRaw();
    if (data && data.version === SHOP_DATA_VERSION) return data;
    return reset(now);
  }

  // 見本をリセット：設定も予約も、最初の見本の状態に戻す
  function reset(now) {
    const data = seed(now);
    save(data);
    return data;
  }

  // 見本の2店と、その予約・受けない時間を作る（日付は今日から数えた営業日）
  function seed(now) {
    const today = ShopAvailability.nowInJapan(now).date;
    const shops = JSON.parse(JSON.stringify(SAMPLE_SHOPS)); // 見本の元データは書きかえない
    const data = { version: SHOP_DATA_VERSION, shops, records: {} };

    shops.forEach((shop) => {
      const sample = SAMPLE_RECORDS[shop.id];
      const records = { bookings: [], blocks: [] };
      data.records[shop.id] = records;

      sample.blocks.forEach((b) => addBlock(records, {
        date: ShopAvailability.addOpenDays(shop, today, b.openDay), start: b.start, end: b.end, reason: b.reason,
      }));

      sample.bookings.forEach((s) => {
        const draft = {
          date: ShopAvailability.addOpenDays(shop, today, s.openDay),
          start: s.start,
          menuId: s.menuId,
          partySize: s.partySize,
          seatKind: 'any',
          staffId: s.staffId,
          name: s.name,
          phone: s.phone,
          email: '',
          note: '',
        };
        let result = addBooking(shop, records, draft, now);
        // 指名した担当がその曜日お休みのときは、指名なしで入れなおす（日付は開いた日しだいで変わるため）
        if (!result.ok && shop.type === 'salon') result = addBooking(shop, records, { ...draft, staffId: 'any' }, now);
      });
    });
    return data;
  }

  // 予約番号：店の頭文字2字-受ける日の年月日-その日の3桁の連番（例 YZ-20261105-001）
  function nextBookingNumber(shop, records, date) {
    const head = shop.bookingPrefix + '-' + date.replace(/-/g, '') + '-';
    const used = records.bookings.filter((b) => b.id.startsWith(head)).length;
    return head + String(used + 1).padStart(SHOP_COMMON.bookingNumberDigits, '0');
  }

  // 予約を確定する。直前にもう一度、枠が空いているかを確かめ、席・担当を割り当てる
  // 埋まっていたら確定せず、責めない言い方の案内を返す（入力内容 draft はそのまま）
  function addBooking(shop, records, draft, now) {
    const resourceId = ShopAvailability.isStillAvailable(shop, draft, now, records);
    if (!resourceId) return { ok: false, message: SHOP_COMMON.takenMessage };
    const menu = ShopAvailability.findMenu(shop, draft.menuId);
    const booking = {
      id: nextBookingNumber(shop, records, draft.date),
      date: draft.date,
      start: draft.start,
      end: ShopAvailability.toTime(ShopAvailability.toMinutes(draft.start) + menu.minutes),
      menuId: draft.menuId,
      resourceId,                                   // 割り当てた席・担当
      partySize: shop.type === 'restaurant' ? draft.partySize : null,
      requested: shop.type === 'restaurant' ? (draft.seatKind || 'any') : (draft.staffId || 'any'), // お客さんの希望
      name: draft.name,
      phone: draft.phone || '',
      email: draft.email || '',
      note: draft.note || '',
      status: 'active',
      createdAt: now.toISOString(),
    };
    records.bookings.push(booking);
    return { ok: true, booking };
  }

  function cancelBooking(records, id) {
    const booking = records.bookings.find((b) => b.id === id);
    if (booking) booking.status = 'cancelled';
    return booking || null;
  }

  function addBlock(records, block) {
    const used = records.blocks.map((b) => Number(b.id.replace('block-', '')) || 0);
    const added = { id: 'block-' + (Math.max(0, ...used) + 1), date: block.date, start: block.start, end: block.end, reason: block.reason || '' };
    records.blocks.push(added);
    return added;
  }

  function removeBlock(records, id) {
    records.blocks = records.blocks.filter((b) => b.id !== id);
  }

  return { load, save, reset, seed, nextBookingNumber, addBooking, cancelBooking, addBlock, removeBlock };
})();
