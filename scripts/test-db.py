"""격리된 로컬 PostgreSQL 테스트 DB 전용. 운영 DB에는 실행하지 않는다."""
import os
from pathlib import Path
import subprocess
import time
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
url = os.environ.get("JLPT_TEST_DATABASE_URL", "")
parsed = urlparse(url)
if parsed.hostname not in ("localhost", "127.0.0.1") or parsed.path != "/jlpt_test":
    raise SystemExit("JLPT_TEST_DATABASE_URL은 localhost/127.0.0.1의 jlpt_test 전용 DB여야 합니다.")


def run(sql, *, expected=None):
    result = subprocess.run(
        ["psql", url, "-X", "-v", "ON_ERROR_STOP=1", "-At"],
        input=sql, text=True, capture_output=True, timeout=30,
    )
    if expected is None and result.returncode:
        raise AssertionError(result.stderr)
    if expected is not None:
        if result.returncode == 0 or expected not in result.stderr:
            raise AssertionError(f"Expected {expected}: {result.stdout} {result.stderr}")
    return result.stdout.strip()


# 중복 실행이나 다른 앱의 스키마를 덮어쓰지 않는다. 빈 임시 DB에만 적용한다.
if run("select count(*) from pg_tables where schemaname = 'public';") != "0":
    raise SystemExit("빈 테스트 DB가 아닙니다. 새 테스트 컨테이너/DB를 사용하세요.")
run((ROOT / "tests/db/bootstrap.sql").read_text())
for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
    run(migration.read_text())
run((ROOT / "tests/db/contracts.sql").read_text())

# 별도 연결 둘을 경합시켜 실제 행 잠금과 일일 상한을 검사한다.
first = subprocess.Popen(
    ["psql", url, "-X", "-v", "ON_ERROR_STOP=1", "-At"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
)
first.stdin.write((ROOT / "tests/db/concurrent-first.sql").read_text())
first.stdin.close()
# pg_sleep 시간을 추측해 시작하지 않는다. 잠금 보유 연결의 상태를 DB에서 확인한다.
for _ in range(100):
    if run("select count(*) from pg_stat_activity where application_name = 'jlpt_lock_test' and wait_event = 'PgSleep';") == "1":
        break
    if first.poll() is not None:
        raise AssertionError(first.stderr.read())
    time.sleep(0.05)
else:
    first.terminate()
    raise AssertionError("동시 요청 테스트의 잠금 획득을 확인하지 못했습니다.")
try:
    run((ROOT / "tests/db/concurrent-second.sql").read_text(), expected="DAILY_LIMIT_EXCEEDED")
    if first.wait(timeout=15) != 0:
        raise AssertionError(first.stderr.read())
finally:
    if first.poll() is None:
        first.terminate()
assert run("select sum(minutes) from public.study_records where user_id = '00000000-0000-0000-0000-000000000003';") == "1440"
print("PASS: PostgreSQL 스키마·권한·기록 계약·동시 저장 상한")
