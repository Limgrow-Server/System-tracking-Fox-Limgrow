import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "crypto";
import nodemailer from "nodemailer";

import type { ConsoleSession } from "@/lib/auth/rbac";
import { normalizeEmail } from "@/lib/auth/team-members";
import { badRequest, forbidden, ApiError } from "@/lib/server/api/errors";
import { prisma } from "@/lib/prisma";

const OTP_PURPOSE = "credential_secret_reveal";
const OTP_TTL_MS = 10 * 60 * 1000;
const UNLOCK_TTL_MS = 60 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function nowPlus(ms: number) {
  return new Date(Date.now() + ms);
}

function sessionEmail(session: ConsoleSession) {
  const email = normalizeEmail(session.email);
  if (!email) throw forbidden("Admin email is required.");
  return email;
}

function credentialOtpRecipientEmail() {
  const email = normalizeEmail(process.env.SMTP_TO || process.env.SMTP_USER);

  if (!email) {
    throw new ApiError("Credential OTP recipient email is not configured.", 500);
  }

  return email;
}

function otpSecret() {
  const secret =
    process.env.CREDENTIAL_OTP_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!secret) {
    throw new ApiError("Credential OTP secret is not configured.", 500);
  }

  return secret;
}

function hashOtp(input: {
  code: string;
  email: string;
  memberId: string;
}) {
  return createHmac("sha256", otpSecret())
    .update(`${OTP_PURPOSE}:${input.memberId}:${input.email}:${input.code}`)
    .digest("hex");
}

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function cleanOtpCode(value: unknown) {
  const code = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (!/^\d{6}$/.test(code)) {
    throw badRequest("OTP code must contain 6 digits.");
  }
  return code;
}

async function cleanupExpiredCredentialSecretAccess(now = new Date()) {
  await prisma.$transaction([
    prisma.credentialSecretOtp.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    }),
    prisma.credentialSecretUnlock.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    }),
  ]);
}

async function sendCredentialSecretOtpEmail(input: {
  code: string;
  email: string;
}) {
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || (user ? `System Tracking <${user}>` : "");
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const secure =
    process.env.SMTP_SECURE === undefined
      ? port === 465
      : process.env.SMTP_SECURE !== "false";

  if (!user || !password || !from) {
    throw new ApiError(
      "SMTP credential OTP sender is not configured.",
      500,
    );
  }

  const transporter = nodemailer.createTransport({
    auth: {
      pass: password,
      user,
    },
    host,
    port,
    secure,
  });

  try {
    await transporter.sendMail({
      from,
      html: `<p>Your credential access OTP is <strong>${input.code}</strong>.</p><p>It expires in 10 minutes. After verification, secret access is valid for 1 hour.</p>`,
      subject: "System Tracking credential OTP",
      text: `Your credential access OTP is ${input.code}. It expires in 10 minutes. After verification, secret access is valid for 1 hour.`,
      to: input.email,
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error
        ? `Could not send SMTP credential OTP email: ${error.message}`
        : "Could not send SMTP credential OTP email.",
      500,
    );
  }
}

export async function getCredentialSecretUnlockStatus(
  session: ConsoleSession,
) {
  const email = sessionEmail(session);
  const now = new Date();
  const unlock = await prisma.credentialSecretUnlock.findFirst({
    where: {
      email,
      memberId: session.memberId,
      purpose: OTP_PURPOSE,
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: "desc" },
  });

  return {
    unlocked: Boolean(unlock),
    expiresAt: unlock?.expiresAt.toISOString() ?? null,
  };
}

export async function assertCredentialSecretUnlocked(
  session: ConsoleSession,
) {
  const status = await getCredentialSecretUnlockStatus(session);
  if (!status.unlocked) {
    throw forbidden("Credential secret access requires email OTP verification.");
  }
  return status;
}

export async function sendCredentialSecretOtp(session: ConsoleSession) {
  const email = sessionEmail(session);
  const deliveryEmail = credentialOtpRecipientEmail();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  const expiresAt = nowPlus(OTP_TTL_MS);

  await cleanupExpiredCredentialSecretAccess(now);
  await prisma.$transaction([
    prisma.credentialSecretOtp.updateMany({
      where: {
        memberId: session.memberId,
        purpose: OTP_PURPOSE,
        consumedAt: null,
      },
      data: {
        consumedAt: now,
      },
    }),
    prisma.credentialSecretOtp.create({
      data: {
        codeHash: hashOtp({ code, email, memberId: session.memberId }),
        email,
        expiresAt,
        memberId: session.memberId,
        purpose: OTP_PURPOSE,
      },
    }),
  ]);

  await sendCredentialSecretOtpEmail({ code, email: deliveryEmail });

  return {
    email: deliveryEmail,
    otpExpiresAt: expiresAt.toISOString(),
  };
}

export async function verifyCredentialSecretOtp(input: {
  code: unknown;
  session: ConsoleSession;
}) {
  const code = cleanOtpCode(input.code);
  const email = sessionEmail(input.session);
  const now = new Date();
  const otp = await prisma.credentialSecretOtp.findFirst({
    where: {
      consumedAt: null,
      email,
      expiresAt: { gt: now },
      memberId: input.session.memberId,
      purpose: OTP_PURPOSE,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    throw badRequest("OTP code is expired. Please send a new OTP.");
  }

  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    await prisma.credentialSecretOtp.update({
      where: { id: otp.id },
      data: { consumedAt: now },
    });
    throw forbidden("OTP code has too many failed attempts.");
  }

  const expectedHash = hashOtp({
    code,
    email,
    memberId: input.session.memberId,
  });

  if (!secureCompare(otp.codeHash, expectedHash)) {
    await prisma.credentialSecretOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw badRequest("OTP code is incorrect.");
  }

  const unlockExpiresAt = nowPlus(UNLOCK_TTL_MS);
  await prisma.$transaction([
    prisma.credentialSecretOtp.update({
      where: { id: otp.id },
      data: { consumedAt: now },
    }),
    prisma.credentialSecretUnlock.create({
      data: {
        email,
        expiresAt: unlockExpiresAt,
        memberId: input.session.memberId,
        purpose: OTP_PURPOSE,
      },
    }),
    prisma.credentialSecretUnlock.deleteMany({
      where: {
        email,
        expiresAt: { lt: now },
        memberId: input.session.memberId,
        purpose: OTP_PURPOSE,
      },
    }),
  ]);

  return {
    unlocked: true,
    expiresAt: unlockExpiresAt.toISOString(),
  };
}
