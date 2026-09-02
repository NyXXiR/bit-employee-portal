import { HomeLinkButton, StatusScreen } from "@/components/status-screen";

/**
 * notFound() 호출과 매칭되지 않은 모든 URL을 함께 받는다.
 */
export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      title="페이지를 찾을 수 없습니다"
      description="주소가 바뀌었거나 삭제된 화면입니다."
      actions={<HomeLinkButton />}
    />
  );
}
