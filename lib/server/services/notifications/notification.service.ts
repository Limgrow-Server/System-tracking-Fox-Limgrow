import "server-only";

import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/server/cache-tags";
import {
  deviceTokenToTracking,
  notificationEventToTracking,
  notificationJobToTracking,
  notificationScheduleToTracking,
} from "@/lib/tracking/mappers/notification";

const NOTIFICATION_FAST_REVALIDATE_SECONDS = 15;
const NOTIFICATION_MEDIUM_REVALIDATE_SECONDS = 30;

const getCachedNotificationJobs = unstable_cache(
  async (take: number) => {
    const jobs = await prisma.notificationJob.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });

    return jobs.map(notificationJobToTracking);
  },
  ["notification-jobs"],
  {
    revalidate: NOTIFICATION_FAST_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.notificationJobs],
  },
);

export function getNotificationJobs(take = 50) {
  return getCachedNotificationJobs(take);
}

const getCachedNotificationJobById = unstable_cache(
  async (id: string) => {
    const job = await prisma.notificationJob.findUnique({
      where: { id },
    });

    return job ? notificationJobToTracking(job) : null;
  },
  ["notification-job-by-id"],
  {
    revalidate: NOTIFICATION_FAST_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.notificationJobs],
  },
);

export function getNotificationJobById(id: string) {
  return getCachedNotificationJobById(id);
}

const getCachedNotificationSchedules = unstable_cache(
  async (take: number) => {
    const schedules = await prisma.notificationSchedule.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });

    return schedules.map(notificationScheduleToTracking);
  },
  ["notification-schedules"],
  {
    revalidate: NOTIFICATION_MEDIUM_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.notificationSchedules],
  },
);

export function getNotificationSchedules(take = 50) {
  return getCachedNotificationSchedules(take);
}

const getCachedNotificationEvents = unstable_cache(
  async (take: number) => {
    const events = await prisma.notificationEvent.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });

    return events.map(notificationEventToTracking);
  },
  ["notification-events"],
  {
    revalidate: NOTIFICATION_FAST_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.notificationEvents],
  },
);

export function getNotificationEvents(take = 80) {
  return getCachedNotificationEvents(take);
}

const getCachedNotificationEventsForJob = unstable_cache(
  async (jobId: string, take: number) => {
    const events = await prisma.notificationEvent.findMany({
      orderBy: { createdAt: "desc" },
      take,
      where: { jobId },
    });

    return events.map(notificationEventToTracking);
  },
  ["notification-events-for-job"],
  {
    revalidate: NOTIFICATION_FAST_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.notificationEvents],
  },
);

export function getNotificationEventsForJob(jobId: string, take = 2000) {
  return getCachedNotificationEventsForJob(jobId, take);
}

const getCachedDeviceTokens = unstable_cache(
  async (take: number) => {
    const devices = await prisma.deviceToken.findMany({
      orderBy: { lastSeenAt: "desc" },
      take,
    });

    return devices.map(deviceTokenToTracking);
  },
  ["device-tokens"],
  {
    revalidate: NOTIFICATION_MEDIUM_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.deviceTokens],
  },
);

export function getDeviceTokens(take = 120) {
  return getCachedDeviceTokens(take);
}
