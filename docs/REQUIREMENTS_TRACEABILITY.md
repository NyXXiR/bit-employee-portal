# 요구사항 대조표

2026-09-03 현재 상태를 기준으로 한다. `검증`은 자동 테스트 또는 DB 확인까지 끝났다는 뜻이며,
`구현`은 코드가 있으나 외부 환경 검증이 남았다는 뜻이다. 화면은 별도 작업 중이므로 이 표의
검증 근거는 백엔드 계약을 중심으로 기록한다.

| 원문 요구사항 | 구현 위치 또는 정책 | 상태 | 검증 근거 / 남은 작업 |
|---|---|---|---|
| 로그인 UI | `/login`, `/api/auth/login` | 백엔드 검증 | DB 세션 쿠키 발급 및 관리자·직원 로그인 스모크 테스트 |
| 직원 본인 정보 조회 | `/portal`, `/api/portal/profile` | 검증 | 직원 계정으로 `EMP-001`만 반환하는지 확인 |
| 직원 본인 정보 수정 | `updateEmployeeProfile` | 검증 | 본인 수정 `200`, 변경 이력 생성, 타인 식별자를 받지 않는 API 구조 확인 |
| 관리자 직원 생성 | `/api/admin/employees` | 검증 | DB sequence 사번 발급, 로그인 아이디 생성 응답·관리자 상세 노출, 실제 로그인 확인 |
| 전체 직원 목록·상세 | 관리자 Route Handler 및 DAL | 검증 | 관리자 목록에서 시드 10명과 nullable 로그인 아이디 확인, 로그인 아이디 검색 확인 |
| 기존 직원 로그인 계정 발급 | `provisionEmployeeAccount`, `/api/admin/employees/:employeeId/account` | 검증 | 미발급 직원에 관리자 발급 `201`, 실제 로그인 `200`, 중복 발급 `409`, 직원 권한 `403` 확인 |
| 퇴사 처리 | `terminateEmployee` | 검증 | 반복 요청 `200`, 상태 전이 1회만 수행 |
| 퇴사 직원 접근 통제 | 세션 폐기 + 요청별 현재 상태 검사 | 검증 | 퇴사 전 발급한 세션으로 다음 요청 시 `403 EMPLOYEE_TERMINATED` 확인 |
| Background Check 연동 | `background-checks.ts` | 기본 흐름 검증 | 실제 API에서 `PENDING → CLEAR` 1회 확인. 통계·튜닝값 실측은 보류 |
| Background Check 관리자 전용 | 관리자 Route Handler | 검증 | 직원 계정의 관리자 API 접근 `403` 확인 |
| 민감정보 권한 처리 | 관리자 Route Handler에서만 검사 상세 반환 | 검증 | 직원 계정의 검사 API 접근 `403`; 직원 프로필 API에는 검사 필드 없음 |
| 생년월일 누락 데이터 | nullable DB 필드, 프로필 보완, 검사 차단 | 검증 | `EMP-007` 검사 요청 `409 PROFILE_INCOMPLETE` 확인 |
| 지정 시드 10명 | `prisma/seed.ts` | 검증 | DB 직원 10명, 생년월일 누락 1명 확인 |
| 한글 이름과 외부 이름 매핑 | 성·이름 별도 저장, `lastName`·`firstName` 명시 매핑 | 검증 | `남궁/서준 → lastName/firstName` 도메인 계약 테스트 |
| 동일 employeeId 반복 POST 조사 | 측정 스크립트 | 미검증 | 실제 API 측정 실행 필요 |
| GET 지연·상태코드·동시성 조사 | `scripts/measure-background-check.ts` | 미검증 | 호출량 확인 후 실행 및 `MEASUREMENTS.md` 작성 |
| 배포 URL | 단일 Next 프로세스 + Nginx | 미구현 | 서버 배포 및 외부 브라우저 검증 필요 |
| 관리자·직원 제출 계정 | `.env` 기반 시드 | 구현 | 제출용 자격증명 최종 확정 필요 |
| DECISIONS.md | `docs/DECISION_LOG.md` | 작성 중 | 제출 형식과 분량에 맞춰 최종 편집 필요 |
| AI_LOG.md 전체 대화 및 사례 | `AI_LOG.md` | 작성 중 | 전체 문답 원문, 사례 3개, 오류 수정 1개, 어려운 코드 추가 필요 |

## 주요 DB 계약

- `Employee.employeeId`: 유일
- `User.loginId`: 유일
- `User.employeeId`: 유일하며 직원 한 명에 로그인 계정은 최대 하나
- `BackgroundCheck.idempotencyKey`: 유일
- `(BackgroundCheck.employeeRecordId, activeSlot)`: 유일
- 활성 상태만 `activeSlot=ACTIVE`, 최종 상태는 `NULL`이므로 직원별 활성 검사는 하나만 존재
- 퇴사 처리에서 직원 상태 변경과 세션 폐기를 한 트랜잭션으로 수행
- 개인정보 쓰기는 `status=ACTIVE` 조건을 포함해 퇴사와의 경쟁 상태를 방어
- 계정 발급은 재직 중인 미발급 직원에게만 허용하고 프로필 수정과 분리해 감사 기록 생성
- 외부 요청 완료 쓰기는 기존 상태를 조건으로 갱신해 관리자 종결 후 늦은 응답이 상태를 되살리지 못함

## Background Check 명령 계약

- 요청 주체: 관리자만 수동 실행
- 요청 전제: 재직 중이며 생년월일이 확인된 직원
- 동일 멱등 키·동일 직원: 기존 결과 재응답, 외부 POST 재호출 없음
- 동일 멱등 키·다른 직원: `409 IDEMPOTENCY_KEY_REUSED`
- 직원별 진행 중 검사: DB 유일 제약으로 1건만 허용
- 외부 4xx: 확정 실패로 종결, 외부 5xx·네트워크·타임아웃: 결과 불명 `UNKNOWN`
- `UNKNOWN`: 자동 POST 재시도 금지, 관리자가 외부 이력을 확인한 뒤 사유를 남겨 종결 가능
- `PENDING`: 임의 종결 금지, 외부 ID로 조회하여 최종 상태 반영
- 외부 응답의 `employeeId`와 `checkId`: 로컬 명령과 일치할 때만 반영
- 프로필 변경 후 기존 검사: 스냅샷은 불변이며 `profileComparison`으로 현재 정보와의 차이만 제공
- 외부 결과 조회 503: 유효한 `Retry-After`를 내부 응답 헤더와 본문에 전달하고 프론트의 다음 폴링 대기시간에 우선 적용
- 완료 결과: 기본 90일 후 상세 결과 필드 제거 대상

## 세션 거부 계약

- 만료 세션: `401 SESSION_EXPIRED`
- 명시적으로 폐기된 세션: `401 SESSION_REVOKED`
- 퇴사 직원의 기존 세션: `403 EMPLOYEE_TERMINATED`
- 쿠키 없음 또는 알 수 없는 토큰: `401 AUTHENTICATION_REQUIRED`

## 현재 명확한 미완료 범위

1. 외부 Background Check API 실측 및 실측값 기반 재시도·타임아웃 확정
2. 운영 배포와 Nginx 연결
3. 운영 스케줄러에서 보존기간 만료 결과 제거 스크립트 실행 연결
4. UI 통합 검증, 배포, 제출용 문서 최종 작성

## 검증 실행 결과

- 도메인 계약: 9건 통과
- DB 계약: 동시 활성 검사 충돌 방지, 늦은 외부 응답의 종결 상태 덮어쓰기 방지 2건 통과
- API 스모크: 인증·권한·계정 발급 및 로그인·프로필·세션 사유·퇴사·멱등성·검사 스냅샷·불확실 상태 종결·누락 생년월일 29개 관찰값 통과
- TypeScript: 통과
- 백엔드 범위 ESLint: 통과
