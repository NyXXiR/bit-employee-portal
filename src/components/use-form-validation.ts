"use client";

import { useState, type FocusEvent } from "react";
import type { ZodType } from "zod";

/** 서버와 같은 스키마를 사용해 입력칸별 오류를 표시한다. 입력 중에는 문자를 제거하지 않는다. */
export function useFormValidation<T>(schema: ZodType<T>) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  function validate(input: unknown, form?: HTMLFormElement): T | null {
    const result = schema.safeParse(input);
    if (result.success) { setErrors({}); return result.data; }
    const next: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      next[key] ??= issue.message;
    }
    setErrors(next);
    const target = form?.elements.namedItem(Object.keys(next)[0]);
    if (target instanceof HTMLElement) target.focus();
    return null;
  }
  function fieldProps(name: string, id = name) {
    return {
      "aria-invalid": Boolean(errors[name]),
      "aria-describedby": errors[name] ? `${id}-error` : undefined,
      onBlur(event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
        const form = event.currentTarget.form;
        if (!form) return;
        const values: Record<string, unknown> = Object.fromEntries(new FormData(form));
        if (values.dateOfBirth === "") values.dateOfBirth = null;
        const result = schema.safeParse(values);
        const message = result.success ? undefined : result.error.issues.find((issue) => issue.path[0] === name)?.message;
        setErrors((current) => {
          const next = { ...current };
          if (message) next[name] = message; else delete next[name];
          return next;
        });
      },
    };
  }
  return { errors, validate, fieldProps, clear: () => setErrors({}) };
}
