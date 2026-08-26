"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConsoleError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-xl items-center justify-center">
      <Card className="w-full">
        <CardHeader className="border-b">
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <TriangleAlert className="size-5" />
          </div>
          <CardTitle>Unable to load this page</CardTitle>
          <CardDescription>
            The request failed before the page could finish loading. Retry the request or return later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => unstable_retry()}>
            <RefreshCw /> Retry
          </Button>
          {error.digest ? (
            <p className="mt-3 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
