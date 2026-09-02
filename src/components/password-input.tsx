"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/*
 * 가림/보임을 전환할 수 있는 비밀번호 입력.
 *
 * 관리자가 남의 초기 비밀번호를 대신 정하는 자리에서는 특히 필요하다. 본인
 * 비밀번호와 달리 외워서 치는 값이 아니라, 잘못 쳐도 알아챌 방법이 없고
 * 틀린 값은 그대로 직원에게 전달되어 로그인 실패로 돌아온다.
 *
 * 보임 상태에서도 autoComplete는 그대로 둔다. 표시 방식만 바뀔 뿐 이 값이
 * 비밀번호라는 사실은 변하지 않는다.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        // 보임 상태에서 브라우저가 오타를 고치거나 첫 글자를 대문자로 바꾸면
        // 입력한 것과 저장되는 것이 달라진다.
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={cn("pr-9", className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={visible ? "비밀번호 가리기" : "비밀번호 보기"}
        aria-pressed={visible}
        className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
        onClick={() => setVisible((on) => !on)}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    </div>
  );
}
