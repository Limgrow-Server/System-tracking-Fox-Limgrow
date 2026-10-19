"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DeliveryLineChartBucket = {
  failed: number;
  impressions: number;
  key: string;
  label: string;
  opened: number;
  rate: number;
  received: number;
  requested: number;
  sent: number;
};

type DeliveryLineChartMetric = {
  key: keyof Omit<DeliveryLineChartBucket, "key" | "label">;
  label: string;
  stroke: string;
};

export type DeliveryLineChartProps = {
  buckets: DeliveryLineChartBucket[];
  metrics: DeliveryLineChartMetric[];
};

export type HistoryJobBarDatum = {
  color: string;
  label: string;
  percent: number;
  value: number;
};

export type HistoryJobBarChartProps = {
  bars: HistoryJobBarDatum[];
  maxBarValue: number;
};

function numberLabel(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);
}

export function DeliveryLineChart({
  buckets,
  metrics,
}: DeliveryLineChartProps) {
  const metricLabels = new Map<string, string>(
    metrics.map((metric) => [metric.key, metric.label]),
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={buckets} margin={{ bottom: 4, left: 0, right: 12, top: 12 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 6" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          minTickGap={22}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickFormatter={(value) => numberLabel(Number(value))}
          tickLine={false}
          width={44}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            boxShadow: "0 12px 30px rgb(15 23 42 / 0.12)",
            fontSize: "12px",
          }}
          formatter={(value, name) => [
            numberLabel(Number(value)),
            metricLabels.get(String(name)) ?? String(name),
          ]}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
        />
        <Legend
          formatter={(value) => metricLabels.get(String(value)) ?? String(value)}
          iconType="circle"
          wrapperStyle={{ fontSize: "12px", paddingTop: "6px" }}
        />
        {metrics.map((metric) => (
          <Area
            activeDot={{ r: 4 }}
            dataKey={metric.key}
            dot={false}
            fill={metric.stroke}
            fillOpacity={metric.key === "sent" ? 0.16 : 0.06}
            key={metric.key}
            name={metric.key}
            stroke={metric.stroke}
            strokeWidth={metric.key === "sent" ? 3 : 2}
            type="monotone"
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HistoryJobBarChart({
  bars,
  maxBarValue,
}: HistoryJobBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={bars}
        barCategoryGap="30%"
        margin={{ bottom: 6, left: 2, right: 14, top: 18 }}
      >
        <CartesianGrid stroke="#9ca3af" strokeDasharray="4 6" vertical={false} />
        <XAxis
          axisLine={{ stroke: "#6b7280", strokeWidth: 2 }}
          dataKey="label"
          interval={0}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          domain={[0, maxBarValue]}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          tickCount={6}
          tickFormatter={(value) => numberLabel(Number(value))}
          tickLine={false}
          width={52}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            boxShadow: "0 12px 30px rgb(15 23 42 / 0.12)",
            fontSize: "12px",
          }}
          formatter={(value, name, item) => [
            `${numberLabel(Number(value))} (${item.payload.percent}%)`,
            name === "value" ? "Count" : String(name),
          ]}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
        />
        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
          {bars.map((item) => (
            <Cell key={item.label} fill={item.color} opacity={0.92} />
          ))}
          <LabelList
            dataKey="value"
            formatter={(value: unknown) => numberLabel(Number(value))}
            position="top"
            style={{
              fill: "hsl(var(--foreground))",
              fontFamily: "monospace",
              fontSize: 13,
              fontWeight: 600,
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
