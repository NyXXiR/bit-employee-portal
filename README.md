# Internal Employee Portal

비트컴퓨터 개발자 채용 과제를 위한 사내 직원 관리 웹 애플리케이션 프로젝트입니다.

Node.js 20.9.0과 Next.js 16 기반의 단일 애플리케이션입니다. 화면과 서버를 별도 배포하지
않고, UI·HTTP·도메인·데이터 계층을 코드 구조로 분리합니다.

## 개발 환경

DB 접속 정보는 루트 `.env`에 입력합니다. 이 프로젝트 전용 데이터베이스
`bit_employee_portal`의 `public` 스키마를 사용합니다.

```bash
npm install
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

`.env`는 저장소에 올라가지 않습니다. 새 환경에서는 `.env.example`을 복사해 채우십시오.
`DATABASE_URL`이 가리키는 DB는 저장소에 담기지 않으므로, 다른 장비에서는 Postgres를 새로
띄우고 `npx prisma migrate deploy`와 `npm run db:seed`로 다시 만들어야 합니다.

시드 로그인 아이디 환경변수는 필수입니다. 관리자 계정과 `EMP-001` 직원 계정이 존재하지 않을
때만 비밀번호 환경변수를 읽으며 placeholder 비밀번호는 거부합니다. 시드를 다시 실행해도 기존
비밀번호, 역할, 직원 연결을 덮어쓰지 않으며 역할이나 연결이 기대값과 다르면 오류로 중단합니다.

직원 레코드와 로그인 계정은 생명주기가 분리되어 있습니다. 관리자는 직원 목록에서 로그인
아이디 또는 `미발급` 상태를 확인하고, 계정이 없는 재직 직원의 상세 화면에서 아이디와 초기
비밀번호를 한 번 발급할 수 있습니다. 기존 계정의 로그인 아이디 변경과 비밀번호 재설정은
프로필 수정에 포함하지 않습니다. 비밀번호를 잊은 재직 직원은 관리자 상세 화면에서 새 임시
비밀번호를 설정할 수 있으며, 이때 기존 로그인 세션은 모두 폐기됩니다.

Background Check의 완료 상태와 요청 메타데이터는 이력으로 남기지만 범죄 기록, 학력·경력
검증값과 신용 등급은 로컬 DB에 저장하지 않습니다. 관리자가 결과 보기를 누르면 기존
`checkId`로 외부 API를 조회해 그 응답에만 표시합니다.

## 검증

```bash
npm test          # 단위·계약 테스트 29건 (DB 불필요)
npm run test:smoke # 실제 DB와 서버에 대한 전 구간 시나리오 (dev 서버 실행 중이어야 함)
npm run lint
npx tsc --noEmit
```

`npm test`는 `scripts/run-tests.mjs`를 거칩니다. 테스트 일부가 `src/server`를 직접 가져오는데
그쪽은 `server-only`로 보호돼 있어 `--conditions=react-server` 없이 실행하면 실패합니다.
`npx tsx --test tests/...`로 직접 돌릴 때도 같은 플래그가 필요합니다.

## 외부 API 실측

Background Check API의 실제 거동과 그로부터 정한 타임아웃·재시도·폴링 값은
[`MEASUREMENTS.md`](MEASUREMENTS.md)에 있습니다. 읽기용 요약은
[`docs/measurements-summary.md`](docs/measurements-summary.md), 원본 관측과 재분석 방법은
[`measurements/README.md`](measurements/README.md)에 있습니다.

```bash
npm run measure:analyze -- measurements/2026-09-03T15-20-07-345Z  # 저장된 원본 재집계
npm run measure:validate                                          # 정한 정책을 100회 실행해 검증
npm run submit:collect                                            # 제출용 파일을 docs/submit/ 에 모음
```

`npm run measure`는 외부 API에 실제 POST를 보냅니다. `MEASURE_CONFIRM_WRITES=YES`가 있어야 실행됩니다.

## 코드 경계

```text
src/app          페이지와 Route Handler
src/components   클라이언트 상호작용과 공통 UI
src/server       인증, 권한, 도메인 규칙, DB, 외부 API
prisma           데이터 모델, 마이그레이션, 시드
scripts          검증 및 외부 API 측정 도구
```

`src/server`는 `server-only`로 보호하며 브라우저 번들에서 가져올 수 없습니다.
