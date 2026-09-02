"use client";

import { useState } from "react";
import { UserPlusIcon } from "lucide-react";

import { CreateEmployeeForm } from "@/components/create-employee-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/*
 * 계정 생성을 목록 화면에서 떼어낸다.
 *
 * 목록을 훑는 것이 이 화면의 주 업무이고 계정 생성은 가끔 하는 일인데,
 * 둘이 같은 스크롤에 있으면 직원이 늘수록 생성 폼이 화면 밖으로 밀린다.
 * 라우트를 하나 더 만드는 대신 다이얼로그로 띄워 목록의 맥락을 유지한다.
 */
export function CreateEmployeeDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon />
          직원 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>새 직원 계정</DialogTitle>
          <DialogDescription>
            생년월일은 비워 둘 수 있으며, 직원이 로그인 후 직접 보완합니다.
          </DialogDescription>
        </DialogHeader>
        <CreateEmployeeForm onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
