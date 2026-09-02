"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, UserRoundXIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function TerminateButton({
  employeeId,
  fullName,
}: {
  employeeId: string;
  fullName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function terminate() {
    setPending(true);
    const response = await fetch(
      `/api/admin/employees/${encodeURIComponent(employeeId)}/terminate`,
      { method: "POST" },
    );
    const body = await response.json();
    setPending(false);
    if (!response.ok) {
      // 다이얼로그를 닫지 않는다. 실패 이유를 본 자리에서 다시 시도할 수 있어야 한다.
      toast.error(body.message ?? "퇴사 처리하지 못했습니다.");
      return;
    }
    setOpen(false);
    toast.success(`${fullName} 직원을 퇴사 처리했습니다.`);
    router.refresh();
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">
          <UserRoundXIcon />
          퇴사 처리
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{fullName} 직원을 퇴사 처리할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            처리 즉시 이 직원의 기존 로그인 세션이 폐기되고, 이후의 모든 조회와 수정 요청이
            거부됩니다. 직원 기록 자체는 삭제되지 않습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive-solid"
            disabled={pending}
            // 요청이 끝나기 전에 다이얼로그가 닫히면 실패를 알릴 자리가 없어진다.
            onClick={(event) => {
              event.preventDefault();
              terminate();
            }}
          >
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            {pending ? "처리 중…" : "퇴사 처리"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
