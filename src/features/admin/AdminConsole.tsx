'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { AuthClientError, authErrorMessage, jsonRequest } from '@/features/auth/client';
import { confirmAction, toast } from '@/lib/notifications';
import styles from './AdminConsole.module.css';

type Admin = { id: string; loginId: string; expiresAt: string };
type Category = { id: string; name: string };
type Member = {
  id: string;
  nickname: string;
  emoji: string;
  joinedAt: string;
  credentialVersion: number;
};
type View = 'login' | 'categories' | 'users';
const errors: Record<string, string> = {
  CATEGORY_EXISTS: '이미 있는 공부 종류예요. 다른 이름을 입력해주세요.',
  CATEGORY_IN_USE: '공부 기록에 사용 중인 종류예요. 기존 기록을 보호하기 위해 삭제할 수 없어요.',
  CONFLICT: '다른 요청에서 변경됐어요. 새로고침 후 다시 확인해주세요.',
  INVALID_CREDENTIALS: '관리자 아이디 또는 비밀번호를 확인해주세요.',
  FORBIDDEN: '관리자 계정으로 로그인해주세요.',
  UNAUTHORIZED: '관리자 로그인이 만료됐어요. 다시 로그인해주세요.',
};
function errorText(error: unknown) {
  return error instanceof AuthClientError && errors[error.code]
    ? errors[error.code]
    : authErrorMessage(error);
}
export function AdminConsole({ view }: { view: View }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <Workspace view={view} />
    </QueryClientProvider>
  );
}
function Workspace({ view }: { view: View }) {
  const router = useRouter();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [loginId, setLoginId] = useState('ADMIN');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Category | null>(null);
  const createId = useRef<string | null>(null);
  const resetIds = useRef(new Map<string, { requestId: string; version: number }>());
  const nameInput = useRef<HTMLInputElement>(null);
  const errorElement = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorElement.current?.focus();
  }, [error]);
  const auth = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: ({ signal }) => jsonRequest<{ admin: Admin }>('/api/admin/auth/me', undefined, signal),
    enabled: view !== 'login',
  });
  const actor = auth.data?.admin.id;
  const categories = useQuery({
    queryKey: ['admin', actor, 'categories'],
    queryFn: ({ signal }) =>
      jsonRequest<{ categories: Category[] }>('/api/admin/categories', undefined, signal),
    enabled: !!actor && view === 'categories',
  });
  const members = useQuery({
    queryKey: ['admin', actor, 'members'],
    queryFn: ({ signal }) =>
      jsonRequest<{ members: Member[] }>('/api/admin/members', undefined, signal),
    enabled: !!actor && view === 'users',
  });
  useEffect(() => {
    const failure = [auth.error, categories.error, members.error].find(
      (e) => e instanceof AuthClientError && e.status === 401,
    );
    if (failure) {
      client.clear();
      router.replace('/admin/login');
    }
  }, [auth.error, categories.error, members.error, client, router]);
  useEffect(() => {
    if (editing) nameInput.current?.focus();
  }, [editing]);
  async function perform(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
      if (e instanceof AuthClientError && e.status === 401 && view !== 'login') {
        client.clear();
        router.replace('/admin/login');
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function login(event: FormEvent) {
    event.preventDefault();
    if (!loginId.trim() || [...password].length < 12) {
      setError('관리자 아이디와 12자 이상의 비밀번호를 입력해주세요.');
      return;
    }
    void perform(async () => {
      await jsonRequest('/api/admin/auth/login', { loginId, password });
      setPassword('');
      client.clear();
      router.replace('/admin/categories');
    });
  }
  function saveCategory(event: FormEvent) {
    event.preventDefault();
    const length = [...name.trim().normalize('NFC')].length;
    if (length < 1 || length > 20) {
      setError('공부 종류 이름은 1~20자로 입력해주세요.');
      return;
    }
    void perform(async () => {
      if (editing)
        await jsonRequest(
          `/api/admin/categories/${editing.id}`,
          { name, expectedName: editing.name },
          undefined,
          'PATCH',
        );
      else {
        createId.current ??= crypto.randomUUID();
        await jsonRequest('/api/admin/categories', { id: createId.current, name });
      }
      createId.current = null;
      setName('');
      setEditing(null);
      void toast('공부 종류를 저장했어요.');
      await client.invalidateQueries({ queryKey: ['admin', actor, 'categories'] });
    });
  }
  function deleteCategory(category: Category) {
    void perform(async () => {
      if (
        !(await confirmAction(
          `‘${category.name}’ 종류를 삭제할까요?`,
          '기록에 사용 중인 종류는 삭제되지 않아요.',
          '종류 삭제',
          '취소',
        ))
      )
        return;
      await jsonRequest(
        `/api/admin/categories/${category.id}`,
        { expectedName: category.name },
        undefined,
        'DELETE',
      );
      if (editing?.id === category.id) {
        setEditing(null);
        setName('');
      }
      void toast('공부 종류를 삭제했어요.');
      await client.invalidateQueries({ queryKey: ['admin', actor, 'categories'] });
    });
  }
  function memberAction(member: Member, reset: boolean) {
    void perform(async () => {
      const accepted = await confirmAction(
        reset
          ? `‘${member.nickname}’님의 비밀번호를 0000으로 초기화할까요?`
          : `‘${member.nickname}’ 사용자를 영구 삭제할까요?`,
        reset
          ? '모든 기기에서 로그아웃돼요. 0000으로 로그인한 뒤 새 비밀번호를 정해야 공부방을 사용할 수 있어요.'
          : '계정과 모든 공부 기록이 함께 삭제됩니다. 삭제 후에는 복구할 수 없습니다.',
        reset ? '초기화' : '계정·기록 영구 삭제',
        '취소',
      );
      if (!accepted) return;
      if (reset) {
        let attempt = resetIds.current.get(member.id);
        if (!attempt) {
          attempt = { requestId: crypto.randomUUID(), version: member.credentialVersion };
          resetIds.current.set(member.id, attempt);
        }
        await jsonRequest(`/api/admin/members/${member.id}/reset-pin`, {
          requestId: attempt.requestId,
          expectedCredentialVersion: attempt.version,
        });
        resetIds.current.delete(member.id);
      } else
        await jsonRequest(
          `/api/admin/members/${member.id}`,
          { expectedCredentialVersion: member.credentialVersion },
          undefined,
          'DELETE',
        );
      void toast(reset ? '비밀번호를 0000으로 초기화했어요.' : '사용자와 공부 기록을 삭제했어요.');
      await client.invalidateQueries({ queryKey: ['admin', actor, 'members'] });
    });
  }
  const query = view === 'users' ? members : categories;
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>JLPT STUDY ROOM</span>
        <span className={styles.badge}>관리자</span>
      </header>
      <main className={styles.main}>
        {view === 'login' ? (
          <section className={styles.loginCard} aria-labelledby="admin-title">
            <span className={styles.symbol} aria-hidden="true">
              🌸
            </span>
            <h1 id="admin-title">관리자 로그인</h1>
            <p className={styles.muted}>공부방을 관리하는 공간이에요.</p>
            <form noValidate onSubmit={login} aria-busy={busy}>
              <fieldset disabled={busy} className={styles.fields}>
                <label className={styles.field}>
                  관리자 아이디
                  <input
                    name="loginId"
                    autoComplete="username"
                    required
                    maxLength={64}
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  관리자 비밀번호
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={12}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <Button type="submit">{busy ? '로그인 중…' : '관리자 로그인'}</Button>
              </fieldset>
            </form>
          </section>
        ) : (
          <>
            <div className={styles.heading}>
              <div>
                <p className={styles.eyebrow}>공부방 관리</p>
                <h1>{view === 'users' ? '사용자 관리' : '공부 종류'}</h1>
              </div>
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await jsonRequest('/api/admin/auth/logout', {});
                    client.clear();
                    router.replace('/admin/login');
                  })
                }
              >
                로그아웃
              </Button>
            </div>
            <nav className={styles.nav} aria-label="관리자 메뉴">
              <Link
                href="/admin/categories"
                aria-current={view === 'categories' ? 'page' : undefined}
              >
                공부 종류
              </Link>
              <Link href="/admin/users" aria-current={view === 'users' ? 'page' : undefined}>
                사용자 관리
              </Link>
            </nav>
            {auth.isPending && <p role="status">관리자 세션을 확인하고 있어요…</p>}
            {auth.error && (
              <div role="alert">
                <p>{errorText(auth.error)}</p>
                <Button onClick={() => void auth.refetch()}>세션 다시 확인</Button>
              </div>
            )}
            {actor && (
              <>
                {view === 'categories' ? (
                  <section className={styles.card} aria-labelledby="category-form-title">
                    <h2 id="category-form-title">{editing ? '공부 종류 수정' : '새 공부 종류'}</h2>
                    <form
                      noValidate
                      onSubmit={saveCategory}
                      aria-busy={busy}
                      className={styles.categoryForm}
                    >
                      <label className={styles.field}>
                        종류 이름
                        <input
                          ref={nameInput}
                          name="categoryName"
                          required
                          maxLength={20}
                          disabled={busy}
                          value={name}
                          onChange={(e) => {
                            setName(e.target.value);
                            if (!editing) createId.current = null;
                          }}
                          placeholder="예: 일본어 작문"
                        />
                      </label>
                      <div className={styles.actions}>
                        <Button type="submit" disabled={busy}>
                          {editing ? '수정 저장' : '종류 추가'}
                        </Button>
                        {editing && (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => {
                              setEditing(null);
                              setName('');
                            }}
                          >
                            수정 취소
                          </Button>
                        )}
                      </div>
                    </form>
                  </section>
                ) : null}
                <div className={styles.listHeader}>
                  <h2>{view === 'users' ? '스터디 회원' : '등록된 공부 종류'}</h2>
                  <Button
                    variant="quiet"
                    disabled={busy || query.isFetching}
                    onClick={() => void query.refetch()}
                  >
                    새로고침
                  </Button>
                </div>
                {query.isPending && <p role="status">목록을 불러오고 있어요…</p>}
                {query.error && (
                  <div role="alert">
                    <p>{errorText(query.error)}</p>
                    <Button disabled={busy} onClick={() => void query.refetch()}>
                      목록 다시 불러오기
                    </Button>
                  </div>
                )}
                <div className={styles.grid}>
                  {view === 'categories' &&
                    categories.data?.categories.map((category) => (
                      <article className={styles.card} key={category.id}>
                        <h3>{category.name}</h3>
                        <div className={styles.actions}>
                          <Button
                            variant="secondary"
                            aria-label={`${category.name} 수정`}
                            disabled={busy}
                            onClick={() => {
                              setEditing(category);
                              setName(category.name);
                              setError('');
                            }}
                          >
                            수정
                          </Button>
                          <Button
                            variant="quiet"
                            className={styles.danger}
                            aria-label={`${category.name} 삭제`}
                            disabled={busy}
                            onClick={() => deleteCategory(category)}
                          >
                            삭제
                          </Button>
                        </div>
                      </article>
                    ))}
                  {view === 'users' &&
                    members.data?.members.map((member) => (
                      <article className={styles.card} key={member.id}>
                        <h3>
                          <span aria-hidden="true">{member.emoji} </span>
                          {member.nickname}
                        </h3>
                        <p className={styles.muted}>
                          가입일{' '}
                          {new Date(member.joinedAt).toLocaleDateString('ko-KR', {
                            timeZone: 'Asia/Seoul',
                          })}
                        </p>
                        <div className={styles.actions}>
                          <Button
                            variant="secondary"
                            aria-label={`${member.nickname} PIN 초기화`}
                            disabled={busy}
                            onClick={() => memberAction(member, true)}
                          >
                            PIN 초기화
                          </Button>
                          <Button
                            variant="quiet"
                            className={styles.danger}
                            aria-label={`${member.nickname} 내보내기`}
                            disabled={busy}
                            onClick={() => memberAction(member, false)}
                          >
                            내보내기
                          </Button>
                        </div>
                      </article>
                    ))}
                </div>
                {!(view === 'users'
                  ? members.data?.members.length
                  : categories.data?.categories.length) &&
                  query.isSuccess && (
                    <p className={styles.empty}>
                      {view === 'users'
                        ? '아직 가입한 회원이 없어요.'
                        : '등록된 공부 종류가 없어요. 새 종류를 추가해주세요.'}
                    </p>
                  )}
              </>
            )}
          </>
        )}
        {error && (
          <p role="alert" className={styles.error} ref={errorElement} tabIndex={-1}>
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
