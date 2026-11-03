# 관리자 링크 공유 문구 구분 (#92)

관리자 링크도 일반 회원 소개를 상속해 공유 목적이 불분명했다. /admin 하위 layout에서 페이지 제목·description·OG·Twitter 제목/소개를 관리자 페이지로 구분하고 OG URL은 /admin/login으로 지정한다. 루트 회원용 문구는 유지한다.

Next의 중첩 metadata는 얕게 병합되므로 OG 필드 일부만 선언하면 기존 이미지가 사라진다. 기존 공통 metadata를 src/lib/site-metadata.ts로 옮기고 관리자 설정은 이를 펼쳐 사용해 대표 이미지·사이트명·언어·이미지 크기를 보존한다. 새 layout은 children만 반환해 화면이나 인증 동작을 바꾸지 않는다. 검사 결과는 PR에 남긴다.
