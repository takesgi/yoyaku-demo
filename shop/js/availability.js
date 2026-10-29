// =============================================================
// shop/js/availability.js — お店の空きの計算（この1か所だけに書く）
// レッスン予約の js/availability.js を写して、2つの型に広げたもの。
//
//   飲食店の型：席 × 人数。人数が定員をこえる席は使わない。同じ席に同じ時間帯は1組
//   サロンの型：担当 × メニュー。同じ担当に同じ時間帯は1件。「指名なし」は空いている担当を割り当てる
//
// 空いている枠 ＝ 部ごとの営業時間 − 定休日 − 臨時休業 − 締め切り（◯時間前）以前 − ◯日より先
//               − 受けない時間 − 席／担当がすべてふさがっている時間（片付けの時間を含む）
//   かつ メニューの時間が、その部の営業時間内に丸ごと収まる
//   かつ メニューが受ける部である（昼のみ・夜のみ）
//
// 日付は 'YYYY-MM-DD'、時刻は 'HH:MM'、すべて日本時間。「今の日時」は必ず引数で受け取る。
// =============================================================

const ShopAvailability = (function () {
  const MS_PER_MINUTE = 60 * 1000;
  const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

  // ---------- 日付と時刻の道具 ----------

  function toMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  function toTime(minutes) {
    return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  }

  function dateToNumber(date) {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function numberToDate(n) {
    const d = new Date(n);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  function addDays(date, days) {
    return numberToDate(dateToNumber(date) + days * MS_PER_DAY);
  }

  function daysBetween(a, b) {
    return Math.round((dateToNumber(b) - dateToNumber(a)) / MS_PER_DAY);
  }

  function weekday(date) {
    return new Date(dateToNumber(date)).getUTCDay();
  }

  function nowInJapan(now) {
    const shifted = new Date(now.getTime() + SHOP_COMMON.utcOffsetMinutes * MS_PER_MINUTE);
    return {
      date: numberToDate(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())),
      minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    };
  }

  // 日本時間の日付と時刻 → 本当の時刻（ミリ秒）
  function japanTimeToMs(date, time) {
    return dateToNumber(date) + (toMinutes(time) - SHOP_COMMON.utcOffsetMinutes) * MS_PER_MINUTE;
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  // ---------- お店の設定を読む道具 ----------

  function findMenu(shop, id) {
    return shop.menus.find((m) => m.id === id);
  }

  // 予約を受ける単位（飲食店＝席、サロン＝担当）
  function resourcesOf(shop) {
    return shop.type === 'restaurant' ? shop.seats : shop.staff;
  }

  function findResource(shop, id) {
    return resourcesOf(shop).find((r) => r.id === id) || null;
  }

  // その日にお店が開いているか
  function closedReasonOfDay(shop, date) {
    if (shop.closedWeekdays.includes(weekday(date))) return 'closed';
    if (shop.specialClosedDates.includes(date)) return 'specialClosed';
    return null;
  }

  function isOpenDay(shop, date) {
    return closedReasonOfDay(shop, date) === null && (shop.weeklyHours[weekday(date)] || []).length > 0;
  }

  // date から数えて n 番目の営業日（見本データを作るときに使う）
  function addOpenDays(shop, date, n) {
    let d = date;
    let count = 0;
    while (count < n) {
      d = addDays(d, 1);
      if (isOpenDay(shop, d)) count++;
    }
    return d;
  }

  // メニューがその部で受けられるか（parts が空ならどの部も）
  function menuFitsPart(menu, partIndex) {
    return menu.parts.length === 0 || menu.parts.includes(partIndex);
  }

  // ---------- 席・担当が空いているか ----------

  // その席・担当に、片付けの時間を含めて重なる予約があるか
  // 予約は [始まり, 終わり＋片付け) のあいだ、その席・担当を使う
  function resourceIsFree(shop, resourceId, date, start, end, bookings) {
    const cleanup = shop.rules.cleanupMinutes;
    return !bookings.some((b) =>
      b.date === date && b.status !== 'cancelled' && b.resourceId === resourceId &&
      overlaps(start, end + cleanup, toMinutes(b.start), toMinutes(b.end) + cleanup));
  }

  // 飲食店：人数と席の種類の希望に合う席（小さい席から順に。大きな席を少人数でふさがないように）
  function seatCandidates(shop, partySize, seatKind) {
    return shop.seats
      .filter((s) => s.capacity >= partySize && (!seatKind || seatKind === 'any' || s.kind === seatKind))
      .sort((a, b) => a.capacity - b.capacity);
  }

  // サロン：指名（'any' なら全員、並び順に）。その曜日がお休みの担当は除く
  function staffCandidates(shop, staffId, date) {
    const list = staffId && staffId !== 'any' ? shop.staff.filter((s) => s.id === staffId) : shop.staff;
    return list.filter((s) => !s.offWeekdays.includes(weekday(date)));
  }

  // ---------- 1つの枠 ----------

  // 枠が取れるかを調べる。{ reason（取れれば null）, resourceId（割り当てた席・担当） } を返す
  function checkSlot(shop, condition, date, start, end, records, now) {
    const dayClosed = closedReasonOfDay(shop, date);
    if (dayClosed) return { reason: dayClosed, resourceId: null };
    if (daysBetween(nowInJapan(now).date, date) > shop.rules.maxDaysAhead) return { reason: 'outOfRange', resourceId: null };
    // 締め切り：始まりの◯時間前まで
    const startMs = japanTimeToMs(date, toTime(start));
    if (now.getTime() > startMs - shop.rules.deadlineHours * 60 * MS_PER_MINUTE) return { reason: 'deadline', resourceId: null };

    const blocked = records.blocks.some((b) =>
      b.date === date && overlaps(start, end, toMinutes(b.start), toMinutes(b.end)));
    if (blocked) return { reason: 'blocked', resourceId: null };

    let candidates;
    if (shop.type === 'restaurant') {
      candidates = seatCandidates(shop, condition.partySize, condition.seatKind);
      if (candidates.length === 0) return { reason: 'noSeat', resourceId: null };
    } else {
      candidates = staffCandidates(shop, condition.staffId, date);
      if (candidates.length === 0) return { reason: 'staffOff', resourceId: null };
    }

    const free = candidates.find((r) => resourceIsFree(shop, r.id, date, start, end, records.bookings));
    return free ? { reason: null, resourceId: free.id } : { reason: 'full', resourceId: null };
  }

  // その日の開始時刻の候補（部ごとに、メニューが部の中に丸ごと収まるもの）
  function startTimesOfDay(shop, menu, date) {
    const parts = shop.weeklyHours[weekday(date)] || [];
    const list = [];
    parts.forEach((part, partIndex) => {
      if (!menuFitsPart(menu, partIndex)) return;
      const open = toMinutes(part.start);
      const close = toMinutes(part.end);
      for (let t = open; t + menu.minutes <= close; t += shop.rules.stepMinutes) {
        list.push({ start: t, partIndex });
      }
    });
    return list;
  }

  function dayAvailability(shop, condition, date, records, now) {
    const menu = findMenu(shop, condition.menuId);
    const closed = closedReasonOfDay(shop, date);
    const slots = closed ? [] : startTimesOfDay(shop, menu, date).map(({ start, partIndex }) => {
      const end = start + menu.minutes;
      const result = checkSlot(shop, condition, date, start, end, records, now);
      return {
        date,
        start: toTime(start),
        end: toTime(end),
        partIndex,
        partName: shop.partNames[partIndex] || '',
        available: result.reason === null,
        resourceId: result.resourceId,
        reason: result.reason,
        reasonText: result.reason ? SHOP_REASONS[result.reason] : '',
      };
    });

    const openCount = slots.filter((s) => s.available).length;
    let mark;
    if (openCount === 0) mark = '×';
    else if (openCount / slots.length <= SHOP_COMMON.fewRatio) mark = '△';
    else mark = '○';

    let reason = null;
    if (openCount === 0) {
      if (closed) reason = closed;
      else if (slots.length === 0) reason = 'closed'; // その曜日に営業時間がない
      else {
        const kinds = [...new Set(slots.map((s) => s.reason))];
        reason = kinds.length === 1 ? kinds[0] : 'full';
      }
    }
    return { date, mark, openCount, totalCount: slots.length, reason, reasonText: reason ? SHOP_REASONS[reason] : '', slots };
  }

  // ---------- 入口 ----------

  // 条件：
  //   menuId                 … メニュー（必須）
  //   partySize, seatKind    … 飲食店：人数、席の種類の希望（'any' か SEAT_KINDS のどれか）
  //   staffId                … サロン：担当（'any' なら指名なし）
  //   date 'YYYY-MM-DD' / month 'YYYY-MM' … どちらもなければ今日から受付の最終日まで
  //   records { bookings, blocks }        … そのお店の予約と受けない時間
  // 返すもの：days（日ごとの ○△× と開始時刻ごとの空き）、earliest（最短で取れる枠）
  function getAvailability(shop, condition, now) {
    const records = condition.records;
    const today = nowInJapan(now).date;
    const last = addDays(today, shop.rules.maxDaysAhead);
    let from;
    let to;
    if (condition.date) {
      from = condition.date;
      to = condition.date;
    } else if (condition.month) {
      const [y, m] = condition.month.split('-').map(Number);
      from = condition.month + '-01';
      to = addDays(numberToDate(Date.UTC(y, m, 1)), -1);
    } else {
      from = today;
      to = last;
    }

    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(dayAvailability(shop, condition, d, records, now));

    let earliest = null;
    for (let d = today; d <= last && !earliest; d = addDays(d, 1)) {
      earliest = dayAvailability(shop, condition, d, records, now).slots.find((s) => s.available) || null;
    }
    return { days, earliest };
  }

  // その日のその時間帯に重なる予約（キャンセル済みは数えない）
  // お店側で「受けない時間」を登録するときに、予約が何件あるかを知らせるのに使う
  function bookingsOverlapping(records, date, start, end) {
    return records.bookings.filter((b) =>
      b.date === date && b.status !== 'cancelled' &&
      overlaps(toMinutes(start), toMinutes(end), toMinutes(b.start), toMinutes(b.end)));
  }

  // 確定の直前に、その枠がまだ空いているかを確かめる
  // 枠：{ date, start, menuId, partySize, seatKind, staffId }。空いていれば割り当てる席・担当の id、なければ null
  function isStillAvailable(shop, slot, now, records) {
    const menu = findMenu(shop, slot.menuId);
    const start = toMinutes(slot.start);
    const inHours = startTimesOfDay(shop, menu, slot.date).some((t) => t.start === start);
    if (!inHours) return null;
    const result = checkSlot(shop, slot, slot.date, start, start + menu.minutes, records, now);
    return result.reason === null ? result.resourceId : null;
  }

  return {
    getAvailability,
    isStillAvailable,
    bookingsOverlapping,
    toMinutes,
    toTime,
    addDays,
    weekday,
    nowInJapan,
    isOpenDay,
    addOpenDays,
    findMenu,
    findResource,
    resourcesOf,
  };
})();
