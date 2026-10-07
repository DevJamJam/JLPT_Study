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

run((ROOT / "tests/db/auth-contracts.sql").read_text())


def check_race(first_file, second_file, expected_error):
    """잠금 보유 상태를 확인한 뒤 두 번째 연결로 실제 경합을 만든다."""
    first = subprocess.Popen(
        ["psql", url, "-X", "-v", "ON_ERROR_STOP=1", "-At"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    first.stdin.write((ROOT / first_file).read_text())
    first.stdin.close()
    try:
        for _ in range(100):
            if run("select count(*) from pg_stat_activity where application_name = 'jlpt_lock_test' and wait_event = 'PgSleep';") == "1":
                break
            if first.poll() is not None:
                raise AssertionError(first.stderr.read())
            time.sleep(0.05)
        else:
            raise AssertionError("동시 요청의 잠금 획득을 확인하지 못했습니다.")
        run((ROOT / second_file).read_text(), expected=expected_error)
        if first.wait(timeout=15) != 0:
            raise AssertionError(first.stderr.read())
    finally:
        if first.poll() is None:
            first.terminate()
            first.wait(timeout=5)


check_race("tests/db/concurrent-first.sql", "tests/db/concurrent-second.sql", "DAILY_LIMIT_EXCEEDED")
assert run("select sum(minutes) from public.study_records where user_id = '00000000-0000-0000-0000-000000000003';") == "1440"
check_race("tests/db/join-concurrent-first.sql", "tests/db/join-concurrent-second.sql", "GROUP_FULL")
assert run("select count(*) from public.group_members where group_id = '40000000-0000-0000-0000-000000000001';") == "15"
print("PASS: PostgreSQL 스키마·권한·기록 계약·동시 저장 상한·가입·세션·동시 가입 정원")
