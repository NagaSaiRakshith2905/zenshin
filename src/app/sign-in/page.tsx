import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Logo } from "@/components/brand/logo";
import { SignIn } from "@/features/settings/sign-in";
import { authenticateOwner } from "@/server/auth/actors";
import { AccessError } from "@/server/auth/access";
import { ownerUserId } from "@/server/auth/owner";
import { getDatabase } from "@/server/db";
import { user } from "@/server/db/schema";
import { getAuthEnv } from "@/server/env";

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  let authenticated = false;
  try { await authenticateOwner(await headers()); authenticated = true; }
  catch (error) { if (!(error instanceof AccessError)) throw error; }
  if (authenticated) redirect("/");
  const [existing] = await getDatabase().select({ id: user.id }).from(user).where(eq(user.id, ownerUserId(getAuthEnv().OWNER_GITHUB_ID))).limit(1);
  return <main className="flex min-h-dvh items-center justify-center bg-sidebar p-6">
    <section className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border bg-background p-8 shadow-sm">
      <Logo className="size-12" />
      <div className="flex flex-col gap-2"><h1 className="text-[22px] leading-[30px] font-semibold">Sign in to Zenshin</h1><p className="text-sm text-muted-foreground">A private workspace for planning and tracking development.</p></div>
      <SignIn provisioning={!existing} failed={Boolean((await searchParams).error)} />
      <p className="text-xs text-muted-foreground">Access is limited to the owner’s GitHub account.</p>
    </section>
  </main>;
}
