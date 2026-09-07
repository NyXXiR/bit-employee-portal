# Internal Employee Portal

Next.js와 PostgreSQL 기반의 사내 직원 관리 애플리케이션입니다.

실행 명령은 모두 프로젝트 루트에서 입력합니다.

## Docker가 있는 환경

Docker Desktop 또는 Docker Engine + Compose v2가 실행 중이면 됩니다. Node.js·PostgreSQL을 따로 설치하거나 `.env`를 만들 필요가 없습니다.

```bash
docker compose up --build -d --wait
```

최초 빌드는 npm 패키지·Google Fonts 다운로드를 위해 인터넷 연결이 필요하며, 시간이 걸릴 수 있습니다. 실행이 끝나면 **http://localhost:3000**에 접속합니다.

| 구분 | 아이디 | 비밀번호 |
| --- | --- | --- |
| 관리자 | `admin` | `12321` |
| 직원 | `employee` | `1232123` |

위 값은 로컬 리뷰용 기본 계정입니다. 앱과 DB 포트는 로컬 컴퓨터에서만 접근할 수 있도록 설정했습니다.

### 시작할 때 자동 처리되는 내용

1. PostgreSQL 준비 상태 확인
2. Prisma Client 생성과 DB 마이그레이션 적용
3. 직원 10명과 관리자·직원 계정 생성
4. 앱 실행

마이그레이션이나 시드가 실패하면 앱 실행도 중단합니다. 재실행 시 기존 직원 정보와 계정 비밀번호를 덮어쓰지 않습니다.

### 종료·재실행

```bash
docker compose down
docker compose up -d --wait
```

DB 데이터는 Docker 볼륨에 유지됩니다. 코드 변경 후에는 `docker compose up --build -d --wait`로 다시 빌드합니다.

실행 상태와 오류는 다음 명령으로 확인합니다.

```bash
docker compose ps
docker compose logs --tail=100 app db
```

### 포트·계정 변경

`.env.example`을 `.env`로 복사하면 기본값을 바꿀 수 있습니다. 실제 `.env`는 Git과 Docker 빌드에서 제외됩니다.

- `APP_PORT`: 앱 포트, 기본 `3000`
- `POSTGRES_PORT`: 호스트에서 DB에 접속할 포트, 기본 `55432`
- `SEED_ADMIN_*` / `SEED_EMPLOYEE_*`: 처음 생성할 로그인 계정
- `POSTGRES_*`: 로컬 DB 설정
- `SESSION_SECRET`: 세션 서명값

이미 생성된 DB·계정의 비밀번호는 `.env` 변경만으로 바뀌지 않습니다. Compose의 앱은 내부 DB에 접속하며, `DATABASE_URL`은 아래 직접 개발 방식에서 사용합니다.

## Docker가 없는 환경

**Node.js 20과 PostgreSQL 15를 직접 설치하고 PostgreSQL을 실행합니다.** 이 방식은 `.env`에 DB 접속 정보를 설정해야 합니다.

### 1. 빈 DB 준비

PostgreSQL 관리자 계정으로 접속해 다음 SQL을 실행합니다. 이미 사용할 DB와 계정이 있다면 생략합니다.

```sql
CREATE USER portal WITH PASSWORD 'portal-local-db-password';
CREATE DATABASE employee_portal OWNER portal;
```

### 2. 환경 설정

프로젝트 루트의 `.env.example`을 `.env`로 복사하고 `DATABASE_URL`을 준비한 DB에 맞춥니다. PostgreSQL 기본 포트 `5432`와 위 계정을 사용한다면 다음과 같습니다.

```dotenv
DATABASE_URL="postgresql://portal:portal-local-db-password@localhost:5432/employee_portal?schema=public"
```

직접 실행할 때 DB 접속에는 `DATABASE_URL`을 사용합니다. `.env.example`의 기본 포트 `55432`는 Docker용이므로 확인해 주세요. 나머지 설정은 로컬 리뷰용 기본값을 사용할 수 있습니다.

### 3. 앱 실행

```bash
npm ci
npm run dev
```

테이블 생성·변경과 초기 데이터 입력을 자동 처리한 뒤 개발 서버를 실행합니다. **http://localhost:3000**에 접속하며, 기본 로그인 계정은 위 Docker 안내와 같습니다. 재실행 시 기존 데이터는 유지됩니다.

DB 접속 정보가 없으면 터미널에 `.env` 설정 안내를 출력하고 실행을 중단합니다. 최초 패키지 설치와 폰트 다운로드에는 인터넷 연결이 필요합니다.

## 실행 스크립트

| 명령 | 동작 |
| --- | --- |
| `npm run db:setup` | Prisma 생성 → 마이그레이션 → 시드 |
| `npm run dev` | DB 준비 → 개발 서버 실행 |
| `npm run build` | 앱 빌드 |
| `npm run start:local` | DB 준비 → 빌드된 앱 실행 |
| `npm start` | 빌드된 앱만 실행 |

외부 검사 API의 기본 제한시간은 GET 1초, POST 2초이며 `.env`에서 변경할 수 있습니다.

## 검증

마이그레이션·시드가 적용된 **별도 테스트 DB**를 설정한 뒤 실행합니다. 통합 테스트는 테스트용 앱 서버도 실행되어 있어야 합니다.

```bash
npm test
npm run test:smoke
npm run lint
npx tsc --noEmit
```
