import Link from "next/link";
import {
  Activity,
  BellRing,
  CheckCircle2,
  ChartSpline,
  Clock3,
  CreditCard,
  Database,
  ListChecks,
  Settings2,
  Smartphone,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/tracking/primitives";
import type { DashboardPageData } from "@/lib/server/page-loaders/dashboard/dashboard.loader";
import type { StaffRole } from "@/lib/tracking/types";

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DashboardPage({
  data,
  role,
}: {
  data: DashboardPageData;
  role: StaffRole;
}) {
  const twoHour = data.analytics?.twoHourConversion;
  const confirmedPaid = twoHour?.confirmedPaidCount ?? 0;
  const conversionRate =
    twoHour?.maturedConversionRate ?? twoHour?.conversionRate ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Operations dashboard"
        description="Monitor incoming event definitions, IAP verification, conversion and system readiness from one place."
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" />
            Updated {dateTime(data.fetchedAt)}
          </div>
        }
      />

      {data.errors.length ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <TriangleAlert />
          <AlertTitle>
            Some dashboard data is temporarily unavailable
          </AlertTitle>
          <AlertDescription>{data.errors.join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      <section
        aria-label="Key metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Tracked applications"
          value={compactNumber(data.appCount)}
          detail="Android and iOS IAP apps"
          icon={Smartphone}
          trend={data.appCount > 0 ? "up" : "flat"}
        />
        <StatCard
          label="New event definitions"
          value={compactNumber(data.pendingEventCount)}
          detail={`${compactNumber(data.pendingEventPayloadCount)} payloads retained until catalog acceptance`}
          icon={ListChecks}
          trend={data.pendingEventCount > 0 ? "down" : "flat"}
        />
        <StatCard
          label="Verified free trials"
          value={compactNumber(
            twoHour?.trialCohortCount ?? twoHour?.sentAfterTwoHoursCount ?? 0,
          )}
          detail={`${compactNumber(twoHour?.pendingVerificationCount ?? 0)} waiting for 3-day verification`}
          icon={Activity}
          trend={
            (twoHour?.trialCohortCount ?? twoHour?.sentAfterTwoHoursCount)
              ? "up"
              : "flat"
          }
        />
        <StatCard
          label="Confirmed paid"
          value={compactNumber(confirmedPaid)}
          detail={`${conversionRate.toFixed(1)}% matured conversion rate`}
          icon={CreditCard}
          trend={confirmedPaid > 0 ? "up" : "flat"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.7fr)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Incoming event catalog</CardTitle>
            <CardDescription>
              New event names waiting to be accepted into each app catalog.
            </CardDescription>
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link href="/events">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Event</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="pr-4 text-right">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentPendingEvents.length ? (
                  data.recentPendingEvents.map((event) => (
                    <TableRow
                      key={`${event.appId}:${event.platform}:${event.kind}:${event.eventName}`}
                    >
                      <TableCell className="pl-4">
                        <div className="font-medium">{event.eventName}</div>
                        <div className="text-xs text-muted-foreground">
                          {event.kind} · {event.pendingCount} payload
                        </div>
                      </TableCell>
                      <TableCell className="max-w-52 truncate font-mono text-xs">
                        {event.appId}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {event.platform}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-right text-xs text-muted-foreground">
                        {dateTime(event.lastReceivedAt)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-28 text-center text-muted-foreground"
                    >
                      No new event definitions are waiting for acceptance.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>System readiness</CardTitle>
              <CardDescription>
                API and primary PostgreSQL connectivity.
              </CardDescription>
              <CardAction>
                <StatusBadge
                  status={
                    data.systemStatus === "ready" ? "healthy" : "critical"
                  }
                />
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-2">
                  <Database className="size-4 text-muted-foreground" />
                  <span className="font-medium">Backend and database</span>
                </div>
                {data.systemStatus === "ready" ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <TriangleAlert className="size-4 text-rose-600" />
                )}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Readiness verifies that the API can query the primary PostgreSQL
                database.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>
                Open the most common operational tasks.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button asChild variant="outline" className="justify-start">
                <Link href="/events">
                  <ListChecks /> Review incoming event catalog
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/analytics/events">
                  <ChartSpline /> View event analytics
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/iap/conversions">
                  <CreditCard /> View trial conversion
                </Link>
              </Button>
              {role === "Admin" ? (
                <>
                  <Button asChild variant="outline" className="justify-start">
                    <Link href="/configs/events">
                      <Settings2 /> Configure event catalog & GA4
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="justify-start">
                    <Link href="/configs/notifications">
                      <BellRing /> Configure Firebase topics
                    </Link>
                  </Button>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
