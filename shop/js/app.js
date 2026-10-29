// =============================================================
// shop/js/app.js — お客さん側の画面（2つの型）
// レッスン予約の js/app.js と同じしくみ：
//   - いまの画面と選んだ内容は state にまとめる
//   - 画面を変えるときは go('画面の名前')。履歴に積むので、ブラウザの「戻る」も効く
//   - render() が state を見て画面を丸ごと描き直す
//   - ボタンには data-action をつけ、クリックは1か所（onClick）で受ける
// 空きの計算は ShopAvailability、金額は ShopPrice、保存は ShopStore にまかせる
//
// 手順：飲食店＝コース → 人数と席 → 日付 → 時間 → お客様情報 → 確認 → 完了
//       サロン＝メニュー → 担当 → 日付 → 時間 → お客様情報 → 確認 → 完了
// =============================================================

const ShopApp = (function () {
  const { esc, fmtTime, fmtDate, fmtSlot, cancelPolicyLines } = ShopFormat;

  const state = {
    shopId: SAMPLE_SHOPS[0].id,
    step: 'top',
    menuId: null,
    partySize: null, // 飲食店
    seatKind: 'any', // 飲食店：席の種類の希望（どれでもよい が既定）
    staffId: null,   // サロン：担当（'any' は指名なし）
    month: null,
    date: null,
    start: null,
    info: { ...SHOP_DUMMY_CUSTOMER },
    errors: {},
    notice: '',
    booking: null,
  };

  const appEl = document.getElementById('app');
  const summaryEl = document.getElementById('summary');

  function now() { return new Date(); }
  function data() { return ShopStore.load(now()); }
  function shop() { return data().shops.find((s) => s.id === state.shopId); }
  function records() { return data().records[state.shopId]; }
  function steps() { return SHOP_STEPS[shop().type]; }
  function stepTitle(id) {
    if (id === 'done') return 'ご予約を受け付けました';
    const s = steps().find((x) => x.id === id);
    return s ? s.title : '';
  }
  function menu() { return state.menuId ? ShopAvailability.findMenu(shop(), state.menuId) : null; }
  function isRestaurant() { return shop().type === 'restaurant'; }

  function endOf(start) {
    return ShopAvailability.toTime(ShopAvailability.toMinutes(start) + menu().minutes);
  }

  // 空きの計算に渡す条件（型ごとに中身がちがう）
  function condition(extra) {
    return {
      menuId: state.menuId,
      partySize: state.partySize,
      seatKind: state.seatKind,
      staffId: state.staffId,
      records: records(),
      ...extra,
    };
  }

  // ---------- 画面の移り変わり ----------

  function go(step, replace) {
    state.step = step;
    history[replace ? 'replaceState' : 'pushState']({ step, shopId: state.shopId }, '', step === 'top' ? location.pathname : '#' + step);
    render();
    window.scrollTo(0, 0);
  }

  // 選んでいないものがあるのに先の画面へ来たら、トップに戻す
  function reachableStep(step) {
    if (step === 'done') return state.booking ? 'done' : 'top';
    const second = isRestaurant() ? !!state.partySize : !!state.staffId;
    const needs = {
      top: true,
      menu: true,
      party: !!state.menuId,
      staff: !!state.menuId,
      date: !!state.menuId && second,
      time: !!state.menuId && second && !!state.date,
      info: !!state.menuId && second && !!state.date && !!state.start,
      confirm: !!state.menuId && second && !!state.date && !!state.start,
    };
    return needs[step] ? step : 'top';
  }

  window.addEventListener('popstate', (e) => {
    const step = (e.state && e.state.step) || 'top';
    if (e.state && e.state.shopId && e.state.shopId !== state.shopId) { state.shopId = e.state.shopId; resetDraft(); }
    if (state.booking && step !== 'done') resetDraft(); // 予約のあとに戻っても、二重に予約しないよう最初から
    state.step = reachableStep(step);
    state.notice = '';
    render();
  });

  function resetDraft() {
    Object.assign(state, {
      menuId: null, partySize: null, seatKind: 'any', staffId: null,
      month: null, date: null, start: null,
      info: { ...SHOP_DUMMY_CUSTOMER }, errors: {}, notice: '', booking: null,
    });
  }

  // コース・人数・席・担当を選びなおしたら、選んでいた日時は消す（空きが変わるため）
  function clearDateTime() {
    state.date = null;
    state.start = null;
  }

  // ---------- 共通の部品 ----------

  function stepHead(step) {
    const index = steps().findIndex((s) => s.id === step);
    return '<div class="step-head">' +
      '<button type="button" class="btn-back" data-action="back">‹ 戻る</button>' +
      (index >= 0 ? '<p class="step-count">手順 ' + (index + 1) + ' / ' + steps().length + '</p>' : '') +
      '</div><h1>' + stepTitle(step) + '</h1>';
  }

  function nextButton(label, action) {
    return '<div class="actions"><button type="button" class="btn btn-primary" data-action="' + action + '">' + label + '</button></div>';
  }

  function strongNotice() {
    return '<p class="demo-notice-strong">' + SHOP_COMMON.demoNotice + '</p>';
  }

  // 部ごとの営業時間の文（例：昼 11:30〜14:00／夜 17:30〜21:00）
  function hoursText(s, weekdayIndex) {
    const parts = s.weeklyHours[weekdayIndex] || [];
    return parts.map((p, i) => (s.partNames[i] ? s.partNames[i] + ' ' : '') + fmtTime(p.start) + '〜' + fmtTime(p.end)).join('／');
  }

  // 定休日の文（例：水曜定休）
  function closedText(s) {
    if (s.closedWeekdays.length === 0) return '定休日なし';
    return s.closedWeekdays.map((w) => '日月火水木金土'[w]).join('・') + '曜定休';
  }

  // メニューが受ける部（例：昼のみ）
  function partsBadge(s, m) {
    if (m.parts.length === 0 || s.partNames.length < 2) return '';
    return '<span class="badge">' + m.parts.map((i) => esc(s.partNames[i])).join('・') + 'のみ</span>';
  }

  function resourceName(s, id) {
    const r = ShopAvailability.findResource(s, id);
    return r ? r.name : '';
  }

  // お客さんの希望と割り当ての文
  function choiceText(s, b) {
    if (s.type === 'restaurant') {
      return b.partySize + '名・' + (b.seatKind === 'any' || !b.seatKind ? '席はどれでもよい' : esc(b.seatKind) + '席');
    }
    return b.staffId === 'any' ? '指名なし' : esc(resourceName(s, b.staffId)) + '（指名）';
  }

  function priceText(s, m, partySize) {
    if (m.price === null) return 'コースの料金はありません（お料理はお席でお選びください）';
    return ShopPrice.formatMenuFor(s, m, partySize);
  }

  // ---------- トップ ----------

  function renderTop() {
    const s = shop();
    const days = [1, 2, 3, 4, 5, 6, 0].filter((w) => !s.closedWeekdays.includes(w));
    // 曜日ごとに営業時間がちがうお店もあるので、同じ時間の曜日をまとめて書く
    const groups = [];
    days.forEach((w) => {
      const text = hoursText(s, w);
      const g = groups.find((x) => x.text === text);
      if (g) g.days.push(w); else groups.push({ text, days: [w] });
    });
    const hours = groups.map((g) =>
      '<li>' + (groups.length > 1 ? g.days.map((w) => '日月火水木金土'[w]).join('・') + '：' : '') + esc(g.text) + '</li>').join('');
    return '<section class="hero">' +
      '<h1>' + esc(s.name) + '</h1>' +
      '<p class="lead">' + esc(s.intro) + '</p>' +
      '<button type="button" class="btn btn-primary btn-large" data-action="start">予約する</button>' +
      '</section>' +
      '<section class="section"><h2>営業時間</h2><ul class="plain-list">' + hours + '</ul>' +
      '<p>' + closedText(s) + '</p>' +
      '<p class="sub">ご予約は、' + s.rules.maxDaysAhead + '日先まで、ご来店の' + s.rules.deadlineHours + '時間前まで受け付けます。</p></section>' +
      '<section class="section"><h2>お店の場所・連絡先</h2>' +
      '<p>' + esc(s.address) + (s.mapUrl ? '<br><a href="' + esc(s.mapUrl) + '" target="_blank" rel="noopener">地図を見る</a>' : '') + '</p>' +
      '<p>電話：' + esc(s.phone) + '</p></section>';
  }

  // ---------- ① コース／メニュー ----------

  function renderMenu() {
    const s = shop();
    const choices = s.menus.map((m) => {
      const price = m.price === null ? '料金はお席で' : ShopPrice.formatMenuFor(s, m, null);
      return '<button type="button" class="choice" role="radio" aria-checked="' + (m.id === state.menuId) + '" data-action="select-menu" data-id="' + m.id + '">' +
        '<span class="choice-title">' + esc(m.name) + ' ' + partsBadge(s, m) + '</span>' +
        '<span class="choice-meta">' + m.minutes + '分 ・ ' + price + '</span>' +
        '<span class="choice-desc">' + esc(m.description) + '</span>' +
        '</button>';
    }).join('');
    const nextLabel = isRestaurant() ? '次へ：人数と席を選ぶ' : '次へ：担当を選ぶ';
    return stepHead('menu') +
      '<div class="choice-list" role="radiogroup" aria-label="' + stepTitle('menu') + '">' + choices + '</div>' +
      '<p class="sub">金額は税別と税込の両方を書いています。お支払いはお店でお願いします。</p>' +
      (state.menuId ? nextButton(nextLabel, 'to-second') : '');
  }

  // ---------- ② 人数と席（飲食店） ----------

  function maxPartySize(s) {
    return Math.max(...s.seats.map((x) => x.capacity));
  }

  function renderParty() {
    const s = shop();
    const max = maxPartySize(s);
    const sizes = [];
    for (let n = 1; n <= max; n++) {
      sizes.push('<button type="button" class="size-btn" role="radio" aria-checked="' + (state.partySize === n) + '" data-action="select-party" data-size="' + n + '">' + n + '名</button>');
    }
    // 席の種類：その人数が入れる種類だけを選べるようにする
    let kinds = '';
    if (state.partySize) {
      const fits = (kind) => s.seats.some((x) => x.kind === kind && x.capacity >= state.partySize);
      const options = [{ id: 'any', label: 'どれでもよい' }].concat(
        SEAT_KINDS.filter((k) => s.seats.some((x) => x.kind === k)).map((k) => ({ id: k, label: k })));
      kinds = '<h2 class="section">席の種類</h2>' +
        '<div class="choice-list" role="radiogroup" aria-label="席の種類">' + options.map((o) => {
          const ok = o.id === 'any' || fits(o.id);
          const cap = o.id === 'any' ? '空いている席からお店が選びます' :
            s.seats.filter((x) => x.kind === o.id).map((x) => x.capacity).filter((v, i, a) => a.indexOf(v) === i).map((c) => c + '名まで').join('・');
          return '<button type="button" class="choice" role="radio" aria-checked="' + (state.seatKind === o.id) + '"' +
            (ok ? '' : ' disabled aria-disabled="true"') + ' data-action="select-seat" data-id="' + esc(o.id) + '">' +
            '<span class="choice-title">' + esc(o.label) + '</span>' +
            '<span class="choice-desc">' + (ok ? cap : state.partySize + '名では使えません（' + cap + '）') + '</span></button>';
        }).join('') + '</div>';
    }
    return stepHead('party') +
      '<h2>人数</h2>' +
      '<div class="size-list" role="radiogroup" aria-label="人数">' + sizes.join('') + '</div>' +
      '<p class="sub">' + (max + 1) + '名以上のときは、お店へお電話ください（' + esc(s.phone) + '）。</p>' +
      kinds +
      (state.partySize ? nextButton('次へ：日付を選ぶ', 'to-date') : '');
  }

  // ---------- ② 担当（サロン） ----------

  function renderStaff() {
    const s = shop();
    const options = [{ id: 'any', name: '指名なし', desc: '空いている担当がうかがいます' }].concat(
      s.staff.map((x) => ({ id: x.id, name: x.name, desc: x.offWeekdays.length ? x.offWeekdays.map((w) => '日月火水木金土'[w]).join('・') + '曜はお休み' : '' })));
    return stepHead('staff') +
      '<div class="choice-list" role="radiogroup" aria-label="担当">' + options.map((o) =>
        '<button type="button" class="choice" role="radio" aria-checked="' + (state.staffId === o.id) + '" data-action="select-staff" data-id="' + o.id + '">' +
        '<span class="choice-title">' + esc(o.name) + '</span>' +
        (o.desc ? '<span class="choice-desc">' + esc(o.desc) + '</span>' : '') + '</button>').join('') + '</div>' +
      (state.staffId ? nextButton('次へ：日付を選ぶ', 'to-date') : '');
  }

  // ---------- ③ 日付 ----------

  function monthRange() {
    const today = ShopAvailability.nowInJapan(now()).date;
    return { first: today.slice(0, 7), last: ShopAvailability.addDays(today, shop().rules.maxDaysAhead).slice(0, 7) };
  }

  function shiftMonth(month, diff) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + diff, 1));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  const MARK_TEXT = { '○': '空きあり', '△': '残りわずか', '×': '満席・お休み' };
  const MARK_CLASS = { '○': 'mark-ok', '△': 'mark-few', '×': 'mark-none' };

  function renderDate() {
    const result = ShopAvailability.getAvailability(shop(), condition({ month: state.month }), now());
    const range = monthRange();
    const [y, m] = state.month.split('-').map(Number);

    let earliest;
    if (result.earliest) {
      const e = result.earliest;
      earliest = '<div class="earliest"><p class="earliest-label">いちばん早く取れる日時</p>' +
        '<p class="earliest-value">' + fmtSlot(e.date, e.start, e.end) + '</p>' +
        '<button type="button" class="btn btn-secondary" data-action="earliest" data-date="' + e.date + '" data-start="' + e.start + '">この日時で進む</button></div>';
    } else {
      earliest = '<div class="earliest"><p>' + shop().rules.maxDaysAhead + '日先までに、空いている日時がありません。お店へお電話ください。</p></div>';
    }

    const cells = [];
    for (let i = 0; i < ShopAvailability.weekday(result.days[0].date); i++) cells.push('<td></td>');
    result.days.forEach((day) => {
      const label = fmtDate(day.date) + ' ' + MARK_TEXT[day.mark] + (day.reasonText ? '（' + day.reasonText + '）' : '');
      const inner = '<span class="cal-num">' + Number(day.date.slice(8)) + '</span><span class="cal-mark" aria-hidden="true">' + day.mark + '</span>';
      const cls = 'cal-day ' + MARK_CLASS[day.mark] + (day.date === state.date ? ' is-selected' : '');
      cells.push(day.mark === '×'
        ? '<td><span class="' + cls + '" aria-label="' + label + '">' + inner + '</span></td>'
        : '<td><button type="button" class="' + cls + '" aria-label="' + label + '" data-action="select-date" data-date="' + day.date + '">' + inner + '</button></td>');
    });
    while (cells.length % 7 !== 0) cells.push('<td></td>');
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push('<tr>' + cells.slice(i, i + 7).join('') + '</tr>');

    return stepHead('date') + earliest +
      '<p class="sub">または、カレンダーから日付を選んでください。</p>' +
      '<p class="legend"><span class="mark-ok"><span class="ring" aria-hidden="true"></span> 空きあり</span><span class="mark-few">△ 残りわずか</span><span class="mark-none-text">× 満席・お休み</span></p>' +
      '<div class="cal-nav">' +
      '<button type="button" class="btn-month" data-action="prev-month"' + (state.month <= range.first ? ' disabled' : '') + '>‹ 前の月</button>' +
      '<h2 class="cal-title">' + y + '年' + m + '月</h2>' +
      '<button type="button" class="btn-month" data-action="next-month"' + (state.month >= range.last ? ' disabled' : '') + '>次の月 ›</button></div>' +
      '<table class="calendar"><thead><tr>' + ['日', '月', '火', '水', '木', '金', '土'].map((w) => '<th scope="col">' + w + '</th>').join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
      '<p class="sub">' + closedText(shop()) + 'です。ご予約は、ご来店の' + shop().rules.deadlineHours + '時間前まで受け付けます。</p>';
  }

  // ---------- ④ 時間 ----------

  function renderTime() {
    const s = shop();
    const day = ShopAvailability.getAvailability(s, condition({ date: state.date }), now()).days[0];
    const open = day.slots.filter((x) => x.available);
    const notice = state.notice ? '<p class="notice" role="status">' + esc(state.notice) + '</p>' : '';

    let list;
    if (open.length === 0) {
      list = '<p>この日は空いている時間がありません。戻って、別の日をお選びください。</p>';
    } else {
      // 部ごとに分けて並べる（昼・夜）
      const parts = [...new Set(open.map((x) => x.partIndex))];
      list = parts.map((pi) => {
        const name = s.partNames[pi];
        const buttons = open.filter((x) => x.partIndex === pi).map((x) =>
          '<button type="button" class="time-btn" role="radio" aria-checked="' + (x.start === state.start) + '" data-action="select-time" data-start="' + x.start + '">' +
          fmtTime(x.start) + '〜' + fmtTime(x.end) + '</button>').join('');
        return (name ? '<h2 class="part-title">' + esc(name) + '</h2>' : '') +
          '<div class="time-list" role="radiogroup" aria-label="' + (name ? esc(name) + 'の' : '') + '開始時刻">' + buttons + '</div>';
      }).join('');
    }
    const chosen = state.start
      ? '<p class="chosen">選んだ時間：<strong>' + fmtSlot(state.date, state.start, endOf(state.start)) + '</strong>（' + menu().minutes + '分）</p>' +
        nextButton('次へ：お客様情報', 'to-info')
      : '';
    return stepHead('time') + notice +
      '<p class="day-title">' + fmtDate(state.date, true) + '</p>' +
      '<p class="sub">空いている始まりの時刻です。終わりの時刻も書いてあります。</p>' + list + chosen;
  }

  // ---------- ⑤ お客様情報 ----------

  const FIELD_DEFS = {
    name: { label: 'お名前', type: 'text', autocomplete: 'name' },
    phone: { label: '電話番号', type: 'tel', autocomplete: 'tel' },
    email: { label: 'メールアドレス', type: 'email', autocomplete: 'email' },
  };

  function askedFields() {
    const option = ASK_FOR_OPTIONS.find((o) => o.id === shop().askFor) || ASK_FOR_OPTIONS.find((o) => o.id === ASK_FOR_DEFAULT);
    return option.fields;
  }

  function renderInfo() {
    const fields = askedFields().map((key) => {
      const f = FIELD_DEFS[key];
      const id = 'f-' + key;
      const error = state.errors[key];
      const aria = error ? ' aria-invalid="true" aria-describedby="' + id + '-err"' : '';
      return '<div class="field"><label for="' + id + '">' + f.label + ' <span class="tag-req">必須</span></label>' +
        '<input id="' + id + '" name="' + key + '" type="' + f.type + '" autocomplete="' + f.autocomplete + '" value="' + esc(state.info[key]) + '"' + aria + '>' +
        (error ? '<p class="field-error" id="' + id + '-err">' + esc(error) + '</p>' : '') + '</div>';
    }).join('');
    const asked = askedFields().map((k) => FIELD_DEFS[k].label).join('と');
    return stepHead('info') +
      '<p class="notice-plain">このお店がおたずねするのは、' + asked + 'だけです。見本のため、最初から見本の値を入れてあります。入力した内容はこのブラウザの中にだけ残り、どこにも送られません。</p>' +
      '<form id="info-form" novalidate>' + fields +
      '<div class="actions"><button type="submit" class="btn btn-primary">次へ：予約内容の確認</button></div></form>';
  }

  function validate(info) {
    const errors = {};
    const asked = askedFields();
    if (!info.name.trim()) errors.name = 'お名前を入れてください';
    if (asked.includes('phone')) {
      if (!info.phone.trim()) errors.phone = '電話番号を入れてください';
      else if (!/^[0-9０-９\-－ ]{10,15}$/.test(info.phone.trim())) errors.phone = '電話番号は数字で入れてください（例 090-0000-0000）';
    }
    if (asked.includes('email')) {
      if (!info.email.trim()) errors.email = 'メールアドレスを入れてください';
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(info.email.trim())) errors.email = 'メールアドレスの形をお確かめください（例 mihon@example.com）';
    }
    return errors;
  }

  // ---------- ⑥ 確認・⑦ 完了 ----------

  function draft() {
    const asked = askedFields();
    return {
      date: state.date,
      start: state.start,
      end: endOf(state.start),
      menuId: state.menuId,
      partySize: state.partySize,
      seatKind: state.seatKind,
      staffId: state.staffId,
      name: state.info.name.trim(),
      phone: asked.includes('phone') ? state.info.phone.trim() : '',
      email: asked.includes('email') ? state.info.email.trim() : '',
    };
  }

  // 予約内容の一覧（確認画面は draft、完了画面は確定した予約）
  function detailList(b, assigned) {
    const s = shop();
    const m = ShopAvailability.findMenu(s, b.menuId);
    const rows = [
      [isRestaurant() ? 'コース' : 'メニュー', esc(m.name) + '（' + m.minutes + '分）'],
      ['日時', fmtSlot(b.date, b.start, b.end, true)],
      [isRestaurant() ? '人数・席' : '担当', choiceText(s, b) + (assigned ? '<br><span class="sub">' + assigned + '</span>' : '')],
      ['料金', priceText(s, m, b.partySize) + '<br><span class="sub">お支払いはお店でお願いします</span>'],
      ['お名前', esc(b.name)],
    ];
    if (b.phone) rows.push(['電話番号', esc(b.phone)]);
    if (b.email) rows.push(['メールアドレス', esc(b.email)]);
    return '<dl class="details">' + rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>';
  }

  // 変更・キャンセルの案内。キャンセル料ありのときは、確定の前に必ず目立つ形で出す
  function cancelBox() {
    const s = shop();
    const lines = cancelPolicyLines(s);
    const fee = s.cancel.feeEnabled ? '<p class="fee-notice"><strong>キャンセル料があります</strong><br>' + esc(s.cancel.feeDetail) + '</p>' : '';
    return '<section class="contact-box"><h2>変更・キャンセルについて</h2>' + fee +
      lines.filter((l) => !l.startsWith('キャンセル料')).map((l) => '<p>' + esc(l) + '</p>').join('') + '</section>';
  }

  function renderConfirm() {
    return stepHead('confirm') + strongNotice() +
      '<p>まだ予約は確定していません。内容をお確かめのうえ、下のボタンを押してください。</p>' +
      detailList(draft()) + cancelBox() +
      '<div class="actions"><button type="button" class="btn btn-primary btn-large" data-action="confirm">この内容で予約する</button></div>';
  }

  // 割り当てた席・担当の文（完了画面）
  function assignedText(b) {
    const s = shop();
    if (s.type === 'restaurant') {
      const seat = ShopAvailability.findResource(s, b.resourceId);
      return seat ? 'お席：' + esc(seat.kind) + '（' + esc(seat.name) + '）' : '';
    }
    return b.requested === 'any' ? esc(resourceName(s, b.resourceId)) + 'がうかがいます' : '';
  }

  function emailText(b) {
    const s = shop();
    const m = ShopAvailability.findMenu(s, b.menuId);
    const lines = [
      '件名：【' + s.name + '】ご予約を受け付けました',
      '',
      b.name + ' 様',
      '',
      s.name + 'です。ご予約を受け付けました。',
      '',
      '■予約番号', b.id,
      '■日時', fmtSlot(b.date, b.start, b.end, true),
      isRestaurant() ? '■コース' : '■メニュー', m.name + '（' + m.minutes + '分）',
      isRestaurant() ? '■人数・席' : '■担当', choiceText(s, b).replace(/<[^>]+>/g, ''),
      '■料金', priceText(s, m, b.partySize),
      '■お店', s.address, '電話：' + s.phone,
      '',
    ].concat(cancelPolicyLines(s), ['', '※' + SHOP_COMMON.demoNotice + '。']);
    return lines.join('\n');
  }

  function renderDone() {
    const s = shop();
    const b = { ...state.booking, seatKind: state.booking.requested, staffId: state.booking.requested };
    const flow = SHOP_AFTER_FLOW[s.type].map((t) => '<li>' + esc(t) + '</li>').join('');
    const hasEmail = askedFields().includes('email');
    return '<h1>' + stepTitle('done') + '</h1>' + strongNotice() +
      '<div class="booking-number"><p class="booking-number-label">予約番号</p><p class="booking-number-value">' + esc(b.id) + '</p></div>' +
      '<p class="sub">予約番号は、変更やキャンセルのお電話のときにお伝えください。</p>' +
      detailList(b, assignedText(b)) +
      '<section class="section"><h2>お店のご案内</h2><p>' + esc(s.name) + '<br>' + esc(s.address) +
      (s.mapUrl ? '<br><a href="' + esc(s.mapUrl) + '" target="_blank" rel="noopener">地図を見る</a>' : '') +
      '<br>電話：' + esc(s.phone) + '</p></section>' +
      '<section class="section"><h2>このあとの流れ</h2><ol class="flow">' + flow + '</ol></section>' +
      cancelBox() +
      '<section class="section"><h2>確認メールの文面（見本）</h2>' +
      '<p class="sub">' + (hasEmail
        ? '見本のため、メールは送られません。実際にはこのような文面が届きます。'
        : 'このお店はメールアドレスをおたずねしない設定のため、確認メールはありません。メールアドレスもおたずねする設定にすると、このような文面が届きます（見本のため送られません）。') + '</p>' +
      '<pre class="email-preview">' + esc(emailText(b)) + '</pre></section>' +
      '<div class="actions"><button type="button" class="btn btn-secondary" data-action="home">トップへ戻る</button></div>';
  }

  // ---------- 画面の下の「選んだ内容」 ----------

  function renderSummary() {
    const showOn = steps().map((x) => x.id);
    const hide = !state.menuId || !showOn.includes(state.step);
    summaryEl.parentElement.classList.toggle('no-summary', hide);
    if (hide) {
      summaryEl.hidden = true;
      document.body.style.paddingBottom = '';
      return;
    }
    const s = shop();
    const m = menu();
    const second = isRestaurant()
      ? (state.partySize ? choiceText(s, { partySize: state.partySize, seatKind: state.seatKind }) : 'まだ選んでいません')
      : (state.staffId ? choiceText(s, { staffId: state.staffId }) : 'まだ選んでいません');
    const when = state.date && state.start ? fmtSlot(state.date, state.start, endOf(state.start))
      : (state.date ? fmtDate(state.date) + '（時間はまだ）' : 'まだ選んでいません');
    // 合計の前で改行して、1名あたりと合計を1行ずつに（帯の中で途中から折り返さないように）
    const price = m.price === null ? '料金はお席で' : esc(ShopPrice.formatMenuFor(s, m, state.partySize)).replace('＝合計', '<br>＝合計');
    summaryEl.hidden = false;
    summaryEl.innerHTML = '<p class="summary-title">選んだ内容</p><dl class="summary-list">' +
      '<div><dt>' + (isRestaurant() ? 'コース' : 'メニュー') + '</dt><dd>' + esc(m.name) + '（' + m.minutes + '分）</dd></div>' +
      '<div><dt>料金</dt><dd>' + price + '</dd></div>' +
      '<div><dt>' + (isRestaurant() ? '人数' : '担当') + '</dt><dd>' + second + '</dd></div>' +
      '<div><dt>日時</dt><dd>' + when + '</dd></div></dl>';
    document.body.style.paddingBottom = getComputedStyle(summaryEl).position === 'fixed' ? summaryEl.offsetHeight + 'px' : '';
  }

  // ---------- 描く ----------

  const RENDERERS = {
    top: renderTop, menu: renderMenu, party: renderParty, staff: renderStaff,
    date: renderDate, time: renderTime, info: renderInfo, confirm: renderConfirm, done: renderDone,
  };

  // 切り替えボタンに出す短い名前（「和食 ゆずり葉（見本）」→「ゆずり葉」）。スマホで1行に収めるため
  function shortName(x) {
    return x.name.replace('（見本）', '').split(' ').pop();
  }

  function renderShopSwitch() {
    const nav = document.getElementById('shop-switch');
    nav.innerHTML = '<span class="mode-note">見本のお店：</span>' + data().shops.map((x) =>
      '<button type="button" class="mode-btn" aria-pressed="' + (x.id === state.shopId) + '" data-action="switch-shop" data-id="' + x.id + '">' +
      esc(shortName(x)) + '</button>').join('');
  }

  let renderedStep = null;

  function render() {
    const s = shop();
    if (state.step !== renderedStep) document.body.classList.remove('is-typing'); // 画面が変わったら帯を戻す
    renderedStep = state.step;
    document.body.dataset.color = s.color;
    document.getElementById('site-name').textContent = s.name;
    renderShopSwitch();
    appEl.innerHTML = RENDERERS[state.step]();
    document.title = (state.step === 'top' ? '' : stepTitle(state.step) + ' — ') + s.name;
    renderSummary();
  }

  // ---------- 操作 ----------

  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const a = el.dataset.action;
    if (a === 'switch-shop') {
      if (el.dataset.id !== state.shopId) { state.shopId = el.dataset.id; resetDraft(); go('top'); }
    } else if (a === 'back') history.back();
    else if (a === 'start') { resetDraft(); go('menu'); }
    else if (a === 'select-menu') {
      if (state.menuId !== el.dataset.id) clearDateTime();
      state.menuId = el.dataset.id;
      render();
    } else if (a === 'to-second') go(isRestaurant() ? 'party' : 'staff');
    else if (a === 'select-party') {
      const n = Number(el.dataset.size);
      if (state.partySize !== n) clearDateTime();
      state.partySize = n;
      // 選んでいた席の種類にこの人数が入らないときは「どれでもよい」に戻す
      if (state.seatKind !== 'any' && !shop().seats.some((x) => x.kind === state.seatKind && x.capacity >= n)) state.seatKind = 'any';
      render();
    } else if (a === 'select-seat') {
      if (state.seatKind !== el.dataset.id) clearDateTime();
      state.seatKind = el.dataset.id;
      render();
    } else if (a === 'select-staff') {
      if (state.staffId !== el.dataset.id) clearDateTime();
      state.staffId = el.dataset.id;
      render();
    } else if (a === 'to-date') {
      if (!state.month) state.month = monthRange().first;
      go('date');
    } else if (a === 'prev-month') { state.month = shiftMonth(state.month, -1); render(); }
    else if (a === 'next-month') { state.month = shiftMonth(state.month, 1); render(); }
    else if (a === 'select-date') {
      if (state.date !== el.dataset.date) state.start = null;
      state.date = el.dataset.date;
      state.notice = '';
      go('time');
    } else if (a === 'earliest') {
      state.date = el.dataset.date;
      state.start = el.dataset.start;
      state.month = state.date.slice(0, 7);
      state.notice = '';
      go('time');
    } else if (a === 'select-time') { state.start = el.dataset.start; state.notice = ''; render(); }
    else if (a === 'to-info') go('info');
    else if (a === 'confirm') confirmBooking();
    else if (a === 'home') { resetDraft(); go('top'); }
  }

  // 確定：直前にもう一度空きを確かめ、席・担当を割り当てる（ShopStore.addBooking の中で）
  function confirmBooking() {
    const at = now();
    const all = ShopStore.load(at);
    const s = all.shops.find((x) => x.id === state.shopId);
    const result = ShopStore.addBooking(s, all.records[s.id], draft(), at);
    if (!result.ok) {
      state.notice = result.message; // 責めない言い方で案内し、時間を選びなおしてもらう。お名前などは残す
      state.start = null;
      go('time', true);
      return;
    }
    ShopStore.save(all);
    state.booking = result.booking;
    go('done', true);
  }

  function onInput(e) {
    if (e.target.form && e.target.form.id === 'info-form') state.info[e.target.name] = e.target.value;
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

  function start() {
    document.getElementById('demo-notice').textContent = SHOP_COMMON.demoNotice;
    ShopStore.load(now()); // 見本データがなければ作る
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('submit', onSubmit);
    window.addEventListener('resize', renderSummary);
    // スマホで文字を入れはじめたら、その画面のあいだは下の帯を隠す（キーボードと帯で入力欄が見えなくならないように）
    // ※入力欄から離れたときに帯を戻すと、戻ってきた帯が「次へ」ボタンの上にかぶり、押したのに進まないことがあった。
    //   そのため帯を戻すのは、次の画面を描くとき（render）にした
    document.addEventListener('focusin', (e) => { if (e.target.matches('input, textarea, select')) document.body.classList.add('is-typing'); });
    history.replaceState({ step: 'top', shopId: state.shopId }, '', location.pathname);
    render();
  }

  return { start };
})();

ShopApp.start();
