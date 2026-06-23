import "server-only";

import { prisma } from "@/lib/prisma";
import {
  deviceTokenToTracking,
  notificationEventToTracking,
  notificationJobToTracking,
  notificationScheduleToTracking,
} from "@/lib/tracking/mappers/notification";

export async function getNotificationJobs(take = 50) {
  const jobs = await prisma.notificationJob.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });

  return jobs.map(notificationJobToTracking);
}

export async function getNotificationSchedules(take = 50) {
  const schedules = await prisma.notificationSchedule.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });

  return schedules.map(notificationScheduleToTracking);
}

export async function getNotificationEvents(take = 80) {
  const events = await prisma.notificationEvent.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });

  return events.map(notificationEventToTracking);
}

export async function getDeviceTokens(take = 120) {
  const devices = await prisma.deviceToken.findMany({
    orderBy: { lastSeenAt: "desc" },
    take,
  });

  return devices.map(deviceTokenToTracking);
}
