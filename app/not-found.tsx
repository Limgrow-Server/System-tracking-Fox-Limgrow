import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="border-b">
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <SearchX className="size-5" />
          </div>
          <CardTitle>Page not found</CardTitle>
          <CardDescription>The requested LimGrow Tracking page does not exist.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/"><ArrowLeft /> Return to the console</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
