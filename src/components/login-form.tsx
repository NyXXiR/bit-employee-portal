"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";

import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        loginId: form.get("loginId"),
        password: form.get("password"),
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.message ?? "로그인하지 못했습니다.");
      setPending(false);
      return;
    }
    // 성공 시 pending을 풀지 않는다. 이동이 끝날 때까지 버튼을 잠가 중복 제출을 막는다.
    router.replace(body.role === "ADMIN" ? "/admin" : "/portal");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormField id="loginId" label="아이디" required>
        <Input id="loginId" name="loginId" autoComplete="username" required autoFocus />
      </FormField>

      <FormField id="password" label="비밀번호" required>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </FormField>

      <FormError message={error} />

      <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : null}
        {pending ? "확인 중…" : "로그인"}
      </Button>
    </form>
  );
}
