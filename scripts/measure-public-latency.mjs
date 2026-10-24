import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const samples = process.argv.includes('--samples=1') ? 1 : 3;
const directory = mkdtempSync(join(tmpdir(), 'jlpt-public-latency-'));
try {
  for (const path of ['/api/auth/me', '/login']) {
    for (let sample = 1; sample <= samples; sample++) {
      const headers = join(directory, 'headers');
      const raw = execFileSync(
        'curl',
        [
          '--silent',
          '--show-error',
          '--max-time',
          '15',
          '--dump-header',
          headers,
          '--output',
          '/dev/null',
          '--write-out',
          '{"status":"%{http_code}","dns":%{time_namelookup},"tcp":%{time_connect},"tls":%{time_appconnect},"ttfb":%{time_starttransfer},"total":%{time_total}}',
          `https://jlpt-study-gamma.vercel.app${path}`,
        ],
        { encoding: 'utf8', timeout: 20000 },
      );
      const timing = JSON.parse(raw);
      const text = readFileSync(headers, 'utf8');
      const getHeader = (name) =>
        [...text.matchAll(new RegExp(`^${name}:\\s*(.+)$`, 'gmi'))].at(-1)?.[1].trim() ?? null;
      const milliseconds = Object.fromEntries(
        Object.entries(timing)
          .filter(([key]) => key !== 'status')
          .map(([key, value]) => [key, Math.round(value * 1000)]),
      );
      console.log(
        JSON.stringify({
          path,
          sample,
          status: Number(timing.status),
          milliseconds,
          serverTiming: getHeader('server-timing'),
          usesProxy: Boolean(
            process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY,
          ),
        }),
      );
      if (timing.status !== (path === '/login' ? '200' : '401'))
        throw new Error('Unexpected public response');
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
