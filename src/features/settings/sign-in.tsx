"use client";
import { useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "./auth-client";

export function SignIn({ provisioning, failed }: { provisioning: boolean; failed: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(failed);
  async function signIn() {
    setPending(true);
    setError(false);
    try {
      const result = await authClient.signIn.social({ provider: "github", callbackURL: "/", errorCallbackURL: "/sign-in?error=authentication_failed", requestSignUp: provisioning });
      if (result.error) { setError(true); setPending(false); }
    } catch { setError(true); setPending(false); }
  }
  return <div className="flex flex-col gap-4">
    <Button onClick={signIn} disabled={pending} className="w-full"><LogIn data-icon="inline-start" />{pending ? "Connecting to GitHub…" : "Continue with GitHub"}</Button>
    {error && <p role="alert" className="text-sm text-muted-foreground">Sign-in failed. Use the configured owner GitHub account and try again.</p>}
  </div>;
}
