import { test, expect } from '@playwright/test';
import { readMutationJson } from '../../src/server/auth/request-guard';

const origin = 'https://study.example';
function request(body = '{"pin":"0123"}', headers: Record<string, string> = {}, method = 'POST') {
  return new Request(`${origin}/api/auth/login`, {
    method,
    headers: { origin, 'content-type': 'application/json; charset=utf-8', ...headers },
    ...(method === 'GET' ? {} : { body }),
  });
}

test('변경 메서드·정확한 Origin·JSON 미디어 타입을 검사', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    expect(await readMutationJson(request(undefined, {}, method), origin)).toEqual({ pin: '0123' });
  }
  for (const [req, status] of [
    [request(undefined, {}, 'GET'), 405],
    [request(undefined, { origin: 'https://study.example.evil' }), 403],
    [request(undefined, { origin: '' }), 403],
    [request(undefined, { 'content-type': 'text/plain' }), 415],
  ] as const) {
    await expect(readMutationJson(req, origin)).rejects.toMatchObject({ status });
  }
  await expect(readMutationJson(request(), origin + '/')).rejects.toThrow('APP_ORIGIN');
});

test('본문 실제 바이트 상한은 길이 헤더 누락·거짓 값과 Unicode에도 적용', async () => {
  const exact = JSON.stringify({ x: 'a'.repeat(4088) });
  expect(new TextEncoder().encode(exact)).toHaveLength(4096);
  expect(await readMutationJson(request(exact), origin)).toHaveProperty('x');
  const headerCases: Record<string, string>[] = [
    {},
    { 'content-length': '1' },
    { 'content-length': '4097' },
  ];
  for (const headers of headerCases) {
    await expect(readMutationJson(request(exact + ' ', headers), origin)).rejects.toMatchObject({
      status: 413,
    });
  }
  await expect(
    readMutationJson(request(JSON.stringify({ x: '가'.repeat(1500) })), origin),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    readMutationJson(request('{}', { 'content-length': '-1' }), origin),
  ).rejects.toMatchObject({ status: 400 });
});

test('깨진 JSON·배열·null은 거부하고 오류에 PIN이나 원문을 넣지 않음', async () => {
  for (const body of ['{"pin":"secret-value"', '[]', 'null', '123', '']) {
    await expect(readMutationJson(request(body), origin)).rejects.toMatchObject({
      status: 400,
      message: 'INVALID_JSON',
    });
  }
});
