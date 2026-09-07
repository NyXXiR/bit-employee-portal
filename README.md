# Internal Employee Portal

Next.js와 PostgreSQL 기반의 사내 직원 관리 애플리케이션입니다.

## 실행 환경

- Node.js 20.9 이상, 21 미만
- PostgreSQL

## 로컬 실행

1. `.env.example`을 `.env`로 복사하고 DB 접속 정보와 계정 설정을 입력합니다.
2. 의존성 설치, 마이그레이션, 초기 데이터 생성을 진행합니다.

```bash
npm ci
npx prisma migrate deploy
npm run db:seed
npm run dev
```

접속 주소는 `http://localhost:3000`입니다. 시드는 기존 계정의 비밀번호를 변경하지 않습니다.

| 환경변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 연결 주소 |
| `SESSION_SECRET` | 32자 이상의 세션 서명 비밀값 |
| `APP_ORIGIN` | 앱 접속 주소 |
| `SEED_ADMIN_LOGIN_ID` / `SEED_ADMIN_PASSWORD` | 초기 관리자 계정 |
| `SEED_EMPLOYEE_LOGIN_ID` / `SEED_EMPLOYEE_PASSWORD` | 초기 직원 계정 |
| `BACKGROUND_CHECK_API_URL` | 외부 검사 API 주소 |
| `BACKGROUND_CHECK_GET_TIMEOUT_MS` | 외부 조회 제한시간, 기본 `1000` |
| `BACKGROUND_CHECK_POST_TIMEOUT_MS` | 외부 생성 제한시간, 기본 `2000` |

새 계정의 초기 비밀번호는 10자 이상으로 설정합니다. 실제 `.env` 파일은 Git에서 제외됩니다.

## 빌드 및 실행

```bash
npx prisma migrate deploy
npm run build
npm start
```

## 검증

테스트용 DB에 마이그레이션과 시드를 적용한 뒤 실행합니다. 통합 테스트는 테스트용 앱 서버도 실행되어 있어야 합니다.

```bash
npm test
npm run test:smoke
npm run lint
npx tsc --noEmit
```
