// =============================================================
// shop/js/admin.js — お店側の画面
//   予約一覧（今日・今週・すべて／キャンセル）
//   受けない時間（登録・削除）
//   設定（お店の基本・営業・メニュー・席／担当・予約のきまり・お客さんに聞くこと・変更とキャンセル）
//     ＋ 設定の書き出し・読み込み
//   見本をリセット
// 画面の切り替えと描き直しは shop/js/app.js が行い、ここは「中身を作る」と「操作を受ける」だけ。
// =============================================================

const ShopAdmin = (function () {
  const { esc, fmtTime, fmtDate, fmtSlot } = ShopFormat;
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 表は月曜から
  const WD = '日月火水木金土';

  const TABS = [
    { id: 'list', label: '予約一覧' },
    { id: 'blocks', label: '受けない時間' },
    { id: 'settings', label: '設定' },
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
    message: '',
    messageIsWarning: false,
    blockForm: { date: '', start: '', end: '', reason: '' },
    blockError: '',
    draft: null,        // 設定画面で書きかえ中のお店の設定（保存するまで、お客さん側には出ない）
    draftShopId: null,
    settingsErrors: [],
    closedDateInput: '',
  };

  let shopId = null; // いま見ているお店（app.js から渡される）

  function now() { return new Date(); }
  function today() { return ShopAvailability.nowInJapan(now()).date; }
  function data() { return ShopStore.load(now()); }
  function shop() { return data().shops.find((s) => s.id === shopId); }
  function records() { return data().records[shopId]; }

  function setMessage(text, warning) {
    state.message = text;
    state.messageIsWarning = !!warning;
  }

  function thisWeek() {
    const t = today();
    const monday = ShopAvailability.addDays(t, -((ShopAvailability.weekday(t) + 6) % 7));
    return { from: monday, to: ShopAvailability.addDays(monday, 6) };
  }

  function byDateTime(a, b) {
    return (a.date + a.start).localeCompare(b.date + b.start);
  }

  // 時刻の選択肢（from〜to を step 分ごと）
  function timeOptions(from, to, step, selected, extra) {
    let html = extra || '';
    for (let t = ShopAvailability.toMinutes(from); t <= ShopAvailability.toMinutes(to); t += step) {
      const v = ShopAvailability.toTime(t);
      html += '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + fmtTime(v) + '</option>';
    }
    return html;
  }

  function numberOptions(values, selected, unit) {
    return values.map((v) => '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + v + unit + '</option>').join('');
  }

  function range(from, to, step) {
    const list = [];
    for (let v = from; v <= to; v += step) list.push(v);
    return list;
  }

  // お店の営業時間のいちばん早い始まりと、いちばん遅い終わり（受けない時間の選択肢と「終日」に使う）
  function dayBounds(s) {
    const parts = s.weeklyHours.flat();
    if (!parts.length) return { start: '09:00', end: '18:00' };
    const starts = parts.map((p) => p.start).sort();
    const ends = parts.map((p) => p.end).sort();
    return { start: starts[0], end: ends[ends.length - 1] };
  }

  // ---------- 予約一覧 ----------

  function filtered(r) {
    const t = today();
    const week = thisWeek();
    return r.bookings.filter((b) => {
      if (state.filter === 'today') return b.date === t;
      if (state.filter === 'week') return week.from <= b.date && b.date <= week.to;
      return true;
    }).sort(byDateTime);
  }

  function periodText() {
    if (state.filter === 'today') return fmtDate(today(), true);
    if (state.filter === 'week') { const w = thisWeek(); return fmtDate(w.from) + '〜' + fmtDate(w.to); }
    return '保存してある予約すべて（キャンセルしたものもふくむ）';
  }

  // 席・担当の列の中身
  function resourceCell(s, b) {
    const r = ShopAvailability.findResource(s, b.resourceId);
    const name = r ? esc(r.name) : '（いまはない席・担当）';
    if (s.type === 'restaurant') return b.partySize + '名・' + name;
    return name + (b.requested === 'any' ? '（指名なし）' : '（指名）');
  }

  function renderList() {
    const s = shop();
    const filters = FILTERS.map((f) =>
      '<button type="button" class="filter-btn" aria-pressed="' + (state.filter === f.id) + '" data-action="admin-filter" data-id="' + f.id + '">' + f.label + '</button>').join('');
    const list = filtered(records());
    const active = list.filter((b) => b.status !== 'cancelled').length;
    const col = s.type === 'restaurant' ? '人数・席' : '担当';
    let table;
    if (!list.length) {
      table = '<p class="empty">この期間の予約はありません。</p>';
    } else {
      table = '<table class="admin-table"><thead><tr><th scope="col">日時</th><th scope="col">予約番号</th><th scope="col">お名前</th>' +
        '<th scope="col">' + (s.type === 'restaurant' ? 'コース' : 'メニュー') + '</th><th scope="col">' + col + '</th><th scope="col">操作</th></tr></thead><tbody>' +
        list.map((b) => {
          const menu = ShopAvailability.findMenu(s, b.menuId);
          const cancelled = b.status === 'cancelled';
          const action = cancelled ? '<span class="status-cancelled">キャンセル済み</span>'
            : '<button type="button" class="btn btn-secondary btn-small" data-action="admin-cancel" data-id="' + esc(b.id) + '">キャンセル</button>';
          return '<tr class="' + (cancelled ? 'is-cancelled' : '') + '">' +
            '<td data-label="日時">' + fmtSlot(b.date, b.start, b.end) + '</td>' +
            '<td data-label="予約番号">' + esc(b.id) + '</td>' +
            '<td data-label="お名前">' + esc(b.name) + '</td>' +
            '<td data-label="' + (s.type === 'restaurant' ? 'コース' : 'メニュー') + '">' + (menu ? esc(menu.name) : '（削除したメニュー）') + '</td>' +
            '<td data-label="' + col + '">' + resourceCell(s, b) + '</td>' +
            '<td data-label="操作">' + action + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    return '<div class="filters" role="group" aria-label="期間">' + filters + '</div>' +
      '<p class="period">' + periodText() + '　予約 ' + active + '件</p>' + table;
  }

  // ---------- 受けない時間 ----------

  function blockTimeText(s, b) {
    const d = dayBounds(s);
    return b.start <= d.start && b.end >= d.end ? '終日' : fmtTime(b.start) + '〜' + fmtTime(b.end);
  }

  function dateHint(date, id) {
    return '<p class="field-hint' + (date ? '' : ' is-empty') + '" id="' + id + '">' +
      (date ? '選んだ日：' + fmtDate(date, true) : '日付を選んでください（欄を押すとカレンダーが開きます）') + '</p>';
  }

  function renderBlocks() {
    const s = shop();
    const d = dayBounds(s);
    const f = state.blockForm;
    if (!f.start) f.start = d.start;
    if (!f.end) f.end = d.end;
    const form = '<form id="block-form" class="block-form" novalidate>' +
      '<div class="field"><label for="b-date">日付 <span class="tag-req">必須</span></label>' +
      '<input id="b-date" name="date" type="date" min="' + today() + '" value="' + esc(f.date) + '" aria-describedby="b-date-hint">' +
      dateHint(f.date, 'b-date-hint') + '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label for="b-start">始まり</label><select id="b-start" name="start">' + timeOptions(d.start, d.end, 30, f.start) + '</select></div>' +
      '<div class="field"><label for="b-end">終わり</label><select id="b-end" name="end">' + timeOptions(d.start, d.end, 30, f.end) + '</select></div>' +
      '</div><p class="sub">' + fmtTime(d.start) + '〜' + fmtTime(d.end) + 'を選ぶと「終日」になります。</p>' +
      '<div class="field"><label for="b-reason">理由 <span class="tag-opt">任意</span></label>' +
      '<input id="b-reason" name="reason" type="text" placeholder="例：貸し切りのため" value="' + esc(f.reason) + '"></div>' +
      (state.blockError ? '<p class="field-error" role="alert">' + esc(state.blockError) + '</p>' : '') +
      '<div class="actions"><button type="submit" class="btn btn-primary">受けない時間として登録する</button></div></form>';

    const blocks = [...records().blocks].sort(byDateTime);
    const list = !blocks.length ? '<p class="empty">登録はありません。</p>' :
      '<table class="admin-table"><thead><tr><th scope="col">日付</th><th scope="col">時間帯</th><th scope="col">理由</th><th scope="col">操作</th></tr></thead><tbody>' +
      blocks.map((b) => '<tr><td data-label="日付">' + fmtDate(b.date) + '</td><td data-label="時間帯">' + blockTimeText(s, b) + '</td>' +
        '<td data-label="理由">' + (b.reason ? esc(b.reason) : '（なし）') + '</td>' +
        '<td data-label="操作"><button type="button" class="btn btn-secondary btn-small" data-action="admin-remove-block" data-id="' + esc(b.id) + '">削除</button></td></tr>').join('') +
      '</tbody></table>';
    return '<p>貸し切り・講習などで、お店全体で予約を受けない日時を登録します。登録した時間は、お客さん側で選べなくなります。</p>' +
      form + '<h2 class="section">登録してある時間</h2>' + list;
  }

  // ---------- 設定 ----------

  function draft() {
    if (!state.draft || state.draftShopId !== shopId) {
      state.draft = JSON.parse(JSON.stringify(shop()));
      state.draftShopId = shopId;
      state.settingsErrors = [];
    }
    return state.draft;
  }

  function isDirty() {
    return state.draft && state.draftShopId === shopId && JSON.stringify(state.draft) !== JSON.stringify(shop());
  }

  // 'menus.0.name' のような道順で値を入れる
  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach((k) => { o = o[k]; });
    o[keys[keys.length - 1]] = value;
  }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  // 入力欄の部品。data-path に設定の道順、data-type に値の形を書いておく
  function textInput(label, path, opts) {
    const o = opts || {};
    const id = 's-' + path.replace(/\./g, '-');
    const value = getPath(draft(), path);
    return '<div class="field"><label for="' + id + '">' + label + (o.optional ? ' <span class="tag-opt">任意</span>' : '') + '</label>' +
      '<input id="' + id + '" type="' + (o.type || 'text') + '" data-path="' + path + '" data-type="' + (o.dataType || 'str') + '"' +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + (o.inputmode ? ' inputmode="' + o.inputmode + '"' : '') +
      ' value="' + esc(value == null ? '' : value) + '">' + (o.hint ? '<p class="field-hint">' + o.hint + '</p>' : '') + '</div>';
  }

  function selectInput(label, path, optionsHtml, dataType) {
    const id = 's-' + path.replace(/\./g, '-');
    return '<div class="field"><label for="' + id + '">' + label + '</label>' +
      '<select id="' + id + '" data-path="' + path + '" data-type="' + (dataType || 'str') + '">' + optionsHtml + '</select></div>';
  }

  function weekdayChecks(path, list, label) {
    return '<fieldset class="weekday-checks"><legend>' + label + '</legend>' + WEEK_ORDER.map((w) =>
      '<label class="check"><input type="checkbox" data-toggle-weekday="' + path + '" value="' + w + '"' + (list.includes(w) ? ' checked' : '') + '> ' + WD[w] + '</label>').join('') + '</fieldset>';
  }

  function renderSettings() {
    const s = draft();
    const isR = s.type === 'restaurant';
    const twoParts = s.weeklyHours.some((p) => p.length === 2);
    const errors = state.settingsErrors.length
      ? '<div class="notice" role="alert"><p>保存できませんでした。次のところを直してください。</p><ul>' + state.settingsErrors.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul></div>' : '';

    // お店の基本
    const colors = '<fieldset class="color-choices"><legend>色</legend>' + SHOP_COLORS.map((c) =>
      '<label class="check color-' + c.id + '"><input type="radio" name="s-color" data-path="color" data-type="str" value="' + c.id + '"' + (s.color === c.id ? ' checked' : '') + '> <span class="swatch" data-swatch="' + c.id + '"></span>' + c.name + '</label>').join('') + '</fieldset>';
    const basic = '<section class="settings-group"><h2>お店の基本</h2>' +
      '<p class="sub">型：' + (isR ? '飲食店の型（席 × 人数）' : 'サロンの型（担当 × メニュー）') + '</p>' +
      textInput('店名', 'name') + textInput('一言紹介', 'intro') + textInput('住所', 'address') +
      textInput('電話', 'phone', { type: 'tel' }) +
      textInput('地図のURL', 'mapUrl', { type: 'url', optional: true, placeholder: 'https://…' }) +
      textInput('予約番号の頭（英字の大文字2字）', 'bookingPrefix', { hint: '予約番号は「' + esc(s.bookingPrefix) + '-年月日-3桁」になります' }) +
      colors + '</section>';

    // 営業
    const b = { from: '06:00', to: '24:00' };
    const rows = WEEK_ORDER.map((w) => {
      const closed = s.closedWeekdays.includes(w);
      const parts = s.weeklyHours[w];
      const p1 = parts[0] || { start: '10:00', end: '18:00' };
      const p2 = parts[1];
      const sel = (path, value, extra) => '<select aria-label="' + WD[w] + '曜 ' + path + '" data-path="' + path + '" data-type="hours"' + (closed ? ' disabled' : '') + '>' + timeOptions(b.from, b.to, 15, value, extra) + '</select>';
      return '<div class="hours-row' + (closed ? ' is-closed' : '') + '">' +
        '<p class="hours-day">' + WD[w] + '</p>' +
        '<label class="check"><input type="checkbox" data-toggle-weekday="closedWeekdays" value="' + w + '"' + (closed ? ' checked' : '') + '> 定休日</label>' +
        '<div class="hours-part"><span>' + esc(s.partNames[0] || '第1部') + '</span>' + sel('weeklyHours.' + w + '.0.start', p1.start) + '〜' + sel('weeklyHours.' + w + '.0.end', p1.end) + '</div>' +
        '<div class="hours-part"><span>' + esc(s.partNames[1] || '第2部') + '</span>' +
        sel('weeklyHours.' + w + '.1.start', p2 ? p2.start : 'none', '<option value="none"' + (p2 ? '' : ' selected') + '>なし</option>') +
        (p2 ? '〜' + sel('weeklyHours.' + w + '.1.end', p2.end) : '') + '</div></div>';
    }).join('');
    const closedDates = [...s.specialClosedDates].sort().map((d) =>
      '<li>' + fmtDate(d, true) + ' <button type="button" class="btn btn-secondary btn-small" data-action="settings-remove-closed" data-date="' + d + '">削除</button></li>').join('');
    const hours = '<section class="settings-group"><h2>営業</h2>' +
      '<div class="field-row">' + textInput('第1部の名前', 'partNames.0', { optional: true, placeholder: '例：昼' }) + textInput('第2部の名前', 'partNames.1', { optional: true, placeholder: '例：夜' }) + '</div>' +
      '<p class="sub">営業時間は曜日ごとに、1日2部まで。2部目がない日は「なし」にします。</p>' +
      '<div class="hours-table">' + rows + '</div>' +
      '<h3>臨時休業</h3>' + (closedDates ? '<ul class="closed-dates">' + closedDates + '</ul>' : '<p class="sub">登録はありません。</p>') +
      '<div class="field"><label for="s-closed-date">休む日を足す</label>' +
      '<input id="s-closed-date" type="date" data-closed-date min="' + today() + '" value="' + esc(state.closedDateInput) + '" aria-describedby="s-closed-hint">' +
      dateHint(state.closedDateInput, 's-closed-hint') + '</div>' +
      '<button type="button" class="btn btn-secondary" data-action="settings-add-closed">臨時休業に足す</button></section>';

    // メニュー
    const partOptions = (x, i) => {
      const names = [s.partNames[0] || '第1部', s.partNames[1] || '第2部'];
      const v = x.parts.length === 0 ? 'all' : String(x.parts[0]);
      return selectInput('受ける部', 'menus.' + i + '.parts',
        '<option value="all"' + (v === 'all' ? ' selected' : '') + '>どの部も</option>' +
        names.map((n, pi) => '<option value="' + pi + '"' + (v === String(pi) ? ' selected' : '') + '>' + esc(n) + 'のみ</option>').join(''), 'parts');
    };
    const menus = s.menus.map((x, i) => '<div class="settings-card">' +
      '<p class="settings-card-title">' + (i + 1) + '. ' + esc(x.name || '（名前なし）') + '</p>' +
      textInput('名前', 'menus.' + i + '.name') +
      '<div class="field-row">' +
      selectInput('所要時間', 'menus.' + i + '.minutes', numberOptions(range(15, 300, 15), x.minutes, '分'), 'int') +
      textInput('金額（税別・円）', 'menus.' + i + '.price', { inputmode: 'numeric', dataType: 'price', placeholder: '空なら金額なし' }) +
      '</div>' +
      textInput('説明（1行）', 'menus.' + i + '.description', { optional: true }) +
      (twoParts ? partOptions(x, i) : '') +
      '<div class="settings-card-actions">' +
      '<button type="button" class="btn btn-secondary btn-small" data-action="settings-move" data-list="menus" data-index="' + i + '" data-dir="-1"' + (i === 0 ? ' disabled' : '') + '>上へ</button>' +
      '<button type="button" class="btn btn-secondary btn-small" data-action="settings-move" data-list="menus" data-index="' + i + '" data-dir="1"' + (i === s.menus.length - 1 ? ' disabled' : '') + '>下へ</button>' +
      '<button type="button" class="btn btn-secondary btn-small" data-action="settings-remove" data-list="menus" data-index="' + i + '">削除</button>' +
      '</div></div>').join('');
    const menuGroup = '<section class="settings-group"><h2>メニュー</h2>' + menus +
      '<button type="button" class="btn btn-secondary" data-action="settings-add" data-list="menus">メニューを足す</button></section>';

    // 席／担当
    let resGroup;
    if (isR) {
      resGroup = '<section class="settings-group"><h2>席</h2>' + s.seats.map((x, i) => '<div class="settings-card">' +
        '<div class="field-row three">' + textInput('席の名前', 'seats.' + i + '.name') +
        selectInput('種類', 'seats.' + i + '.kind', SEAT_KINDS.map((k) => '<option' + (x.kind === k ? ' selected' : '') + '>' + k + '</option>').join('')) +
        selectInput('定員', 'seats.' + i + '.capacity', numberOptions(range(1, 12, 1), x.capacity, '名'), 'int') + '</div>' +
        '<div class="settings-card-actions"><button type="button" class="btn btn-secondary btn-small" data-action="settings-remove" data-list="seats" data-index="' + i + '">削除</button></div></div>').join('') +
        '<button type="button" class="btn btn-secondary" data-action="settings-add" data-list="seats">席を足す</button></section>';
    } else {
      resGroup = '<section class="settings-group"><h2>担当</h2>' + s.staff.map((x, i) => '<div class="settings-card">' +
        textInput('担当の名前', 'staff.' + i + '.name') + weekdayChecks('staff.' + i + '.offWeekdays', x.offWeekdays, '休みの曜日') +
        '<div class="settings-card-actions"><button type="button" class="btn btn-secondary btn-small" data-action="settings-remove" data-list="staff" data-index="' + i + '">削除</button></div></div>').join('') +
        '<button type="button" class="btn btn-secondary" data-action="settings-add" data-list="staff">担当を足す</button></section>';
    }

    // 予約のきまり
    const r = s.rules;
    const steps = [15, 30, 60].map((v) => '<label class="check"><input type="radio" name="s-step" data-path="rules.stepMinutes" data-type="int" value="' + v + '"' + (r.stepMinutes === v ? ' checked' : '') + '> ' + v + '分</label>').join('');
    const rules = '<section class="settings-group"><h2>予約のきまり</h2><div class="field-row">' +
      selectInput('締め切り（ご来店の何時間前まで）', 'rules.deadlineHours', numberOptions([0, 1, 2, 3, 6, 12, 24, 48, 72], r.deadlineHours, '時間前'), 'int') +
      selectInput('何日先まで受けるか', 'rules.maxDaysAhead', numberOptions([7, 14, 30, 60, 90], r.maxDaysAhead, '日先まで'), 'int') + '</div>' +
      '<div class="field-row">' +
      '<fieldset class="field"><legend>開始時刻の刻み</legend><div class="radio-row">' + steps + '</div></fieldset>' +
      selectInput('片付け・準備の時間（予約のあと）', 'rules.cleanupMinutes', numberOptions(range(0, 60, 5), r.cleanupMinutes, '分'), 'int') + '</div></section>';

    // お客さんに聞くこと
    const ask = '<section class="settings-group"><h2>お客さんに聞くこと</h2>' +
      '<p class="sub">できるだけ少なく聞く設計です。聞いた情報は、お店が大切に預かることになります。</p><div class="radio-col">' +
      ASK_FOR_OPTIONS.map((o) => '<label class="check"><input type="radio" name="s-ask" data-path="askFor" data-type="str" value="' + o.id + '"' + (s.askFor === o.id ? ' checked' : '') + '> ' + o.label + (o.id === ASK_FOR_DEFAULT ? '（おすすめ）' : '') + '</label>').join('') + '</div></section>';

    // 変更・キャンセル
    const c = s.cancel;
    const cancel = '<section class="settings-group"><h2>変更・キャンセル</h2>' +
      textInput('受け付ける期限', 'cancel.deadlineText', { placeholder: '例：ご予約の前日まで' }) +
      textInput('連絡方法', 'cancel.contactText', { placeholder: '例：お電話でご連絡ください。' }) +
      '<label class="check"><input type="checkbox" data-path="cancel.feeEnabled" data-type="bool"' + (c.feeEnabled ? ' checked' : '') + '> キャンセル料あり</label>' +
      (c.feeEnabled ? textInput('キャンセル料の金額や率', 'cancel.feeDetail', { placeholder: '例：当日のキャンセルは、コース料金の50%', hint: 'お客さんの確認画面で、予約を確定する前に必ず表示します' }) : '') +
      '</section>';

    // 書き出し・読み込み
    const io = '<section class="settings-group"><h2>設定の書き出し・読み込み</h2>' +
      '<p class="sub">設定をファイルに書き出して、別のパソコンやブラウザで読み込めます（予約は入りません。設定だけです）。</p>' +
      '<div class="settings-card-actions">' +
      '<button type="button" class="btn btn-secondary" data-action="settings-export">設定を書き出す</button>' +
      '<label class="btn btn-secondary file-btn">設定を読み込む<input type="file" accept=".json,application/json" data-import-file></label>' +
      '</div></section>';

    return '<p>ここで変えた設定は、「保存する」を押すと、お客さん側の予約の画面にすぐ反映されます。</p>' +
      (isDirty() ? '<p class="notice" role="status">まだ保存していない変更があります。</p>' : '') + errors +
      basic + hours + menuGroup + resGroup + rules + ask + cancel +
      '<div class="actions settings-save"><button type="button" class="btn btn-primary btn-large" data-action="settings-save">保存する</button>' +
      '<button type="button" class="btn btn-secondary" data-action="settings-discard"' + (isDirty() ? '' : ' disabled') + '>変更を取り消す</button></div>' +
      io;
  }

  // ---------- 見本をリセット ----------

  function renderReset() {
    return '<p>保存してある予約・受けない時間・設定を、2店とも全部消して、最初の見本の状態に戻します。</p>' +
      '<p>見本の予約（お名前に「（見本）」がついたもの）は、今日からのあいだに作り直します。</p>' +
      '<div class="actions"><button type="button" class="btn btn-primary" data-action="admin-reset">見本を最初の状態に戻す</button></div>';
  }

  // ---------- 描く ----------

  function render(currentShopId) {
    shopId = currentShopId;
    const tabs = TABS.map((t) => '<button type="button" class="tab-btn" role="tab" aria-selected="' + (state.tab === t.id) + '" data-action="admin-tab" data-id="' + t.id + '">' + t.label + '</button>').join('');
    const body = { list: renderList, blocks: renderBlocks, settings: renderSettings, reset: renderReset }[state.tab]();
    return '<h1>お店側（' + esc(shop().name) + '）</h1>' +
      '<div class="tabs" role="tablist" aria-label="お店側のメニュー">' + tabs + '</div>' +
      (state.message ? '<p class="' + (state.messageIsWarning ? 'notice' : 'notice-plain') + '" role="status">' + esc(state.message) + '</p>' : '') + body;
  }

  // ---------- 操作 ----------

  function newId(list, head) {
    const used = list.map((x) => Number(String(x.id).replace(head, '')) || 0);
    return head + (Math.max(0, ...used) + 1);
  }

  // お店側のボタンなら処理して true を返す（呼んだ側が描き直す）
  function handleClick(action, el) {
    const s = state.tab === 'settings' ? draft() : null;
    if (action === 'admin-tab') { state.tab = el.dataset.id; setMessage(''); state.blockError = ''; return true; }
    if (action === 'admin-filter') { state.filter = el.dataset.id; setMessage(''); return true; }
    if (action === 'admin-cancel') {
      const all = data();
      const b = all.records[shopId].bookings.find((x) => x.id === el.dataset.id);
      if (!b || !window.confirm(b.id + '（' + b.name + ' 様　' + fmtSlot(b.date, b.start, b.end) + '）をキャンセルしますか？\nキャンセルすると、この時間はお客さん側でまた選べるようになります。')) return false;
      ShopStore.cancelBooking(all.records[shopId], b.id);
      ShopStore.save(all);
      setMessage(b.id + ' をキャンセルしました。');
      return true;
    }
    if (action === 'admin-remove-block') {
      const all = data();
      const b = all.records[shopId].blocks.find((x) => x.id === el.dataset.id);
      const text = fmtDate(b.date) + ' ' + blockTimeText(shop(), b);
      if (!window.confirm(text + ' の「受けない時間」を削除しますか？')) return false;
      ShopStore.removeBlock(all.records[shopId], b.id);
      ShopStore.save(all);
      setMessage(text + ' を削除しました。');
      return true;
    }
    if (action === 'admin-reset') {
      if (!window.confirm('2店の予約・受けない時間・設定を全部消して、最初の見本の状態に戻します。よろしいですか？')) return false;
      ShopStore.reset(now());
      state.draft = null;
      setMessage('見本を最初の状態に戻しました。');
      return true;
    }
    // ---- 設定 ----
    if (action === 'settings-add') {
      const list = el.dataset.list;
      if (list === 'menus') s.menus.push({ id: newId(s.menus, 'menu-'), name: '', minutes: 60, price: null, description: '', parts: [] });
      if (list === 'seats') s.seats.push({ id: newId(s.seats, 'seat-'), name: '', kind: 'テーブル', capacity: 4 });
      if (list === 'staff') s.staff.push({ id: newId(s.staff, 'staff-'), name: '', offWeekdays: [] });
      return true;
    }
    if (action === 'settings-remove') {
      const list = s[el.dataset.list];
      const i = Number(el.dataset.index);
      const name = list[i].name || '（名前なし）';
      if (!window.confirm('「' + name + '」を削除しますか？（「保存する」を押すまでは、お客さん側は変わりません）')) return false;
      list.splice(i, 1);
      return true;
    }
    if (action === 'settings-move') {
      const list = s[el.dataset.list];
      const i = Number(el.dataset.index);
      const j = i + Number(el.dataset.dir);
      [list[i], list[j]] = [list[j], list[i]];
      return true;
    }
    if (action === 'settings-add-closed') {
      const d = state.closedDateInput;
      if (d && !s.specialClosedDates.includes(d)) s.specialClosedDates.push(d);
      state.closedDateInput = '';
      return true;
    }
    if (action === 'settings-remove-closed') {
      s.specialClosedDates = s.specialClosedDates.filter((d) => d !== el.dataset.date);
      return true;
    }
    if (action === 'settings-save') {
      state.settingsErrors = ShopSettings.validate(s);
      if (state.settingsErrors.length) { setMessage(''); return true; }
      const all = data();
      ShopStore.replaceShop(all, s);
      ShopStore.save(all);
      setMessage('保存しました。お客さん側の予約の画面に、すぐ反映されます。');
      return true;
    }
    if (action === 'settings-discard') {
      state.draft = null;
      state.settingsErrors = [];
      setMessage('変更を取り消しました。');
      return true;
    }
    if (action === 'settings-export') {
      const text = ShopSettings.exportText(shop()); // 書き出すのは保存してある設定
      const blob = new Blob([text], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      // ファイル名は英字にする（日本語の名前は、ブラウザによって「download」に置きかわった）
      a.download = 'shop-settings-' + shop().bookingPrefix + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setMessage('設定を書き出しました（' + a.download + '）。' + (isDirty() ? '保存していない変更は入っていません。' : ''));
      return true;
    }
    return false;
  }

  // 入力するたびに覚えておく（文字の欄は描き直さない。選ぶ欄・チェックは描き直す）
  // 描き直すときは true を返す
  function handleInput(target, eventType) {
    if (target.form && target.form.id === 'block-form') {
      state.blockForm[target.name] = target.value;
      if (target.name === 'date') {
        const hint = document.getElementById('b-date-hint');
        hint.outerHTML = dateHint(target.value, 'b-date-hint');
      }
      return false;
    }
    if (target.matches('[data-closed-date]')) {
      state.closedDateInput = target.value;
      document.getElementById('s-closed-hint').outerHTML = dateHint(target.value, 's-closed-hint');
      return false;
    }
    if (target.dataset.toggleWeekday) {
      if (eventType !== 'change') return false;
      const list = getPath(draft(), target.dataset.toggleWeekday);
      const w = Number(target.value);
      const i = list.indexOf(w);
      if (target.checked && i < 0) list.push(w);
      if (!target.checked && i >= 0) list.splice(i, 1);
      list.sort();
      // 定休日をやめた曜日に営業時間がなければ、仮の時間を入れておく（あとで選びなおせる）
      if (target.dataset.toggleWeekday === 'closedWeekdays' && !target.checked && !draft().weeklyHours[w].length) {
        draft().weeklyHours[w].push({ ...(draft().weeklyHours.find((p) => p.length) || [{ start: '10:00', end: '18:00' }])[0] });
      }
      return true;
    }
    if (!target.dataset.path) return false;
    const type = target.dataset.type;
    const path = target.dataset.path;
    const s = draft();
    if (type === 'str') {
      setPath(s, path, target.value);
      return eventType === 'change' && target.type === 'radio';
    }
    if (eventType !== 'change' && (type === 'int' || type === 'bool' || type === 'parts' || type === 'hours')) return false;
    if (type === 'price') {
      const v = target.value.replace(/[,，円\s]/g, '').replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
      setPath(s, path, v === '' ? null : (/^\d+$/.test(v) ? Number(v) : v));
      return false;
    }
    if (type === 'int') { setPath(s, path, Number(target.value)); return true; }
    if (type === 'bool') { setPath(s, path, target.checked); return true; }
    if (type === 'parts') { setPath(s, path, target.value === 'all' ? [] : [Number(target.value)]); return true; }
    if (type === 'hours') {
      // weeklyHours.曜日.部.start|end
      const [, w, part, key] = path.split('.');
      const parts = s.weeklyHours[w];
      if (part === '1' && key === 'start' && target.value === 'none') { parts.splice(1); return true; }
      if (!parts[part]) {
        const startMin = ShopAvailability.toMinutes(target.value);
        parts[part] = { start: target.value, end: ShopAvailability.toTime(Math.min(startMin + 180, 24 * 60)) };
      } else {
        parts[part][key] = target.value;
      }
      return true;
    }
    return false;
  }

  // 受けない時間の登録。処理したら true
  function handleSubmit(form) {
    if (form.id !== 'block-form') return false;
    const f = state.blockForm;
    setMessage('');
    if (!f.date) { state.blockError = '日付を選んでください'; return true; }
    if (f.start >= f.end) { state.blockError = '終わりの時刻は、始まりより後にしてください'; return true; }
    const all = data();
    const r = all.records[shopId];
    const count = ShopAvailability.bookingsOverlapping(r, f.date, f.start, f.end).length;
    const when = fmtDate(f.date) + ' ' + blockTimeText(shop(), f);
    if (count > 0 && !window.confirm(when + ' に予約が' + count + '件あります。\n登録しても予約は消えません（必要ならお客様へご連絡ください）。\n登録しますか？')) return true;
    ShopStore.addBlock(r, f);
    ShopStore.save(all);
    state.blockError = '';
    setMessage(when + ' を登録しました。' + (count > 0 ? 'この時間に予約が' + count + '件あります（予約は残っています）。' : ''), count > 0);
    state.blockForm = { date: '', start: '', end: '', reason: '' };
    return true;
  }

  // 設定ファイルの読み込み（ファイルを選んだとき）。読み終わったら done() を呼ぶ
  function handleImport(input, done) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const all = data();
      const result = ShopSettings.importText(String(reader.result), all.shops);
      if (!result.ok) {
        setMessage(result.message, true);
      } else if (window.confirm('「' + result.shop.name + '」の今の設定を、ファイルの設定に置きかえます。よろしいですか？（予約はそのまま残ります）')) {
        ShopStore.replaceShop(all, result.shop);
        ShopStore.save(all);
        state.draft = null;
        setMessage('設定を読み込みました。お客さん側の予約の画面に、すぐ反映されます。');
      }
      done(result.ok ? result.shop.id : null);
    };
    reader.readAsText(file);
  }

  // お店を切りかえたときなど、書きかえ中の設定を捨てる
  function forgetDraft() {
    state.draft = null;
    state.settingsErrors = [];
  }

  return { render, handleClick, handleInput, handleSubmit, handleImport, forgetDraft, isDirty };
})();
