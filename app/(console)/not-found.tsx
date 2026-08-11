import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConsoleNotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-xl items-center justify-center">
      <Card className="w-full">
        <CardHeader className="border-b">
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <SearchX className="size-5" />
          </div>
          <CardTitle>Page not found</CardTitle>
          <CardDescription>
            This resource may have been removed, or the address is no longer valid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard"><ArrowLeft /> Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
