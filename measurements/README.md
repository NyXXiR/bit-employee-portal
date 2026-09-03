# measurements/ — Background Check API 실측 원본

집계 결과는 [`../MEASUREMENTS.md`](../MEASUREMENTS.md). 이 디렉터리는 그 근거가 된 원본 관측을 그대로 담는다.

## 다시 분석하려면

```bash
npx tsx scripts/analyze-measurements.ts measurements/2026-09-03T15-20-07-345Z
```

인자를 생략하면 가장 최근 실행을 고른다. `raw.ndjson` 한 줄이 관측 1건이라 `jq`로도 바로 다룰 수 있다.

```bash
# 예: 지연 단계 성공 응답의 지연만 뽑기
jq -r 'select(.phase=="latency" and .status==200) | .latencyMs' \
  measurements/2026-09-03T15-20-07-345Z/raw.ndjson | sort -n
```

## 관측 레코드 형태

| 필드 | 뜻 |
|---|---|
| `phase` | `contract` / `duplicate` / `pending` / `latency` / `concurrency` |
| `operation` | 단계 안의 세부 동작 (`GET latency`, `GET poll`, `POST 3` 등) |
| `concurrency` | 그 요청이 나갈 때 의도한 동시 요청 수 |
| `batchIndex` / `indexInBatch` | 지연 단계의 배치 위치. 웜업 효과 분리용 |
| `latencyMs` | 요청 시작부터 본문 수신 완료까지 |
| `status` | HTTP 상태코드. 네트워크 오류·타임아웃이면 `null`이고 `error`에 사유 |
| `retryAfter` | `Retry-After` **헤더** 값. 이 API에서는 전부 `null`이었다 |
| `headers` | 200/201이 아닌 응답의 전체 헤더. 503 출처 구분에 쓴다 |
| `body` | 파싱된 응답 본문 (파싱 실패 시 원문 문자열) |

---

## 2026-09-03T15-20-07-345Z — 본 실측 (관측 1,964건)

`MEASUREMENTS.md`가 인용하는 실행. 2026-09-03 15:20~17:18 UTC.

| 단계 | n | 조건 |
|---|---:|---|
| `contract` | 8 | 명세 대조 프로브. 각 1회 |
| `duplicate` | 7 | 같은 employeeId로 POST 6회 + 목록 조회 1회 |
| `pending` | 149 | POST 40건(간격 250ms) 후 2초 주기 폴링, 상한 240초 |
| `latency` | **1,000** | **단일 순차 요청.** 50건씩 20배치, 배치 간 90초 |
| `concurrency` | 487 | 레벨 1/5/10/20 |

### 이 데이터를 쓸 때 반드시 알아야 할 것

**1. 두 단계가 시간상 겹쳤다. 양방향으로 오염돼 있다.**

지연 단계를 800건에서 중단시키려 했으나 프로세스가 죽지 않고 배치 20개를 끝까지 돌았고, 그 사이 동시성 단계를 별도 프로세스로 이어붙였다. 겹친 구간은 `2026-09-03T16:51:08Z` 이후다.

- **`phase:"concurrency"` + `concurrency:1` 인 187건은 쓰지 말 것.** 187건 중 100건이 지연 단계와 겹쳐 나갔다. 오류율이 69.5%로 부풀어 있다(깨끗한 87건만 봐도 71.3%). **동시성 1의 기준선은 `phase:"latency"`를 쓴다.**
- **`phase:"latency"` 의 `batchIndex` 16~19(200건)도 순수 단일 순차 요청이 아니다.** 동시성 단계와 겹친다. 엄밀히 하려면 `batchIndex <= 15`인 800건만 쓴다.

겹친 200건을 빼도 결론은 같다(`MEASUREMENTS.md` 1절 끝의 대조표). p50 43.5 vs 42.6ms, 200 응답 비율 37.8% vs 37.3%, 1.2초 공백은 양쪽 모두 존재.

```bash
# 겹치지 않는 지연 표본만
jq -c 'select(.phase=="latency" and .batchIndex<=15)'   measurements/2026-09-03T15-20-07-345Z/raw.ndjson
```

**2. 지연 분위수는 상태코드로 나눠서 볼 것.**
오류 응답은 30ms대에 즉시 돌아오고(500, Lambda 503), 게이트웨이 503은 30초를 다 태운다. 둘을 섞으면 p95·p99가 전부 30,000ms에 붙어 분포가 아니라 게이트웨이 타임아웃을 재게 된다.

**3. 503은 본문으로 출처를 갈라야 한다.**
본문에 `retryAfter` 필드가 있으면 1초 안에 돌아온 것(303건, p50 32.8ms), `{"message":"Service Unavailable"}` 뿐이면 30초 벽에 걸린 것(206건, p50 30,013.6ms). 두 무리는 지연이 전혀 겹치지 않는다.

**헤더로는 구분할 수 없다.** 두 형태의 헤더 키 집합이 동일하다(`apigw-requestid`/`connection`/`content-length`/`content-type`/`date`). 앞서 `apigw-requestid` 유무로 갈린다고 적었던 것은 오류다.

**4. `pending` 단계는 n=40이라 꼬리를 신뢰할 수 없다.**
몸통(중앙값)만 쓰고, 꼬리는 아래 별도 실측을 참조한다.

**5. 이 실행에서 `flagged`는 한 건도 나오지 않았다.** 판정 비율은 측정되지 않았다.

### 파일

| 파일 | 내용 |
|---|---|
| `raw.ndjson` | 관측 1,964건 전량 |
| `report.txt` | `analyze-measurements.ts` 출력 저장본 |
| `index.json` | 단계·동작별 건수와 관측 구간 |
| `summary-resume-concurrency.json` | 이어붙인 동시성 단계의 스크립트 자체 요약 |

> `summary.json`은 없다. 지연 표본 800건 시점에 수집을 중단했기 때문에 스크립트가 최종 요약을 쓰지 못했다(결과적으로 1,000건까지 채워졌다). 그래서 집계는 `raw.ndjson`에서 다시 계산하도록 만들었고, `analyze-measurements.ts`는 `summary.json` 없이 동작한다.

---

## validate-2026-09-03T17-43-19-771Z — 정책 검증 (100회)

`MEASUREMENTS.md` 7-1절. 정한 정책(GET 타임아웃 1초 · 최대 4회 · 간격 500ms)을 그대로 100회 돌려 예측과 대조한 실행. GET만 사용하므로 외부 쓰기 없음.

`trials.ndjson` 한 줄이 1회차이고, `attempts` 배열에 그 회차의 개별 시도가 들어 있다.

```bash
# 예: 시도 횟수별 성공 분포
jq -r 'select(.succeeded) | .attemptsUsed'   measurements/validate-2026-09-03T17-43-19-771Z/trials.ndjson | sort -n | uniq -c
```

결과: 1회 성공률 25.0%(예측 25.3%), 4회 누적 68.0%(예측 68.9%) — 둘 다 신뢰구간 안. 벽시계만 예측 2,680ms보다 빠른 1,252.8ms였고, 이는 API가 아니라 조건부/무조건부 기댓값을 혼동한 계산 오류였다.

**재실행하면 수치가 달라진다.** 오류 주입이 확률적이라 100회로는 ±10%p 폭이 있다.

---

## 2026-09-03T15-17-21-268Z — 스크립트 점검용 소표본

본 수집 전에 스크립트가 도는지 확인한 실행. 표본이 한 자릿수라 **수치 근거로 쓰지 말 것.**

다만 하나 기록해 둘 가치가 있다: 이 실행에서 없는 checkId 조회가 **500**을 반환했는데, 본 실측에서는 같은 요청이 명세대로 **404**를 반환했다. **주입된 500이 진짜 404를 가린다**는 뜻이고, "500을 받았다"를 대상 없음으로 해석하면 안 되는 근거다.

## 2026-09-03-recovered — 유실된 초기 실행에서 건진 일부

초기 실행의 원본이 유실되고 중복 POST 이력만 남은 것. `duplicate-post-history.json` 한 건이며, 같은 employeeId로 POST 5회에 서로 다른 checkId 5개가 생겼다는 관측이다(본 실측의 6회 결과와 일치).

이 유실 때문에 수집기를 **관측 즉시 NDJSON append** 방식으로 바꿨다. 중간에 죽어도 앞선 표본이 남는다.

---

## 다른 조건의 실측 (이 디렉터리 밖)

`src/lib/polling.ts`의 주석은 **동시성 5 고정, pending 시작 n=409** 실측을 인용한다. 서버 처리시간 p50 19.5초 · p95 88.0초, 120초 내 완료 관측 93.64% · 180초 내 97.80%.

여기 `pending` 단계(동시성 1, n=40)와 **측정 조건이 다르므로 직접 비교하면 안 된다.** 몸통은 서로 어긋나지 않는다(중앙값 15.3초 vs 19.5초). 표본이 10배이므로 **꼬리와 폴링 종료 시각(180초)은 그쪽 값을 채택**했다.
