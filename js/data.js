// =============================================================
// js/data.js — 中身のデータと予約のきまり
// 講座・場所・金額・営業時間などの「数字や文章」は、すべてここに置く。
// ほかのファイルには数字を直書きしない。
// =============================================================

// データの版番号。中身を変えたら 1 つ上げる。
// 上げると、ブラウザに保存してある見本データが作り直される。
const DATA_VERSION = 2;

// 教室の情報（トップ画面で使う）
const SCHOOL = {
  name: 'e-education',
  // ※一言紹介は仮の文。たけさんの確認待ち（開発ログの質問を参照）
  intro: 'パソコン・スマホ・AIの使い方を、一人ひとりに合わせてお教えする教室です。',
  hoursText: '平日 9:00〜18:00（土日祝・年末年始は休み）',
};

// 見本であることのお知らせ（全画面に出す）
const DEMO_NOTICE = 'これは見本です。実際の予約は入りません';

// 講座（5つ）。price は税抜きの金額（円）。0 は無料。
const COURSES = [
  {
    id: 'free',
    name: '初回無料相談',
    minutes: 60,
    price: 0,
    freeLabel: '無料（初回のみ）',
    description: 'パソコン・スマホ・AIの困りごとや、何から始めるかのご相談',
  },
  {
    id: 'beginner',
    name: '初級',
    minutes: 60,
    price: 2000,
    description: 'エクセル・ワード・パワーポイント',
  },
  {
    id: 'intermediate',
    name: '中級',
    minutes: 60,
    price: 2000,
    description: 'AIでWordPressホームページ作成',
  },
  {
    id: 'advanced',
    name: '上級',
    minutes: 60,
    price: 4000,
    description: 'AIでYouTube作成／スマホからパソコン操作／SNS自動投稿／宣伝用動画／アンケート自動集計',
  },
  {
    id: 'master',
    name: '最上級',
    minutes: 60,
    price: 10000,
    description: 'AI自動運転／AIを従業員のように使う／アプリ開発／オリジナル講座',
  },
];

// 講座の下に添える文
const COURSE_NOTES = [
  '受講料にはテキストが含まれます',
  '入会金はありません',
  'オンラインも同じ受講料です',
];

// チケット（前払い・有効期限なし）。price は税抜き。
const TICKETS = [
  { courseId: 'beginner', count: 5, price: 10000 },
  { courseId: 'intermediate', count: 10, price: 20000 },
  { courseId: 'advanced', count: 10, price: 40000 },
  { courseId: 'master', count: 5, price: 50000 },
];
const TICKET_NOTE = '前払い・有効期限なし';
const PAYMENT_NOTE = 'お支払いは当日またはチケットで';

// 受ける場所（3つ）。bufferMinutes は予約の前後に空ける時間（分）。
const PLACES = [
  {
    id: 'office',
    name: '事務所',
    detail: '兵庫県豊岡市日高町野々庄210',
    bufferMinutes: 0,
  },
  {
    id: 'visit',
    name: '出張',
    detail: '但馬圏内のご自宅・事業所へうかがいます。',
    // 出張費の金額は、決め方をたけさんが検討中のため画面に出さない（2026-10-28）
    feeText: '出張費：豊岡市内は無料。豊岡市外の但馬圏内は別途（金額はご予約後にご案内します）',
    bufferMinutes: 60,
  },
  {
    id: 'online',
    name: 'オンライン',
    detail: 'Zoom（予約確定後にURLをお送りします）',
    bufferMinutes: 0,
  },
];

// 予約のきまり。時刻は 'HH:MM'（日本時間）。
const RULES = {
  openWeekdays: [1, 2, 3, 4, 5], // 予約できる曜日（0=日 1=月 … 6=土）
  openTime: '09:00',             // 営業の始まり
  closeTime: '18:00',            // 営業の終わり（講座はこの時刻までに終わること）
  slotStepMinutes: 30,           // 開始時刻の刻み
  deadlineBusinessDaysBefore: 1, // 受付の締め切り：何営業日前の（土日祝・お休みは数えない）
  deadlineTime: '18:00',         //                 何時まで
  maxDaysAhead: 60,              // 何日先まで予約できるか
  fewRatio: 0.3,                 // 空きが全体のこの割合以下なら △
  utcOffsetMinutes: 9 * 60,      // 日本時間（UTC+9。日本に夏時間はない）
  taxPercent: 10,                // 消費税（%）
  bookingNumberPrefix: 'EE-',    // 予約番号の頭
  bookingNumberDigits: 3,        // 予約番号の連番の桁数
  storageKey: 'ee-yoyaku-demo',  // ブラウザに保存するときの名前
};

// 祝日（2026年11月〜2027年3月）。土日祝は休み。
// 2026-10-28 たけさん確認済み
const HOLIDAYS = [
  { date: '2026-11-03', name: '文化の日' },
  { date: '2026-11-23', name: '勤労感謝の日' },
  { date: '2027-01-01', name: '元日' },
  { date: '2027-01-11', name: '成人の日' },
  { date: '2027-02-11', name: '建国記念の日' },
  { date: '2027-02-23', name: '天皇誕生日' },
  { date: '2027-03-21', name: '春分の日' },
  { date: '2027-03-22', name: '振替休日' },
];

// 祝日のほかのお休み（期間で書く。from〜to の両日を含む）
const CLOSED_PERIODS = [
  { from: '2026-12-29', to: '2027-01-03', name: '年末年始のお休み' },
];

// 変更・キャンセルの連絡先（見本のため仮の番号とメール）
const CONTACT = {
  phone: '0796-00-0000（見本）',
  email: 'info@example.com（見本）',
  deadlineText: '前の営業日の18:00まで',
};

// 完了画面の「このあとの流れ」（場所ごと）
// ※文はたけさんの確認待ち（開発ログの質問を参照）
const AFTER_FLOW = {
  office: [
    '確認のメールが届きます（見本のため、実際には送られません）',
    'ご予約の時間に、事務所へお越しください',
    'お支払いは当日またはチケットで',
  ],
  visit: [
    '確認のメールが届きます（見本のため、実際には送られません）',
    '豊岡市外の場合は、出張費の金額をご案内します',
    'ご予約の時間に、ご自宅・事業所へうかがいます',
    'お支払いは当日またはチケットで',
  ],
  online: [
    '確認のメールが届きます（見本のため、実際には送られません）',
    'ZoomのURLをお送りします',
    'ご予約の時間に、URLからご参加ください',
    'お支払いは当日またはチケットで',
  ],
};

// お客様情報の最初に入れておく見本の値
const DUMMY_CUSTOMER = {
  name: '見本 太郎（見本）',
  phone: '090-0000-0000',
  email: 'mihon@example.com',
  note: '',
};

// 空きがない理由（画面に出す言葉）
const REASONS = {
  booked: '予約済み',
  closed: '休み',
  deadline: '締め切り後',
  blocked: '受けない時間',
  travel: '移動時間',
  outOfRange: '受付期間外', // 60日より先（指示書の5つの理由に足したもの。開発ログ参照）
  full: '満席',             // 1日の中で理由がまちまちのとき
};

// 確定の直前に枠が埋まっていたときの案内（責めない言い方）
const TAKEN_MESSAGE = '先に予約が入りました。別の時間をお選びください';

// -------------------------------------------------------------
// 最初から入れておく見本データ
// 日付は「今日から数えて何営業日目か」で書いておき、
// 初めて開いたときに本当の日付へ置きかえる（いつ開いても「これから2週間」に見えるように）。
// -------------------------------------------------------------
const SEED_BOOKINGS = [
  { businessDay: 1, start: '10:00', courseId: 'beginner', placeId: 'office', name: '山田 花子（見本）', phone: '090-0000-0001', email: 'yamada@example.com', note: '' },
  { businessDay: 1, start: '14:00', courseId: 'advanced', placeId: 'visit', name: '佐藤 一郎（見本）', phone: '090-0000-0002', email: 'sato@example.com', note: 'お店のSNSを自動で投稿したいです' },
  { businessDay: 2, start: '09:30', courseId: 'intermediate', placeId: 'online', name: '鈴木 美咲（見本）', phone: '090-0000-0003', email: 'suzuki@example.com', note: '' },
  { businessDay: 3, start: '13:00', courseId: 'free', placeId: 'office', name: '田中 健太（見本）', phone: '090-0000-0004', email: 'tanaka@example.com', note: '何から始めればよいか相談したいです' },
  { businessDay: 4, start: '10:00', courseId: 'master', placeId: 'online', name: '高橋 由美（見本）', phone: '090-0000-0005', email: 'takahashi@example.com', note: '' },
  { businessDay: 5, start: '15:00', courseId: 'beginner', placeId: 'visit', name: '伊藤 和夫（見本）', phone: '090-0000-0006', email: 'ito@example.com', note: 'エクセルの表の作り方を教えてください' },
  { businessDay: 8, start: '11:00', courseId: 'intermediate', placeId: 'office', name: '渡辺 恵子（見本）', phone: '090-0000-0007', email: 'watanabe@example.com', note: '' },
  { businessDay: 9, start: '16:00', courseId: 'free', placeId: 'online', name: '中村 翔（見本）', phone: '090-0000-0008', email: 'nakamura@example.com', note: '' },
];

const SEED_BLOCKS = [
  { businessDay: 3, start: '09:00', end: '12:00', reason: '議会のため' },
  { businessDay: 6, start: '09:00', end: '18:00', reason: '出張のため' },
];
