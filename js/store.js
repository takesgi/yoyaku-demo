// =============================================================
// js/store.js — 予約をブラウザの中（localStorage）に保存する
// 見本なので、どこにも送信しない。このブラウザの中だけに残る。
//
// 保存するもの（records）：
//   { version, bookings: [予約…], blocks: [予約を受けない時間…] }
// =============================================================

const Store = (function () {
  // localStorage が使えないとき（プライベートモードなど）は、開いている間だけ覚えておく
  let memory = null;

  function readRaw() {
    try {
      const text = localStorage.getItem(RULES.storageKey);
      return text ? JSON.parse(text) : null;
    } catch (e) {
      return memory;
    }
  }

  function save(records) {
    memory = records;
    try {
      localStorage.setItem(RULES.storageKey, JSON.stringify(records));
    } catch (e) {
      // 保存できなくても、開いている間は memory で動く
    }
  }

  // 保存データを読む。なかったり版番号が古かったりしたら、見本データで作り直す
  function load(now) {
    const records = readRaw();
    if (records && records.version === DATA_VERSION) return records;
    return reset(now);
  }

  // 見本をリセット：保存した予約を全部消して、最初の状態に戻す
  function reset(now) {
    const records = seed(now);
    save(records);
    return records;
  }

  // 見本データを、今日から数えた本当の日付で作る
  function seed(now) {
    const today = Availability.nowInJapan(now).date;
    const records = { version: DATA_VERSION, bookings: [], blocks: [] };

    SEED_BLOCKS.forEach((b, i) => {
      records.blocks.push({
        id: 'block-' + (i + 1),
        date: Availability.addBusinessDays(today, b.businessDay),
        start: b.start,
        end: b.end,
        reason: b.reason,
      });
    });

    SEED_BOOKINGS.forEach((s) => {
      const date = Availability.addBusinessDays(today, s.businessDay);
      records.bookings.push(makeBooking(records, {
        date,
        start: s.start,
        courseId: s.courseId,
        placeId: s.placeId,
        name: s.name,
        phone: s.phone,
        email: s.email,
        note: s.note,
      }, now));
    });

    return records;
  }

  // 予約番号：EE- ＋ 受講日の年月日 ＋ その日の3桁の連番（例 EE-20261105-001）
  function nextBookingNumber(records, date) {
    const head = RULES.bookingNumberPrefix + date.replace(/-/g, '') + '-';
    const used = records.bookings.filter((b) => b.id.startsWith(head)).length;
    return head + String(used + 1).padStart(RULES.bookingNumberDigits, '0');
  }

  function makeBooking(records, draft, now) {
    const course = Availability.findCourse(draft.courseId);
    const end = Availability.toTime(Availability.toMinutes(draft.start) + course.minutes);
    return {
      id: nextBookingNumber(records, draft.date),
      date: draft.date,
      start: draft.start,
      end,
      courseId: draft.courseId,
      placeId: draft.placeId,
      name: draft.name,
      phone: draft.phone,
      email: draft.email,
      note: draft.note || '',
      status: 'active',
      createdAt: now.toISOString(),
    };
  }

  // 予約を確定する。直前にもう一度、枠が空いているかを確かめる。
  // 埋まっていたら確定せず、責めない言い方の案内を返す（入力内容 draft はそのまま）。
  // records を書きかえるだけなので、保存は呼んだ側で save(records) する。
  function addBooking(records, draft, now) {
    if (!Availability.isStillAvailable(draft, now, records)) {
      return { ok: false, message: TAKEN_MESSAGE };
    }
    const booking = makeBooking(records, draft, now);
    records.bookings.push(booking);
    return { ok: true, booking };
  }

  return { load, save, reset, seed, nextBookingNumber, addBooking };
})();
