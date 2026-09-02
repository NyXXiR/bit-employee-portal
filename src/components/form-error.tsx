import { OctagonXIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** 폼 제출 실패를 알린다. role="alert"는 Alert가 이미 가지고 있다. */
export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <OctagonXIcon />
      <AlertTitle>처리하지 못했습니다</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
