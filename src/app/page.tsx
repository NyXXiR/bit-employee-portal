import { redirect } from "next/navigation";

import { loginRedirectPath } from "@/lib/auth-redirect";
import { getCurrentSession } from "@/server/auth";

export default async function Home() {
  const session = await getCurrentSession();
  if (!session) redirect(await loginRedirectPath());
  redirect(session.role === "ADMIN" ? "/admin" : "/portal");
}
