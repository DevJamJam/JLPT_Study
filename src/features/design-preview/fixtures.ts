// 디자인 검토 전용 가상 데이터. 운영 데이터와 공휴일 API를 대체하지 않는다.
export const TODAY = '2026-10-06';
export const EMOJIS = [
  '🐰',
  '🐱',
  '🐶',
  '🐻',
  '🐼',
  '🐨',
  '🦊',
  '🐯',
  '🦁',
  '🐵',
  '🐸',
  '🐙',
  '🐳',
  '🐬',
  '🐧',
  '🐢',
  '🐟',
  '🐥',
  '🌸',
  '⭐',
];
export const CATEGORIES = ['단어', '한자', '문법', '독해', '청해', '회화', '기타'];
export const MEMBERS = EMOJIS.slice(0, 15).map((emoji, index) => ({
  name: [
    '하루',
    '모모',
    '두두',
    '봄봄',
    '노랑',
    '소라',
    '초록',
    '구름',
    '달빛',
    '새봄',
    '별빛',
    '여름',
    '바다',
    '나무',
    '하늘',
  ][index],
  emoji,
  color: index + 1,
  days: [index % 2 === 0, true, false, false, false, false, false],
}));
export type PreviewRecord = {
  id: string;
  date: string;
  category: string;
  minutes: number;
  start?: string;
  quantity?: string;
  memo?: string;
};
export const RECORDS: PreviewRecord[] = [
  {
    id: '1',
    date: TODAY,
    category: '단어',
    minutes: 40,
    start: '19:00',
    quantity: '30개',
    memo: '헷갈린 단어 다시 보기',
  },
  { id: '2', date: TODAY, category: '문법', minutes: 30, memo: '예문으로 복습' },
  { id: '3', date: '2026-10-05', category: '독해', minutes: 35, start: '20:00' },
  { id: '4', date: '2026-10-04', category: '청해', minutes: 25 },
];
export const HOLIDAYS: Record<string, string> = {
  '2026-10-03': '개천절',
  '2026-10-05': '대체공휴일',
  '2026-10-09': '한글날',
};
export const EMPTY = '아직 기록이 없어요. 공부 기록을 남겨 보아요.';
export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function shiftedDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return dateKey(d);
}
export function monthDays(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => shiftedDate(dateKey(first), i - offset));
}
export function duration(minutes: number) {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}`
    : `${minutes}분`;
}
