/*
 * 날짜 표시는 항상 Asia/Seoul로 고정한다.
 *
 * 서버와 브라우저의 시간대가 다르면 같은 값이 서로 다른 문자열로 렌더링되어
 * 하이드레이션 불일치가 난다. 사내 포털의 기준 시간대는 하나이므로
 * 뷰어의 로컬 시간대를 따르지 않고 명시적으로 고정하는 편이 정확하다.
 */
const TIME_ZONE = "Asia/Seoul";

const dateTimeFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long",
  timeZone: TIME_ZONE,
});

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateTimeFormat.format(date);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return null;
  // "1994-03-05" 같은 날짜만 있는 값은 UTC 자정으로 해석되므로 시간대를 옮기면
  // 하루가 밀린다. 문자열 형태를 그대로 신뢰해 파싱한다.
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00+09:00`)
      : value instanceof Date
        ? value
        : new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}
