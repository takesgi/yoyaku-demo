// =============================================================
// js/app.js — お客さん側の画面（トップ・①〜⑦）
//
// しくみ：
//   - いまの画面と、選んだ内容は state にまとめて持つ
//   - 画面を変えるときは go('画面の名前') を呼ぶ。履歴に積むので、ブラウザの「戻る」も効く
//   - render() が state を見て、画面を丸ごと描き直す
//   - ボタンには data-action をつけておき、クリックは1か所（onClick）でまとめて受ける
// 空きの計算は Availability、金額は Price、保存は Store にまかせる（ここでは計算しない）
// =============================================================

const App = (function () {
  // 手順の順番（top と done は「手順◯/6」に数えない）
  const STEPS = ['course', 'place', 'date', 'time', 'info', 'confirm'];
  const STEP_TITLES = {
    course: '講座を選ぶ',
    place: '受ける場所を選ぶ',
    date: '日付を選ぶ',
    time: '時間を選ぶ',
    info: 'お客様情報',
    confirm: '予約内容の確認',
    done: 'ご予約を受け付けました',
  };

  const state = {
    step: 'top',
    courseId: null,
    placeId: null,
    month: null,   // カレンダーに出している月 'YYYY-MM'
    date: null,
    start: null,
    info: { ...DUMMY_CUSTOMER },
    errors: {},    // 入力のまちがい（項目名 → 文）
    notice: '',    // 「先に予約が入りました…」などの案内
    booking: null, // 確定した予約（完了画面で使う）
  };

  const appEl = document.getElementById('app');
  const summaryEl = document.getElementById('summary');

  // ---------- 小さな道具 ----------

  // 入力された文字をそのまま画面に出すときは、必ずこれを通す
  function esc(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // '09:00' → '9:00'
  function fmtTime(time) {
    return time.replace(/^0/, '');
  }

  // '2026-11-05' → '11月5日（木）'（withYear なら '2026年11月5日（木）'）
  function fmtDate(date, withYear) {
    const [y, m, d] = date.split('-').map(Number);
    const w = '日月火水木金土'[Availability.weekday(date)];
    return (withYear ? y + '年' : '') + m + '月' + d + '日（' + w + '）';
  }

  function fmtSlot(date, start, end, withYear) {
    return fmtDate(date, withYear) + ' ' + fmtTime(start) + '〜' + fmtTime(end);
  }

  function course() { return state.courseId ? Availability.findCourse(state.courseId) : null; }
  function place() { return state.placeId ? Availability.findPlace(state.placeId) : null; }

  function endOf(start) {
    return Availability.toTime(Availability.toMinutes(start) + course().minutes);
  }

  function now() { return new Date(); }

  // ---------- 画面の移り変わり ----------

  function go(step, replace) {
    state.step = step;
    const method = replace ? 'replaceState' : 'pushState';
    history[method]({ step }, '', step === 'top' ? location.pathname : '#' + step);
    render();
    window.scrollTo(0, 0);
  }

  function back() {
    history.back();
  }

  // 選んでいないものがあるのに先の画面へ来たら、選べる画面まで戻す
  function reachableStep(step) {
    if (step === 'done') return state.booking ? 'done' : 'top';
    const needs = {
      top: true,
      course: true,
      place: !!state.courseId,
      date: !!(state.courseId && state.placeId),
      time: !!(state.courseId && state.placeId && state.date),
      info: !!(state.courseId && state.placeId && state.date && state.start),
      confirm: !!(state.courseId && state.placeId && state.date && state.start),
    };
    return needs[step] ? step : 'top';
  }

  // ブラウザの「戻る」「進む」
  window.addEventListener('popstate', (e) => {
    const step = (e.state && e.state.step) || 'top';
    // 予約が終わったあとに戻ったときは、二重に予約しないよう最初からにする
    if (state.booking && step !== 'done') resetDraft();
    state.step = reachableStep(step);
    state.notice = '';
    render();
  });

  function resetDraft() {
    state.courseId = null;
    state.placeId = null;
    state.month = null;
    state.date = null;
    state.start = null;
    state.info = { ...DUMMY_CUSTOMER };
    state.errors = {};
    state.notice = '';
    state.booking = null;
  }

  // ---------- 共通の部品 ----------

  function stepHead(step) {
    const index = STEPS.indexOf(step);
    return '<div class="step-head">' +
      '<button type="button" class="btn-back" data-action="back">‹ 戻る</button>' +
      (index >= 0 ? '<p class="step-count">手順 ' + (index + 1) + ' / ' + STEPS.length + '</p>' : '') +
      '</div>' +
      '<h1>' + STEP_TITLES[step] + '</h1>';
  }

  function nextButton(label, action) {
    return '<div class="actions"><button type="button" class="btn btn-primary" data-action="' +
      action + '">' + label + '</button></div>';
  }

  function strongNotice() {
    return '<p class="demo-notice-strong">' + DEMO_NOTICE + '</p>';
  }

  // 場所の説明（出張は出張費の文も）
  function placeDetail(p) {
    return esc(p.detail) + (p.feeText ? '<br>' + esc(p.feeText) : '');
  }

  // ---------- トップ ----------

  function renderTop() {
    const places = PLACES.map((p) =>
      '<li><span class="place-name">' + esc(p.name) + '</span><span class="place-detail">' + placeDetail(p) + '</span></li>'
    ).join('');
    return '<section class="hero">' +
      '<h1>' + esc(SCHOOL.name) + '</h1>' +
      '<p class="lead">' + esc(SCHOOL.intro) + '</p>' +
      '<button type="button" class="btn btn-primary btn-large" data-action="start">予約する</button>' +
      '</section>' +
      '<section class="section"><h2>受けられる場所</h2><ul class="place-list">' + places + '</ul></section>' +
      '<section class="section"><h2>営業時間</h2>' +
      '<p>' + esc(SCHOOL.hoursText) + '</p>' +
      '<p class="sub">ご予約は、前の営業日の' + fmtTime(RULES.deadlineTime) + 'まで・' + RULES.maxDaysAhead + '日先まで受け付けます。</p>' +
      '</section>';
  }

  // ---------- ① 講座を選ぶ ----------

  function renderCourse() {
    const choices = COURSES.map((c) => {
      const selected = c.id === state.courseId;
      return '<button type="button" class="choice" role="radio" aria-checked="' + selected + '" data-action="select-course" data-id="' + c.id + '">' +
        '<span class="choice-title">' + esc(c.name) + '</span>' +
        '<span class="choice-meta">' + c.minutes + '分 ・ ' + Price.formatCourse(c) + '</span>' +
        '<span class="choice-desc">' + esc(c.description) + '</span>' +
        '</button>';
    }).join('');

    const notes = COURSE_NOTES.map((n) => '<li>' + esc(n) + '</li>').join('');
    const tickets = TICKETS.map((t) => {
      const c = Availability.findCourse(t.courseId);
      return '<tr><th scope="row">' + esc(c.name) + ' ' + t.count + '回分</th><td>' + Price.format(t.price) + '</td></tr>';
    }).join('');

    return stepHead('course') +
      '<div class="choice-list" role="radiogroup" aria-label="講座">' + choices + '</div>' +
      '<ul class="notes">' + notes + '</ul>' +
      '<div class="tickets">' +
      '<table><caption>チケット（' + esc(TICKET_NOTE) + '）</caption>' +
      '<thead><tr><th scope="col">講座・回数</th><th scope="col">金額</th></tr></thead>' +
      '<tbody>' + tickets + '</tbody></table>' +
      '<p class="sub">' + esc(PAYMENT_NOTE) + '</p>' +
      '</div>' +
      (state.courseId ? nextButton('次へ：受ける場所を選ぶ', 'to-place') : '');
  }

  // ---------- ② 受ける場所を選ぶ ----------

  function renderPlace() {
    const choices = PLACES.map((p) => {
      const selected = p.id === state.placeId;
      return '<button type="button" class="choice" role="radio" aria-checked="' + selected + '" data-action="select-place" data-id="' + p.id + '">' +
        '<span class="choice-title">' + esc(p.name) + '</span>' +
        '<span class="choice-desc">' + placeDetail(p) + '</span>' +
        '</button>';
    }).join('');
    return stepHead('place') +
      '<div class="choice-list" role="radiogroup" aria-label="受ける場所">' + choices + '</div>' +
      (state.placeId ? nextButton('次へ：日付を選ぶ', 'to-date') : '');
  }

  // ---------- ③ 日付を選ぶ ----------

  function monthRange() {
    const today = Availability.nowInJapan(now()).date;
    return {
      first: today.slice(0, 7),
      last: Availability.addDays(today, RULES.maxDaysAhead).slice(0, 7),
    };
  }

  function shiftMonth(month, diff) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + diff, 1));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  const MARK_TEXT = { '○': '空きあり', '△': '残りわずか', '×': '満席・休み' };
  const MARK_CLASS = { '○': 'mark-ok', '△': 'mark-few', '×': 'mark-none' };

  function renderDate() {
    const condition = { courseId: state.courseId, placeId: state.placeId };
    const result = Availability.getAvailability({ ...condition, month: state.month }, now());
    const range = monthRange();
    const [y, m] = state.month.split('-').map(Number);

    let earliest;
    if (result.earliest) {
      const e = result.earliest;
      earliest = '<div class="earliest">' +
        '<p class="earliest-label">いちばん早く取れる日時</p>' +
        '<p class="earliest-value">' + fmtSlot(e.date, e.start, e.end) + '</p>' +
        '<button type="button" class="btn btn-secondary" data-action="earliest" data-date="' + e.date + '" data-start="' + e.start + '">この日時で進む</button>' +
        '</div>';
    } else {
      earliest = '<div class="earliest"><p>' + RULES.maxDaysAhead + '日先までに、空いている日時がありません。</p></div>';
    }

    // カレンダー：1日の曜日の分だけ空けてから並べる
    const cells = [];
    const firstWeekday = Availability.weekday(result.days[0].date);
    for (let i = 0; i < firstWeekday; i++) cells.push('<td></td>');
    result.days.forEach((day) => {
      const num = Number(day.date.slice(8));
      const label = fmtDate(day.date) + ' ' + MARK_TEXT[day.mark] + (day.holidayName ? '（' + day.holidayName + '）' : '');
      const inner = '<span class="cal-num">' + num + '</span><span class="cal-mark" aria-hidden="true">' + day.mark + '</span>';
      const cls = 'cal-day ' + MARK_CLASS[day.mark] + (day.date === state.date ? ' is-selected' : '');
      if (day.mark === '×') {
        cells.push('<td><span class="' + cls + '" aria-label="' + label + '">' + inner + '</span></td>');
      } else {
        cells.push('<td><button type="button" class="' + cls + '" aria-label="' + label + '" data-action="select-date" data-date="' + day.date + '">' + inner + '</button></td>');
      }
    });
    while (cells.length % 7 !== 0) cells.push('<td></td>');
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push('<tr>' + cells.slice(i, i + 7).join('') + '</tr>');

    const prevDisabled = state.month <= range.first ? ' disabled' : '';
    const nextDisabled = state.month >= range.last ? ' disabled' : '';

    return stepHead('date') +
      earliest +
      '<p class="sub">または、カレンダーから日付を選んでください。</p>' +
      '<p class="legend"><span class="mark-ok">○ 空きあり</span><span class="mark-few">△ 残りわずか</span><span class="mark-none-text">× 満席・休み</span></p>' +
      '<div class="cal-nav">' +
      '<button type="button" class="btn-month" data-action="prev-month"' + prevDisabled + '>‹ 前の月</button>' +
      '<h2 class="cal-title">' + y + '年' + m + '月</h2>' +
      '<button type="button" class="btn-month" data-action="next-month"' + nextDisabled + '>次の月 ›</button>' +
      '</div>' +
      '<table class="calendar"><thead><tr>' +
      ['日', '月', '火', '水', '木', '金', '土'].map((w) => '<th scope="col">' + w + '</th>').join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
      '<p class="sub">土日祝・年末年始はお休みです。ご予約は前の営業日の' + fmtTime(RULES.deadlineTime) + 'まで受け付けます。</p>';
  }

  // ---------- ④ 時間を選ぶ ----------

  function renderTime() {
    const day = Availability.getAvailability(
      { courseId: state.courseId, placeId: state.placeId, date: state.date }, now()).days[0];
    const open = day.slots.filter((s) => s.available);

    const notice = state.notice ? '<p class="notice" role="status">' + esc(state.notice) + '</p>' : '';
    let list;
    if (open.length === 0) {
      list = '<p>この日は空いている時間がありません。戻って、別の日をお選びください。</p>';
    } else {
      list = '<div class="time-list" role="radiogroup" aria-label="開始時刻">' + open.map((s) =>
        '<button type="button" class="time-btn" role="radio" aria-checked="' + (s.start === state.start) + '" data-action="select-time" data-start="' + s.start + '">' +
        fmtTime(s.start) + '〜' + fmtTime(s.end) + '</button>'
      ).join('') + '</div>';
    }

    const chosen = state.start
      ? '<p class="chosen">選んだ時間：<strong>' + fmtSlot(state.date, state.start, endOf(state.start)) + '</strong>（' + course().minutes + '分）</p>' +
        nextButton('次へ：お客様情報', 'to-info')
      : '';

    return stepHead('time') +
      notice +
      '<p class="day-title">' + fmtDate(state.date, true) + '</p>' +
      '<p class="sub">空いている開始時刻です。終わりの時刻も書いてあります。</p>' +
      list + chosen;
  }

  // ---------- ⑤ お客様情報 ----------

  const FIELDS = [
    { key: 'name', label: 'お名前', type: 'text', autocomplete: 'name', required: true },
    { key: 'phone', label: '電話番号', type: 'tel', autocomplete: 'tel', required: true },
    { key: 'email', label: 'メールアドレス', type: 'email', autocomplete: 'email', required: true },
    { key: 'note', label: 'ご要望', type: 'textarea', required: false },
  ];

  function renderInfo() {
    const fields = FIELDS.map((f) => {
      const id = 'f-' + f.key;
      const error = state.errors[f.key];
      const tag = '<span class="' + (f.required ? 'tag-req' : 'tag-opt') + '">' + (f.required ? '必須' : '任意') + '</span>';
      const aria = error ? ' aria-invalid="true" aria-describedby="' + id + '-err"' : '';
      const input = f.type === 'textarea'
        ? '<textarea id="' + id + '" name="' + f.key + '" rows="4"' + aria + '>' + esc(state.info[f.key]) + '</textarea>'
        : '<input id="' + id + '" name="' + f.key + '" type="' + f.type + '" autocomplete="' + f.autocomplete + '" value="' + esc(state.info[f.key]) + '"' + aria + '>';
      return '<div class="field">' +
        '<label for="' + id + '">' + f.label + ' ' + tag + '</label>' +
        input +
        (error ? '<p class="field-error" id="' + id + '-err">' + esc(error) + '</p>' : '') +
        '</div>';
    }).join('');

    return stepHead('info') +
      '<p class="notice-plain">見本のため、最初から見本の値を入れてあります。入力した内容はこのブラウザの中にだけ残り、どこにも送られません。</p>' +
      '<form id="info-form" novalidate>' + fields +
      '<div class="actions"><button type="submit" class="btn btn-primary">次へ：予約内容の確認</button></div>' +
      '</form>';
  }

  // 入力のまちがいを調べる（まちがいがなければ空のオブジェクト）
  function validate(info) {
    const errors = {};
    if (!info.name.trim()) errors.name = 'お名前を入れてください';
    if (!info.phone.trim()) errors.phone = '電話番号を入れてください';
    else if (!/^[0-9０-９\-－ ]{10,15}$/.test(info.phone.trim())) errors.phone = '電話番号は数字で入れてください（例 090-0000-0000）';
    if (!info.email.trim()) errors.email = 'メールアドレスを入れてください';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(info.email.trim())) errors.email = 'メールアドレスの形をお確かめください（例 mihon@example.com）';
    return errors;
  }

  // ---------- ⑥ 確認 ----------

  // withPlaceDetail：場所の説明も一覧に入れるか（完了画面では「場所のご案内」に分けて出す）
  function detailList(booking, withPlaceDetail) {
    const c = Availability.findCourse(booking.courseId);
    const p = Availability.findPlace(booking.placeId);
    const rows = [
      ['講座', esc(c.name)],
      ['日時', fmtSlot(booking.date, booking.start, booking.end, true) + '（' + c.minutes + '分）'],
      ['場所', esc(p.name) + (withPlaceDetail ? '<br><span class="sub">' + placeDetail(p) + '</span>' : '')],
      ['受講料', Price.formatCourse(c) + '<br><span class="sub">' + esc(PAYMENT_NOTE) + '</span>'],
      ['お名前', esc(booking.name)],
      ['電話番号', esc(booking.phone)],
      ['メールアドレス', esc(booking.email)],
      ['ご要望', booking.note ? esc(booking.note).replace(/\n/g, '<br>') : '（なし）'],
    ];
    return '<dl class="details">' + rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>';
  }

  function draft() {
    return {
      date: state.date,
      start: state.start,
      end: endOf(state.start),
      courseId: state.courseId,
      placeId: state.placeId,
      name: state.info.name.trim(),
      phone: state.info.phone.trim(),
      email: state.info.email.trim(),
      note: state.info.note.trim(),
    };
  }

  function contactBox() {
    return '<section class="contact-box">' +
      '<h2>変更・キャンセルについて</h2>' +
      '<p>ご予約の変更・キャンセルは、<strong>' + esc(CONTACT.deadlineText) + '</strong>に、お電話かメールでご連絡ください。</p>' +
      '<p>電話：' + esc(CONTACT.phone) + '<br>メール：' + esc(CONTACT.email) + '</p>' +
      '</section>';
  }

  function renderConfirm() {
    return stepHead('confirm') +
      strongNotice() +
      '<p>まだ予約は確定していません。内容をお確かめのうえ、下のボタンを押してください。</p>' +
      detailList(draft(), true) +
      contactBox() +
      '<div class="actions"><button type="button" class="btn btn-primary btn-large" data-action="confirm">この内容で予約する</button></div>';
  }

  // ---------- ⑦ 完了 ----------

  function placeGuide(p) {
    if (p.id === 'office') return '事務所：' + esc(p.detail);
    return esc(p.detail) + (p.feeText ? '<br>' + esc(p.feeText) : '');
  }

  function emailText(b) {
    const c = Availability.findCourse(b.courseId);
    const p = Availability.findPlace(b.placeId);
    const lines = [
      '件名：【' + SCHOOL.name + '】ご予約を受け付けました',
      '',
      b.name + ' 様',
      '',
      SCHOOL.name + 'です。レッスンのご予約を受け付けました。',
      '',
      '■予約番号',
      b.id,
      '■日時',
      fmtSlot(b.date, b.start, b.end, true) + '（' + c.minutes + '分）',
      '■講座',
      c.name,
      '■場所',
      p.name + '：' + p.detail,
    ];
    if (p.feeText) lines.push(p.feeText);
    lines.push(
      '■受講料',
      Price.formatCourse(c),
      PAYMENT_NOTE,
      '',
      '変更・キャンセルは、' + CONTACT.deadlineText + 'にご連絡ください。',
      '電話：' + CONTACT.phone,
      'メール：' + CONTACT.email,
      '',
      '※' + DEMO_NOTICE + '。'
    );
    return lines.join('\n');
  }

  function renderDone() {
    const b = state.booking;
    const p = Availability.findPlace(b.placeId);
    const flow = AFTER_FLOW[p.id].map((t) => '<li>' + esc(t) + '</li>').join('');
    return '<h1>' + STEP_TITLES.done + '</h1>' +
      strongNotice() +
      '<div class="booking-number"><p class="booking-number-label">予約番号</p><p class="booking-number-value">' + esc(b.id) + '</p></div>' +
      detailList(b, false) +
      '<section class="section"><h2>場所のご案内</h2><p>' + placeGuide(p) + '</p></section>' +
      '<section class="section"><h2>このあとの流れ</h2><ol class="flow">' + flow + '</ol></section>' +
      contactBox() +
      '<section class="section"><h2>確認メールの文面（見本）</h2>' +
      '<p class="sub">見本のため、メールは送られません。実際にはこのような文面が届きます。</p>' +
      '<pre class="email-preview">' + esc(emailText(b)) + '</pre></section>' +
      '<div class="actions"><button type="button" class="btn btn-secondary" data-action="home">トップへ戻る</button></div>';
  }

  // ---------- 画面の下の「選んだ内容」 ----------

  function renderSummary() {
    const showOn = ['course', 'place', 'date', 'time', 'info', 'confirm'];
    const hide = !state.courseId || !showOn.includes(state.step);
    // パソコンで「選んだ内容」を出さない画面は、本文をまん中に寄せる
    summaryEl.parentElement.classList.toggle('no-summary', hide);
    if (hide) {
      summaryEl.hidden = true;
      document.body.style.paddingBottom = '';
      return;
    }
    const c = course();
    const p = place();
    const when = state.date && state.start
      ? fmtSlot(state.date, state.start, endOf(state.start))
      : (state.date ? fmtDate(state.date) + '（時間はまだ）' : 'まだ選んでいません');
    summaryEl.hidden = false;
    summaryEl.innerHTML =
      '<p class="summary-title">選んだ内容</p>' +
      '<dl class="summary-list">' +
      '<div><dt>講座</dt><dd>' + esc(c.name) + '（' + c.minutes + '分）</dd></div>' +
      '<div><dt>金額</dt><dd>' + Price.formatCourse(c) + '</dd></div>' +
      '<div><dt>場所</dt><dd>' + (p ? esc(p.name) : 'まだ選んでいません') + '</dd></div>' +
      '<div><dt>日時</dt><dd>' + when + '</dd></div>' +
      '</dl>';
    // スマホでは下に固定の帯なので、その高さの分だけ本文の下をあける
    document.body.style.paddingBottom = getComputedStyle(summaryEl).position === 'fixed'
      ? summaryEl.offsetHeight + 'px' : '';
  }

  // ---------- 描く ----------

  const RENDERERS = {
    top: renderTop,
    course: renderCourse,
    place: renderPlace,
    date: renderDate,
    time: renderTime,
    info: renderInfo,
    confirm: renderConfirm,
    done: renderDone,
  };

  function render() {
    appEl.innerHTML = RENDERERS[state.step]();
    document.title = (state.step === 'top' ? '' : STEP_TITLES[state.step] + ' — ') + SCHOOL.name + ' レッスン予約（見本）';
    renderSummary();
  }

  // ---------- 操作 ----------

  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const action = el.dataset.action;

    if (action === 'back') back();
    else if (action === 'start') { resetDraft(); go('course'); }
    else if (action === 'select-course') {
      if (state.courseId !== el.dataset.id) { state.date = null; state.start = null; }
      state.courseId = el.dataset.id;
      render();
    }
    else if (action === 'to-place') go('place');
    else if (action === 'select-place') {
      // 場所が変わると空きも変わるので、選んでいた日時は選びなおしてもらう
      if (state.placeId !== el.dataset.id) { state.date = null; state.start = null; }
      state.placeId = el.dataset.id;
      render();
    }
    else if (action === 'to-date') {
      if (!state.month) state.month = monthRange().first;
      go('date');
    }
    else if (action === 'prev-month') { state.month = shiftMonth(state.month, -1); render(); }
    else if (action === 'next-month') { state.month = shiftMonth(state.month, 1); render(); }
    else if (action === 'select-date') {
      if (state.date !== el.dataset.date) state.start = null;
      state.date = el.dataset.date;
      state.notice = '';
      go('time');
    }
    else if (action === 'earliest') {
      state.date = el.dataset.date;
      state.start = el.dataset.start;
      state.month = state.date.slice(0, 7);
      state.notice = '';
      go('time');
    }
    else if (action === 'select-time') { state.start = el.dataset.start; state.notice = ''; render(); }
    else if (action === 'to-info') go('info');
    else if (action === 'confirm') confirmBooking();
    else if (action === 'home') { resetDraft(); go('top'); }
  }

  // 確定：直前にもう一度、その枠が空いているかを確かめる（Store.addBooking の中で）
  function confirmBooking() {
    const at = now();
    const records = Store.load(at);
    const result = Store.addBooking(records, draft(), at);
    if (!result.ok) {
      // 責めない言い方で案内し、時間を選びなおしてもらう。お名前などの入力はそのまま残す
      state.notice = result.message;
      state.start = null;
      go('time', true);
      return;
    }
    Store.save(records);
    state.booking = result.booking;
    go('done', true);
  }

  // 入力するたびに state に写しておく（戻っても消えないように）
  function onInput(e) {
    if (e.target.form && e.target.form.id === 'info-form') {
      state.info[e.target.name] = e.target.value;
    }
  }

  function onSubmit(e) {
    if (e.target.id !== 'info-form') return;
    e.preventDefault();
    state.errors = validate(state.info);
    if (Object.keys(state.errors).length > 0) {
      render();
      const first = appEl.querySelector('[aria-invalid="true"]');
      if (first) first.focus();
      return;
    }
    go('confirm');
  }

  // ---------- はじめ ----------

  function start() {
    document.getElementById('demo-notice').textContent = DEMO_NOTICE;
    document.getElementById('site-name').textContent = SCHOOL.name + ' レッスン予約';
    Store.load(now()); // 見本データがなければ作る
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('submit', onSubmit);
    window.addEventListener('resize', renderSummary);
    history.replaceState({ step: 'top' }, '', location.pathname);
    render();
  }

  return { start };
})();

App.start();
