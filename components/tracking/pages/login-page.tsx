"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function LoginPage({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const safeNext = useMemo(() => (nextPath.startsWith("/") ? nextPath : "/dashboard"), [nextPath]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Login failed.");
      }

      toast.success(payload.message ?? "Signed in.");
      router.replace(safeNext);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-svh bg-muted/30 text-foreground lg:grid-cols-[0.9fr_1.1fr]">
      <section className="hidden border-r bg-sidebar p-8 lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Image
              src="/company-logo.png"
              alt="LimGrow logo"
              width={44}
              height={44}
              priority
              className="size-11 rounded-xl object-cover shadow-sm ring-1 ring-primary/10"
            />
            <div>
              <div className="font-heading text-base font-semibold">LimGrow Tracking</div>
              <div className="text-xs text-muted-foreground">Limgrow mobile operations</div>
            </div>
          </div>
          <div className="mt-12 max-w-md">
            <Badge variant="outline" className="rounded-md">
              <ShieldCheck size={13} />
              Role-based console
            </Badge>
            <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight">
              App Mapping and Credential Config control.
            </h1>
            <div className="mt-5 grid gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <KeyRound size={15} />
                Store keys are isolated in server-side Vault.
              </div>
              <div className="flex items-center gap-2">
                <LockKeyhole size={15} />
                Console access is enforced by Supabase Auth and Prisma RBAC.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-md rounded-lg">
          <CardHeader className="border-b">
            <CardTitle>Sign in</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                  <Input
                    id="email"
                    type="email"
                    className="pl-9"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                  <Input
                    id="password"
                    type="password"
                    className="pl-9"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              <Button className="w-full" disabled={pending}>
                {pending ? <Spinner /> : <ArrowRight size={15} />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
