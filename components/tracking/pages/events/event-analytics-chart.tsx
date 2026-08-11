"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  EventAnalyticsCatalogRow,
  EventAnalyticsTrendPoint,
} from "@/lib/tracking/event-analytics";

const SERIES_COLORS = ["#2563eb", "#0891b2", "#d97706", "#e11d48"];

type ChartRow = {
  date: string;
  fullDate: string;
  total: number;
  [eventName: string]: number | string;
};

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function fullDateLabel(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function buildChartRows({
  catalog,
  end,
  selectedEvent,
  start,
  trend,
}: {
  catalog: EventAnalyticsCatalogRow[];
  end: string;
  selectedEvent: string | null;
  start: string;
  trend: EventAnalyticsTrendPoint[];
}) {
  const eventNames = selectedEvent
    ? [selectedEvent]
    : catalog.slice(0, 4).map((row) => row.eventName);
  const trendByDate = new Map<string, Map<string, number>>();

  for (const point of trend) {
    const events = trendByDate.get(point.date) ?? new Map<string, number>();
    events.set(point.eventName, point.count);
    trendByDate.set(point.date, events);
  }

  const rows: ChartRow[] = [];
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setUTCHours(0, 0, 0, 0);

  while (cursor <= last) {
    const date = cursor.toISOString().slice(0, 10);
    const values = trendByDate.get(date) ?? new Map<string, number>();
    const row: ChartRow = {
      date: dateLabel(date),
      fullDate: fullDateLabel(date),
      total: Array.from(values.values()).reduce((sum, value) => sum + value, 0),
    };
    for (const eventName of eventNames)
      row[eventName] = values.get(eventName) ?? 0;
    rows.push(row);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { eventNames, rows };
}

function EventTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    color?: string;
    dataKey?: string;
    name?: string;
    payload?: ChartRow;
    value?: number;
  }>;
}) {
  if (!active || !payload?.length || !payload[0]?.payload) return null;
  const row = payload[0].payload;

  return (
    <div className="min-w-52 rounded-lg border bg-background p-3 text-xs shadow-xl">
      <p className="font-semibold text-foreground">{row.fullDate}</p>
      <div className="mt-2 space-y-1.5">
        {payload.map((item) => (
          <div
            key={`${item.dataKey ?? "series"}-${item.name ?? "unnamed"}`}
            className="flex items-center justify-between gap-5"
          >
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {Number(item.value || 0).toLocaleString("vi-VN")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EventAnalyticsChart({
  catalog,
  end,
  selectedEvent,
  start,
  trend,
}: {
  catalog: EventAnalyticsCatalogRow[];
  end: string;
  selectedEvent: string | null;
  start: string;
  trend: EventAnalyticsTrendPoint[];
}) {
  const chart = useMemo(
    () => buildChartRows({ catalog, end, selectedEvent, start, trend }),
    [catalog, end, selectedEvent, start, trend],
  );

  return (
    <div className="h-[21rem] w-full">
      <ResponsiveContainer height="100%" width="100%">
        <ComposedChart
          data={chart.rows}
          margin={{ bottom: 0, left: 0, right: 12, top: 12 }}
        >
          <defs>
            <linearGradient id="eventTotalFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.24} />
              <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="hsl(var(--border))"
            strokeDasharray="4 6"
            vertical={false}
          />
          <XAxis
            axisLine={false}
            dataKey="date"
            interval="preserveStartEnd"
            minTickGap={26}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(value) => compactNumber(Number(value))}
            tickLine={false}
            width={42}
          />
          <Tooltip
            content={<EventTooltip />}
            cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
          />
          {selectedEvent ? null : (
            <Area
              dataKey="total"
              dot={false}
              fill="url(#eventTotalFill)"
              name="Tổng"
              stroke="#60a5fa"
              strokeDasharray="3 4"
              strokeWidth={2}
              type="monotone"
            />
          )}
          {chart.eventNames.map((eventName, index) => (
            <Line
              activeDot={{ r: 4 }}
              dataKey={eventName}
              dot={false}
              key={eventName}
              name={eventName}
              stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
              strokeWidth={2.5}
              type="monotone"
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
