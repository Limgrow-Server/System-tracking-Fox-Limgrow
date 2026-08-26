export type EventAnalyticsSummary = {
  completedEvents: number;
  failedEvents: number;
  inFlightEvents: number;
  last30Minutes: number;
  pendingEvents: number;
  previousRetentionEvents: number;
  previousTotalEvents: number;
  previousUniqueUsers: number;
  purchaseEvents: number;
  retentionEvents: number;
  returningUsers: number;
  totalEvents: number;
  uniqueUsers: number;
};

export type EventAnalyticsCatalogRow = {
  completedCount: number;
  eventCount: number;
  eventName: string;
  failedCount: number;
  lastReceivedAt: string;
  pendingCount: number;
  uniqueUsers: number;
};

export type EventAnalyticsTrendPoint = {
  count: number;
  date: string;
  eventName: string;
};

export type EventAnalyticsBreakdown = {
  count: number;
  status: string;
};

export type EventAnalyticsDestinationBreakdown = EventAnalyticsBreakdown & {
  destination: string;
};

export type EventAnalyticsDelivery = {
  attemptCount: number;
  deliveredAt: string | null;
  destination: string;
  lastError: string | null;
  responseCode: number | null;
  status: string;
};

export type EventAnalyticsRecentEvent = {
  attemptCount: number;
  createdAt: string;
  deliveries: EventAnalyticsDelivery[];
  eventName: string;
  id: string;
  isReturningOpen: boolean;
  kind: "purchase" | "user";
  lastError: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  processedAt: string | null;
  status: string;
  userId: string | null;
};

export type EventAnalyticsData = {
  appId: string;
  destinationBreakdown: EventAnalyticsDestinationBreakdown[];
  eventCatalog: EventAnalyticsCatalogRow[];
  generatedAt: string;
  platform: "android" | "ios";
  range: {
    days: number;
    end: string;
    start: string;
  };
  recentEvents: EventAnalyticsRecentEvent[];
  selectedEvent: string | null;
  statusBreakdown: EventAnalyticsBreakdown[];
  summary: EventAnalyticsSummary;
  trend: EventAnalyticsTrendPoint[];
};
