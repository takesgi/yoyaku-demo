// =============================================================
// js/admin.js — 教室側の画面（たけさん用・パソコンとタブレット）
//   予約一覧（今日・今週・すべて／キャンセル）
//   予約を受けない時間（登録・削除）
//   見本をリセット
// 画面の切り替えと描き直しは js/app.js が行い、ここは「中身を作る」と「操作を受ける」だけ。
// =============================================================

const Admin = (function () {
  const { esc, fmtTime, fmtDate, fmtSlot } = Format;

  const TABS = [
    { id: 'list', label: '予約一覧' },
    { id: 'blocks', label: '予約を受けない時間' },
    { id: 'reset', label: '見本をリセット' },
  ];
  const FILTERS = [
    { id: 'today', label: '今日' },
    { id: 'week', label: '今週' },
    { id: 'all', label: 'すべて' },
  ];

  const state = {
    tab: 'list',
    filter: 'week',
    message: '', // 「キャンセルしました」などのお知らせ
    messageIsWarning: false, // 予約が入っている時間に登録したときなど、目立たせるお知らせか
    blockForm: { date: '', start: RULES.openTime, end: RULES.closeTime, reason: '' },
    blockError: '',
  };

  function now() { return new Date(); }
  function today() { return Availability.nowInJapan(now()).date; }

  // 今週＝今日をふくむ月曜〜日曜
  function thisWeek() {
    const t = today();
    const monday = Availability.addDays(t, -((Availability.weekday(t) + 6) % 7));
    return { from: monday, to: Availability.addDays(monday, 6) };
  }

  function byDateTime(a, b) {
    return (a.date + a.start).localeCompare(b.date + b.start);
  }

  // ---------- 予約一覧 ----------

  function filteredBookings(records) {
    const t = today();
    const week = thisWeek();
    return records.bookings.filter((b) => {
      if (state.filter === 'today') return b.date === t;
      if (state.filter === 'week') return week.from <= b.date && b.date <= week.to;
      return true;
    }).sort(byDateTime);
  }

  function periodText() {
    if (state.filter === 'today') return fmtDate(today(), true);
    if (state.filter === 'week') {
      const week = thisWeek();
      return fmtDate(week.from) + '〜' + fmtDate(week.to);
    }
    return '保存してある予約すべて（キャンセルしたものもふくむ）';
  }

  function renderList(records) {
    const filters = FILTERS.map((f) =>
      '<button type="button" class="filter-btn" aria-pressed="' + (state.filter === f.id) + '" data-action="admin-filter" data-id="' + f.id + '">' + f.label + '</button>'
    ).join('');

    const list = filteredBookings(records);
    const activeCount = list.filter((b) => b.status !== 'cancelled').length;

    let table;
    if (list.length === 0) {
      table = '<p class="empty">この期間の予約はありません。</p>';
    } else {
      const rows = list.map((b) => {
        const c = Availability.findCourse(b.courseId);
        const p = Availability.findPlace(b.placeId);
        const cancelled = b.status === 'cancelled';
        const action = cancelled
          ? '<span class="status-cancelled">キャンセル済み</span>'
          : '<button type="button" class="btn btn-secondary btn-small" data-action="admin-cancel" data-id="' + esc(b.id) + '">キャンセル</button>';
        return '<tr class="' + (cancelled ? 'is-cancelled' : '') + '">' +
          '<td data-label="日時">' + fmtSlot(b.date, b.start, b.end) + '</td>' +
          '<td data-label="予約番号">' + esc(b.id) + '</td>' +
          '<td data-label="お名前">' + esc(b.name) + '</td>' +
          '<td data-label="講座">' + esc(c.name) + '</td>' +
          '<td data-label="場所">' + esc(p.name) + '</td>' +
          '<td data-label="操作">' + action + '</td>' +
          '</tr>';
      }).join('');
      table = '<table class="admin-table">' +
        '<thead><tr><th scope="col">日時</th><th scope="col">予約番号</th><th scope="col">お名前</th><th scope="col">講座</th><th scope="col">場所</th><th scope="col">操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>';
    }

    return '<div class="filters" role="group" aria-label="期間">' + filters + '</div>' +
      '<p class="period">' + periodText() + '　予約 ' + activeCount + '件</p>' +
      table;
  }

  // ---------- 予約を受けない時間 ----------

  // 営業時間の中の時刻（刻みごと）を選べるようにする
  function timeOptions(selected) {
    const open = Availability.toMinutes(RULES.openTime);
    const close = Availability.toMinutes(RULES.closeTime);
    let html = '';
    for (let t = open; t <= close; t += RULES.slotStepMinutes) {
      const time = Availability.toTime(t);
      html += '<option value="' + time + '"' + (time === selected ? ' selected' : '') + '>' + fmtTime(time) + '</option>';
    }
    return html;
  }

  function blockTimeText(b) {
    if (b.start === RULES.openTime && b.end === RULES.closeTime) return '終日';
    return fmtTime(b.start) + '〜' + fmtTime(b.end);
  }

  function renderBlocks(records) {
    const f = state.blockForm;
    const form = '<form id="block-form" class="block-form" novalidate>' +
      '<div class="field"><label for="b-date">日付 <span class="tag-req">必須</span></label>' +
      '<input id="b-date" name="date" type="date" min="' + today() + '" value="' + esc(f.date) + '"></div>' +
      '<div class="field-row">' +
      '<div class="field"><label for="b-start">始まり</label><select id="b-start" name="start">' + timeOptions(f.start) + '</select></div>' +
      '<div class="field"><label for="b-end">終わり</label><select id="b-end" name="end">' + timeOptions(f.end) + '</select></div>' +
      '</div>' +
      '<p class="sub">' + fmtTime(RULES.openTime) + '〜' + fmtTime(RULES.closeTime) + 'を選ぶと「終日」になります。</p>' +
      '<div class="field"><label for="b-reason">理由 <span class="tag-opt">任意</span></label>' +
      '<input id="b-reason" name="reason" type="text" placeholder="例：所用のため" value="' + esc(f.reason) + '"></div>' +
      (state.blockError ? '<p class="field-error" role="alert">' + esc(state.blockError) + '</p>' : '') +
      '<div class="actions"><button type="submit" class="btn btn-primary">受けない時間として登録する</button></div>' +
      '</form>';

    const blocks = [...records.blocks].sort(byDateTime);
    let list;
    if (blocks.length === 0) {
      list = '<p class="empty">登録はありません。</p>';
    } else {
      list = '<table class="admin-table">' +
        '<thead><tr><th scope="col">日付</th><th scope="col">時間帯</th><th scope="col">理由</th><th scope="col">操作</th></tr></thead><tbody>' +
        blocks.map((b) => '<tr>' +
          '<td data-label="日付">' + fmtDate(b.date) + '</td>' +
          '<td data-label="時間帯">' + blockTimeText(b) + '</td>' +
          '<td data-label="理由">' + (b.reason ? esc(b.reason) : '（なし）') + '</td>' +
          '<td data-label="操作"><button type="button" class="btn btn-secondary btn-small" data-action="admin-remove-block" data-id="' + esc(b.id) + '">削除</button></td>' +
          '</tr>').join('') +
        '</tbody></table>';
    }

    return '<p>所用・出張などで予約を受けない日時を登録します。登録した時間は、お客さん側で×になります。</p>' +
      form +
      '<h2 class="section">登録してある時間</h2>' + list;
  }

  // ---------- 見本をリセット ----------

  function renderReset() {
    return '<p>保存してある予約と「予約を受けない時間」を全部消して、最初の見本の状態に戻します。</p>' +
      '<p>見本の予約（お名前に「（見本）」がついたもの）は、今日から2週間のあいだに作り直します。</p>' +
      '<div class="actions"><button type="button" class="btn btn-primary" data-action="admin-reset">見本を最初の状態に戻す</button></div>';
  }

  // ---------- 描く ----------

  function render() {
    const records = Store.load(now());
    const tabs = TABS.map((t) =>
      '<button type="button" class="tab-btn" role="tab" aria-selected="' + (state.tab === t.id) + '" data-action="admin-tab" data-id="' + t.id + '">' + t.label + '</button>'
    ).join('');
    const body = state.tab === 'list' ? renderList(records)
      : state.tab === 'blocks' ? renderBlocks(records)
        : renderReset();
    return '<h1>教室側（たけさん用）</h1>' +
      '<div class="tabs" role="tablist" aria-label="教室側のメニュー">' + tabs + '</div>' +
      (state.message ? '<p class="' + (state.messageIsWarning ? 'notice' : 'notice-plain') + '" role="status">' + esc(state.message) + '</p>' : '') +
      body;
  }

  // ---------- 操作 ----------

  // 教室側のボタンなら処理して true を返す（呼んだ側が描き直す）
  function handleClick(action, el) {
    if (action === 'admin-tab') {
      state.tab = el.dataset.id;
      state.message = '';
    state.messageIsWarning = false;
      state.blockError = '';
      return true;
    }
    if (action === 'admin-filter') {
      state.filter = el.dataset.id;
      state.message = '';
    state.messageIsWarning = false;
      return true;
    }
    if (action === 'admin-cancel') {
      const records = Store.load(now());
      const b = records.bookings.find((x) => x.id === el.dataset.id);
      if (!b) return true;
      const ok = window.confirm(b.id + '（' + b.name + ' 様　' + fmtSlot(b.date, b.start, b.end) + '）をキャンセルしますか？\nキャンセルすると、この時間はお客さん側でまた選べるようになります。');
      if (!ok) return false;
      Store.cancelBooking(records, b.id);
      Store.save(records);
      state.message = b.id + ' をキャンセルしました。';
      state.messageIsWarning = false;
      return true;
    }
    if (action === 'admin-remove-block') {
      const records = Store.load(now());
      const b = records.blocks.find((x) => x.id === el.dataset.id);
      if (!b) return true;
      if (!window.confirm(fmtDate(b.date) + ' ' + blockTimeText(b) + ' の「受けない時間」を削除しますか？')) return false;
      Store.removeBlock(records, b.id);
      Store.save(records);
      state.message = fmtDate(b.date) + ' ' + blockTimeText(b) + ' を削除しました。';
      state.messageIsWarning = false;
      return true;
    }
    if (action === 'admin-reset') {
      if (!window.confirm('保存してある予約を全部消して、最初の見本の状態に戻します。よろしいですか？')) return false;
      Store.reset(now());
      state.message = '見本を最初の状態に戻しました。';
      state.messageIsWarning = false;
      return true;
    }
    return false;
  }

  // 入力するたびに覚えておく（描き直しても消えないように）
  function handleInput(target) {
    if (target.form && target.form.id === 'block-form') {
      state.blockForm[target.name] = target.value;
    }
  }

  // 受けない時間の登録。処理したら true
  function handleSubmit(form) {
    if (form.id !== 'block-form') return false;
    const f = state.blockForm;
    state.message = '';
    state.messageIsWarning = false;
    if (!f.date) {
      state.blockError = '日付を選んでください';
    } else if (f.start >= f.end) {
      state.blockError = '終わりの時刻は、始まりより後にしてください';
    } else {
      const records = Store.load(now());
      // 予約が入っている時間でも登録はできる。予約は消さずに残し、件数を知らせる
      const count = Availability.bookingsOverlapping(records, f.date, f.start, f.end).length;
      const when = fmtDate(f.date) + ' ' + blockTimeText(f);
      if (count > 0 && !window.confirm(when + ' に予約が' + count + '件あります。\n登録しても予約は消えません（必要ならお客様へご連絡ください）。\n登録しますか？')) {
        return true;
      }
      Store.addBlock(records, f);
      Store.save(records);
      state.blockError = '';
      state.message = when + ' を登録しました。' +
        (count > 0 ? 'この時間に予約が' + count + '件あります（予約は残っています）。' : '');
      state.messageIsWarning = count > 0;
      state.blockForm = { date: '', start: RULES.openTime, end: RULES.closeTime, reason: '' };
    }
    return true;
  }

  return { render, handleClick, handleInput, handleSubmit };
})();
