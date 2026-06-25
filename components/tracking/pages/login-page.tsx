"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

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
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-svh bg-[#f4f5f7] text-foreground">
      <div className="grid min-h-svh w-full lg:grid-cols-[minmax(0,1fr)_minmax(560px,0.72fr)]">
        <section className="relative hidden min-h-svh overflow-hidden bg-[#0b0432] text-white lg:block">
          <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className="absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.035] blur-3xl" />
          <div className="relative min-h-svh p-10">
            <div className="flex items-center gap-3">
              <Image
                src="/company-logo.png"
                alt="LimGrow logo"
                width={46}
                height={46}
                priority
                className="size-11 rounded-lg object-cover ring-1 ring-white/15"
              />
              <div>
                <div className="font-heading text-base font-semibold">LimGrow Tracking</div>
                <div className="text-xs text-white/60">Private workspace</div>
              </div>
            </div>

            <div className="absolute inset-x-10 top-1/2 flex -translate-y-1/2 justify-center">
              <div className="relative flex aspect-square w-full max-w-[460px] items-center justify-center">
                <div className="absolute inset-0 rounded-[48px] border border-white/10 bg-white/[0.035] shadow-[0_30px_120px_rgb(0_0_0/0.28)]" />
                <div className="absolute inset-12 rounded-[36px] border border-white/10" />
                <div className="absolute inset-24 rounded-[28px] border border-white/10 bg-white/[0.035]" />
                <Image
                  src="/company-logo.png"
                  alt="LimGrow logo"
                  width={128}
                  height={128}
                  priority
                  className="relative size-32 rounded-[30px] object-cover shadow-2xl ring-1 ring-white/20"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-svh items-center justify-center px-4 py-8 sm:px-8">
          <Card className="w-full max-w-[500px] rounded-lg bg-background shadow-sm">
            <CardHeader className="border-b pb-5">
              <div className="mb-3 flex items-center gap-3 lg:hidden">
                <Image
                  src="/company-logo.png"
                  alt="LimGrow logo"
                  width={40}
                  height={40}
                  priority
                  className="size-10 rounded-lg object-cover ring-1 ring-primary/10"
                />
                <div>
                  <div className="font-heading text-sm font-semibold">LimGrow Tracking</div>
                  <div className="text-xs text-muted-foreground">Private workspace</div>
                </div>
              </div>
              <Badge variant="outline" className="mb-2 w-fit rounded-md text-muted-foreground">
                <ShieldCheck size={13} />
                Team access
              </Badge>
              <CardTitle className="text-2xl">Welcome back</CardTitle>
              <CardDescription>Sign in with your LimGrow account.</CardDescription>
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
                      className="h-10 pl-9"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      placeholder="name@company.com"
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
                      className="h-10 pl-9"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      placeholder="Enter password"
                      required
                    />
                  </div>
                </div>

                <Button className="h-10 w-full" disabled={pending}>
                  {pending ? <Spinner /> : <ArrowRight size={15} />}
                  Sign in
                </Button>
              </form>
              <div className="mt-5 flex items-start gap-2 border-t pt-4 text-xs leading-5 text-muted-foreground">
                <LockKeyhole size={14} className="mt-0.5 shrink-0" />
                <span>Your session is created only after account verification succeeds.</span>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
