"use client";

import Link, { useLinkStatus } from "next/link";
import { type ComponentProps } from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type PendingNavigationLinkProps = ComponentProps<typeof Link> & {
  spinnerClassName?: string;
};

function PendingLinkSpinner({ className }: { className?: string }) {
  const { pending } = useLinkStatus();

  return pending ? <Spinner className={cn("ml-1.5 size-3.5", className)} /> : null;
}

export function PendingNavigationLink({
  children,
  className,
  spinnerClassName,
  ...props
}: PendingNavigationLinkProps) {
  return (
    <Link
      {...props}
      className={cn("inline-flex items-center", className)}
    >
      {children}
      <PendingLinkSpinner className={spinnerClassName} />
    </Link>
  );
}
