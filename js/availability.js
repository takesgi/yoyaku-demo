// =============================================================
// js/availability.js — 空きの計算（この1か所だけに書く）
//
// 空いている枠 ＝ 営業時間 − 土日祝 − 受付締め切り以前 − 60日より先
//               − 既存の予約（前後に空ける時間を含む）− 予約を受けない時間
//   かつ 講座の時間が営業時間内に丸ごと収まる
//
// 日付は 'YYYY-MM-DD'、時刻は 'HH:MM' の文字列で、すべて日本時間。
// 「今の日時」は必ず引数で受け取る（テストで好きな日時にできるように）。
// 使うデータ：js/data.js（RULES・COURSES・PLACES・HOLIDAYS・REASONS）
// =============================================================

const Availability = (function () {
  const MS_PER_MINUTE = 60 * 1000;
  const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

  // ---------- 日付と時刻の道具 ----------

  // '09:30' → 570（0時から何分か）
  function toMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  // 570 → '09:30'
  function toTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  // 'YYYY-MM-DD' → その日の 0時（UTC扱いの数値。日付の計算だけに使う）
  function dateToNumber(date) {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function numberToDate(n) {
    const d = new Date(n);
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  }

  function addDays(date, days) {
    return numberToDate(dateToNumber(date) + days * MS_PER_DAY);
  }

  // a から b まで何日あるか（b が後なら正の数）
  function daysBetween(a, b) {
    return Math.round((dateToNumber(b) - dateToNumber(a)) / MS_PER_DAY);
  }

  // 曜日（0=日 … 6=土）
  function weekday(date) {
    return new Date(dateToNumber(date)).getUTCDay();
  }

  // 今の日時（Date）を、日本時間の「日付」と「0時から何分か」に分ける
  function nowInJapan(now) {
    const shifted = new Date(now.getTime() + RULES.utcOffsetMinutes * MS_PER_MINUTE);
    return {
      date: numberToDate(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())),
      minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    };
  }

  // 日本時間の日付と時刻 → 本当の時刻（ミリ秒）
  function japanTimeToMs(date, time) {
    return dateToNumber(date) + (toMinutes(time) - RULES.utcOffsetMinutes) * MS_PER_MINUTE;
  }

  function holidayOf(date) {
    return HOLIDAYS.find((h) => h.date === date) || null;
  }

  // 予約を受ける日か（平日で、祝日でない）
  function isOpenDay(date) {
    return RULES.openWeekdays.includes(weekday(date)) && !holidayOf(date);
  }

  // date から数えて n 営業日目の日付（n=1 なら次の営業日）
  function addBusinessDays(date, n) {
    let d = date;
    let count = 0;
    while (count < n) {
      d = addDays(d, 1);
      if (isOpenDay(d)) count++;
    }
    return d;
  }

  // ---------- きまりごとの判定 ----------

  // 受付の締め切りを過ぎたか（前日の18:00まで）
  function isPastDeadline(date, now) {
    const deadlineDate = addDays(date, -RULES.deadlineDaysBefore);
    return now.getTime() > japanTimeToMs(deadlineDate, RULES.deadlineTime);
  }

  // 60日より先か
  function isTooFar(date, now) {
    return daysBetween(nowInJapan(now).date, date) > RULES.maxDaysAhead;
  }

  // 2つの時間帯 [aStart, aEnd) と [bStart, bEnd) が重なるか（分で比べる）
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function findCourse(id) {
    return COURSES.find((c) => c.id === id);
  }

  function findPlace(id) {
    return PLACES.find((p) => p.id === id);
  }

  // その日の開始時刻の候補（講座が営業時間内に丸ごと収まるものだけ）
  function startTimesOfDay(course) {
    const open = toMinutes(RULES.openTime);
    const close = toMinutes(RULES.closeTime);
    const list = [];
    for (let t = open; t + course.minutes <= close; t += RULES.slotStepMinutes) {
      list.push(t);
    }
    return list;
  }

  // 1つの枠が取れるかを調べる。取れれば null、取れなければ理由のキーを返す。
  function reasonOf(date, start, course, place, records, now) {
    const end = start + course.minutes;

    if (!isOpenDay(date)) return 'closed';
    if (isTooFar(date, now)) return 'outOfRange';
    if (isPastDeadline(date, now)) return 'deadline';

    const blocked = records.blocks.some((b) =>
      b.date === date && overlaps(start, end, toMinutes(b.start), toMinutes(b.end)));
    if (blocked) return 'blocked';

    const sameDay = records.bookings.filter((b) => b.date === date && b.status !== 'cancelled');

    const booked = sameDay.some((b) =>
      overlaps(start, end, toMinutes(b.start), toMinutes(b.end)));
    if (booked) return 'booked';

    // 前後に空ける時間：2つの予約の間は、どちらか長いほうの時間だけあける
    // （出張→事務所なら帰りの60分、事務所→出張なら行きの60分、出張→出張でも60分）
    const tooClose = sameDay.some((b) => {
      const gap = Math.max(place.bufferMinutes, findPlace(b.placeId).bufferMinutes);
      return overlaps(start - gap, end + gap, toMinutes(b.start), toMinutes(b.end));
    });
    if (tooClose) return 'travel';

    return null;
  }

  // 1日分の空きをまとめる
  function dayAvailability(date, course, place, records, now) {
    const slots = startTimesOfDay(course).map((start) => {
      const reason = reasonOf(date, start, course, place, records, now);
      return {
        date,
        start: toTime(start),
        end: toTime(start + course.minutes),
        available: reason === null,
        reason,                                  // 'booked' など（空きなら null）
        reasonText: reason ? REASONS[reason] : '', // 画面に出す言葉
      };
    });

    const openCount = slots.filter((s) => s.available).length;
    let mark;
    if (openCount === 0) mark = '×';
    else if (openCount / slots.length <= RULES.fewRatio) mark = '△';
    else mark = '○';

    // × の日の理由：全部の枠が同じ理由ならそれ、まちまちなら「満席」
    let reason = null;
    if (openCount === 0) {
      const kinds = [...new Set(slots.map((s) => s.reason))];
      reason = kinds.length === 1 ? kinds[0] : 'full';
    }

    const holiday = holidayOf(date);
    return {
      date,
      mark,
      openCount,
      totalCount: slots.length,
      reason,
      reasonText: reason ? REASONS[reason] : '',
      holidayName: holiday ? holiday.name : '',
      slots,
    };
  }

  // records を省いたときは、ブラウザに保存してある予約を使う
  function recordsOrSaved(records, now) {
    if (records) return records;
    return Store.load(now);
  }

  // ---------- 入口 ----------

  // 条件：
  //   courseId, placeId … 講座と場所（必須）
  //   date    'YYYY-MM-DD' … その1日だけ
  //   month   'YYYY-MM'    … その月の全部の日
  //   （どちらもなければ、今日から60日先まで）
  //   records { bookings, blocks } … 省くとブラウザの保存データ
  // 返すもの：
  //   days     … 日ごとの空き（mark: ○△×、slots: 開始時刻ごとの空き）
  //   earliest … 最短で取れる枠（今日から60日先までで一番早いもの。なければ null）
  function getAvailability(condition, now) {
    const course = findCourse(condition.courseId);
    const place = findPlace(condition.placeId);
    const records = recordsOrSaved(condition.records, now);
    const today = nowInJapan(now).date;

    let from;
    let to;
    if (condition.date) {
      from = condition.date;
      to = condition.date;
    } else if (condition.month) {
      const [y, m] = condition.month.split('-').map(Number);
      from = condition.month + '-01';
      // 次の月の1日の前の日 ＝ その月の最後の日（Date.UTC の月は0始まりなので m のままで次の月）
      to = addDays(numberToDate(Date.UTC(y, m, 1)), -1);
    } else {
      from = today;
      to = addDays(today, RULES.maxDaysAhead);
    }

    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      days.push(dayAvailability(d, course, place, records, now));
    }

    let earliest = null;
    for (let d = today; d <= addDays(today, RULES.maxDaysAhead) && !earliest; d = addDays(d, 1)) {
      const day = dayAvailability(d, course, place, records, now);
      earliest = day.slots.find((s) => s.available) || null;
    }

    return { days, earliest };
  }

  // 確定の直前に、その枠がまだ空いているかを確かめる
  // 枠：{ date, start, courseId, placeId }
  function isStillAvailable(slot, now, records) {
    const course = findCourse(slot.courseId);
    const place = findPlace(slot.placeId);
    const data = recordsOrSaved(records, now);
    return reasonOf(slot.date, toMinutes(slot.start), course, place, data, now) === null;
  }

  return {
    getAvailability,
    isStillAvailable,
    // 画面やほかのファイルでも使う日付の道具
    toMinutes,
    toTime,
    addDays,
    weekday,
    nowInJapan,
    isOpenDay,
    addBusinessDays,
    findCourse,
    findPlace,
  };
})();
