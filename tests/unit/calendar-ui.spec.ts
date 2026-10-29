import { test, expect } from '@playwright/test';
import { calendarRoute, monthDates, monday } from '../../src/features/calendar/dates';
import { dayRecords } from '../../src/features/calendar/client';
import type { StudyRecord } from '../../src/features/study-record/types';

const today = '2026-10-29';
test('달력42칸·월요일 시작·윤일·연말·최저 날짜 범위를 계산한다', () => {
  const leap = monthDates('2024-02');
  expect(leap).toHaveLength(42);
  expect(leap[0]).toBe('2024-01-29');
  expect(leap).toContain('2024-02-29');
  expect(monday('2027-01-01')).toBe('2026-12-28');
  const lower = calendarRoute('month=2000-01', today);
  expect(lower.from).toBe('2000-01-01');
  expect(lower.dates).toHaveLength(42);
});
test('유효하지 않은 기간과 팝업을 정리하고 미래 날짜의 추가는 차단한다', () => {
  const bad = calendarRoute(
    'view=other&month=2026-13&date=2026-02-30&panel=edit&recordId=bad',
    today,
  );
  expect(bad.month).toBe('2026-10');
  expect(bad.date).toBeNull();
  expect(bad.invalidPopup).toBe(true);
  expect(calendarRoute('date=2026-10-30&panel=new', today).panel).toBeNull();
  expect(calendarRoute('date=2026-10-30', today).date).toBe('2026-10-30');
  expect(calendarRoute('date=2026-10-29&scope=other', today).date).toBeNull();
});
test('팝업 내부 전환에 필요한 날짜·ID와 선택한 월/주를 보존한다', () => {
  const value = calendarRoute(
    'view=week&month=2026-09&week=2026-10-26&date=2026-10-29&scope=mine&panel=edit&recordId=58000000-0000-4000-8000-000000000001',
    today,
  );
  expect(value.month).toBe('2026-09');
  expect(value.week).toBe('2026-10-26');
  expect(new URLSearchParams(value.canonical).get('month')).toBe('2026-09');
  expect(value.recordId).toBe('58000000-0000-4000-8000-000000000001');
});
test('날짜 상세의 시각·NULL·생성 마이크로초·ID 정렬을 유지한다', () => {
  const row = { startTime: null, createdAt: '2026-10-29T00:00:00Z' } as StudyRecord;
  const rows = [
    { ...row, id: 'd' },
    { ...row, id: 'c', startTime: '09:00', createdAt: '2026-10-29T00:00:00.123457Z' },
    { ...row, id: 'b', startTime: '09:00', createdAt: '2026-10-29T00:00:00.123456+00:00' },
    { ...row, id: 'a', startTime: '09:00', createdAt: '2026-10-29T00:00:00.123456Z' },
  ];
  expect(dayRecords(rows).map((record) => record.id)).toEqual(['a', 'b', 'c', 'd']);
});
