// =============================================================
// shop/js/shops.js — お店の設定の形と、見本の2店
//
// お店ごとの「設定」は1つのオブジェクトにまとめる（段階3で画面から変え、
// ファイルに書き出して受け渡す）。時刻は 'HH:MM'、日付は 'YYYY-MM-DD'（日本時間）。
//
// 設定の形：
//   id, type          … 'restaurant'（飲食店の型）か 'salon'（サロンの型）
//   name, intro, address, phone, mapUrl, color
//   bookingPrefix     … 予約番号の頭の2字（店の頭文字）
//   partNames         … 部の名前（1日2部まで。例 ['昼', '夜']）
//   weeklyHours[曜日] … その曜日の部ごとの営業時間 [{ start, end }, …]（0=日 … 6=土）
//   closedWeekdays    … 定休日の曜日
//   specialClosedDates… 臨時休業の日
//   menus             … [{ id, name, minutes, price（税別。金額なしは null）, description, parts }]
//                        parts：受ける部の番号（[0] なら第1部のみ。[] ならどの部も）
//   seats（飲食）     … [{ id, name, kind, capacity }]
//   staff（サロン）   … [{ id, name, offWeekdays }]
//   rules             … { deadlineHours, maxDaysAhead, stepMinutes, cleanupMinutes }
//   askFor            … 'name' | 'name_phone' | 'name_phone_email'（お客さんに聞くこと）
//   cancel            … { contactText, deadlineText, feeEnabled, feeDetail }
// =============================================================

// データの版番号。見本の中身や形を変えたら1つ上げる（保存データが作り直される）
const SHOP_DATA_VERSION = 2;

// どのお店にも共通のきまり
const SHOP_COMMON = {
  demoNotice: 'これは見本です。実際の予約は入りません',
  taxPercent: 10,               // 消費税（%）
  fewRatio: 0.3,                // 空きがこの割合以下なら △
  utcOffsetMinutes: 9 * 60,     // 日本時間
  bookingNumberDigits: 3,       // 予約番号の連番の桁数
  storageKey: 'ee-shop-demo',   // レッスン予約（ee-yoyaku-demo）とは別の名前で保存する
  takenMessage: '先に予約が入りました。別の時間をお選びください',
};

// 選べる色（5色）。色の中身は shop/css/style.css の先頭で決める
const SHOP_COLORS = [
  { id: 'navy', name: '紺' },
  { id: 'green', name: '深緑' },
  { id: 'brown', name: '茶' },
  { id: 'wine', name: 'えんじ' },
  { id: 'gray', name: '墨' },
];

// お客さんに聞くことの3択（既定は「名前＋電話」）
const ASK_FOR_OPTIONS = [
  { id: 'name', label: '名前だけ', fields: ['name'] },
  { id: 'name_phone', label: '名前＋電話', fields: ['name', 'phone'] },
  { id: 'name_phone_email', label: '名前＋電話＋メール', fields: ['name', 'phone', 'email'] },
];
const ASK_FOR_DEFAULT = 'name_phone';

// 飲食店の席の種類（お客さんの希望は「どれでもよい」が既定）
const SEAT_KINDS = ['テーブル', '個室', 'カウンター'];

// 空きがない理由（画面に出す言葉）
const SHOP_REASONS = {
  closed: '定休日',
  specialClosed: '臨時休業',
  staffOff: '担当のお休み',
  outOfRange: '受付期間外',
  deadline: '締め切り後',
  blocked: '受けない時間',
  noSeat: '人数に合う席がありません',
  full: '満席',
};

// お客さん側の手順（型ごと）。名前は画面の見出しにそのまま出す
const SHOP_STEPS = {
  restaurant: [
    { id: 'menu', title: 'コースを選ぶ' },
    { id: 'party', title: '人数と席を選ぶ' },
    { id: 'date', title: '日付を選ぶ' },
    { id: 'time', title: '時間を選ぶ' },
    { id: 'info', title: 'お客様情報' },
    { id: 'confirm', title: '予約内容の確認' },
  ],
  salon: [
    { id: 'menu', title: 'メニューを選ぶ' },
    { id: 'staff', title: '担当を選ぶ' },
    { id: 'date', title: '日付を選ぶ' },
    { id: 'time', title: '時間を選ぶ' },
    { id: 'info', title: 'お客様情報' },
    { id: 'confirm', title: '予約内容の確認' },
  ],
};

// 完了画面の「このあとの流れ」（型ごと）
const SHOP_AFTER_FLOW = {
  restaurant: [
    'ご予約の時間に、お店へお越しください',
    '人数が変わるときは、お店へお電話ください',
    'お支払いは、お店でお願いします',
  ],
  salon: [
    'ご予約の時間に、お店へお越しください',
    'メニューを変えたいときは、お店へお電話ください',
    'お支払いは、お店でお願いします',
  ],
};

// お客様情報の最初に入れておく見本の値
const SHOP_DUMMY_CUSTOMER = { name: '見本 太郎（見本）', phone: '090-0000-0000', email: 'mihon@example.com' };

// 飲食店で選べる人数の上限は、いちばん大きい席の定員（お店の設定から決まる）

// 曜日ごとに同じ営業時間を並べる小さな道具
function sameHoursEveryDay(parts) {
  return [0, 1, 2, 3, 4, 5, 6].map(() => parts.map((p) => ({ ...p })));
}

// -------------------------------------------------------------
// 見本の2店（架空のお店）
// -------------------------------------------------------------
const SAMPLE_SHOPS = [
  {
    id: 'yuzuriha',
    type: 'restaurant',
    name: '和食 ゆずり葉（見本）',
    intro: '季節の食材を使った和食のお店です。昼と夜、おまかせのコースをご用意しています。',
    address: '兵庫県豊岡市（見本のため架空の住所です）',
    phone: '0796-00-0000（見本）',
    mapUrl: '',
    color: 'green',
    bookingPrefix: 'YZ',
    partNames: ['昼', '夜'],
    weeklyHours: sameHoursEveryDay([
      { start: '11:30', end: '14:00' },
      { start: '17:30', end: '21:00' },
    ]),
    closedWeekdays: [3], // 水曜定休
    specialClosedDates: [],
    menus: [
      { id: 'lunch', name: '昼のおまかせ', minutes: 60, price: 1800, description: '季節の小鉢と焼き物、ごはん・汁物', parts: [0] },
      { id: 'dinner', name: '夜のおまかせ', minutes: 120, price: 5000, description: '旬の食材を使った全8品', parts: [1] },
      { id: 'seat', name: '席のみ', minutes: 90, price: null, description: 'お料理はお席でお選びください', parts: [] },
    ],
    seats: [
      { id: 't1', name: 'テーブル1', kind: 'テーブル', capacity: 4 },
      { id: 't2', name: 'テーブル2', kind: 'テーブル', capacity: 4 },
      { id: 't3', name: 'テーブル3', kind: 'テーブル', capacity: 4 },
      { id: 'r1', name: '個室', kind: '個室', capacity: 6 },
      // カウンターは「2名まで」の席×2（合計4名ぶん）。席をつなげる仕組みは作らない（2026-10-29 たけさん）
      { id: 'c1', name: 'カウンター1', kind: 'カウンター', capacity: 2 },
      { id: 'c2', name: 'カウンター2', kind: 'カウンター', capacity: 2 },
    ],
    // ※締め切り・何日先まで・刻みは指示書にないので仮の値（開発ログの質問を参照）
    rules: { deadlineHours: 3, maxDaysAhead: 30, stepMinutes: 30, cleanupMinutes: 15 },
    askFor: ASK_FOR_DEFAULT,
    cancel: {
      contactText: 'お電話でご連絡ください。',
      deadlineText: 'ご予約の前日まで',
      feeEnabled: true,
      feeDetail: '当日のキャンセルは、コース料金の50%をいただきます',
    },
  },
  {
    id: 'komorebi',
    type: 'salon',
    name: 'ヘアサロン こもれび（見本）',
    intro: '一人ひとりの髪に合わせて、ていねいにお切りします。',
    address: '兵庫県豊岡市（見本のため架空の住所です）',
    phone: '0796-00-0000（見本）',
    mapUrl: '',
    color: 'brown',
    bookingPrefix: 'KM',
    partNames: [''],
    weeklyHours: sameHoursEveryDay([{ start: '10:00', end: '19:00' }]),
    closedWeekdays: [2], // 火曜定休
    specialClosedDates: [],
    menus: [
      { id: 'cut', name: 'カット', minutes: 60, price: 4000, description: 'シャンプー・ブローつき', parts: [] },
      { id: 'color', name: 'カラー', minutes: 90, price: 6500, description: '根元から毛先まで', parts: [] },
      { id: 'cutcolor', name: 'カット＋カラー', minutes: 150, price: 9800, description: 'カットとカラーをいっしょに', parts: [] },
    ],
    staff: [
      { id: 's1', name: '木村（見本）', offWeekdays: [] },
      { id: 's2', name: '林（見本）', offWeekdays: [] },
      { id: 's3', name: '森（見本）', offWeekdays: [4] }, // 木曜休み
    ],
    rules: { deadlineHours: 1, maxDaysAhead: 30, stepMinutes: 30, cleanupMinutes: 10 },
    askFor: ASK_FOR_DEFAULT,
    cancel: {
      contactText: 'お電話でご連絡ください。',
      deadlineText: 'ご予約の時間まで',
      feeEnabled: false,
      feeDetail: '',
    },
  },
];

// -------------------------------------------------------------
// 最初から入れておく見本の予約と受けない時間
// 日付は「今日から数えて何日目の営業日か」で書き、初めて開いたときに本当の日付へ置きかえる
// -------------------------------------------------------------
const SAMPLE_RECORDS = {
  yuzuriha: {
    bookings: [
      { openDay: 1, start: '12:00', menuId: 'lunch', partySize: 2, name: '山田 花子（見本）', phone: '090-0000-0001' },
      { openDay: 1, start: '18:00', menuId: 'dinner', partySize: 6, name: '佐藤 一郎（見本）', phone: '090-0000-0002' },
      { openDay: 2, start: '11:30', menuId: 'lunch', partySize: 1, name: '鈴木 美咲（見本）', phone: '090-0000-0003' },
      { openDay: 2, start: '19:00', menuId: 'seat', partySize: 3, name: '田中 健太（見本）', phone: '090-0000-0004' },
      { openDay: 3, start: '12:30', menuId: 'lunch', partySize: 4, name: '高橋 由美（見本）', phone: '090-0000-0005' },
      { openDay: 4, start: '18:30', menuId: 'dinner', partySize: 2, name: '伊藤 和夫（見本）', phone: '090-0000-0006' },
      { openDay: 6, start: '17:30', menuId: 'dinner', partySize: 4, name: '渡辺 恵子（見本）', phone: '090-0000-0007' },
    ],
    blocks: [
      { openDay: 5, start: '17:30', end: '21:00', reason: '貸し切りのため' },
    ],
  },
  komorebi: {
    bookings: [
      { openDay: 1, start: '10:00', menuId: 'cut', staffId: 's1', name: '中村 翔（見本）', phone: '090-0000-0011' },
      { openDay: 1, start: '13:00', menuId: 'cutcolor', staffId: 'any', name: '小林 さくら（見本）', phone: '090-0000-0012' },
      { openDay: 2, start: '11:00', menuId: 'color', staffId: 's2', name: '加藤 直子（見本）', phone: '090-0000-0013' },
      { openDay: 3, start: '15:00', menuId: 'cut', staffId: 'any', name: '吉田 誠（見本）', phone: '090-0000-0014' },
      { openDay: 4, start: '10:30', menuId: 'cutcolor', staffId: 's3', name: '山本 彩（見本）', phone: '090-0000-0015' },
      { openDay: 5, start: '16:00', menuId: 'cut', staffId: 's1', name: '松本 大輔（見本）', phone: '090-0000-0016' },
      { openDay: 7, start: '14:00', menuId: 'color', staffId: 'any', name: '井上 真由（見本）', phone: '090-0000-0017' },
    ],
    blocks: [
      { openDay: 6, start: '10:00', end: '12:00', reason: '講習のため' },
    ],
  },
};
