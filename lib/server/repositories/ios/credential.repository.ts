import "server-only";

import type { CredentialPurpose, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type CredentialTargetInput = {
  credentialRef?: string;
  id?: string;
};

export function getIosCredentials(take = 160) {
  return prisma.iosCredential.findMany({
    orderBy: { updatedAt: "desc" },
    take,
  });
}

type IosCredentialGroupPageOptions = {
  search?: string;
  skip: number;
  take: number;
};

function iosCredentialGroupWhere(options: IosCredentialGroupPageOptions): Prisma.IosStoreProfileWhereInput {
  const where: Prisma.IosStoreProfileWhereInput = {
    credentials: { some: {} },
  };
  const search = options.search?.trim();

  if (search) {
    const contains = { contains: search, mode: "insensitive" as const };

    where.OR = [
      { storeAccountName: contains },
      { issuerId: contains },
      {
        credentials: {
          some: {
            OR: [
              { credentialRef: contains },
              { keyId: contains },
              { vaultSecretName: contains },
              { storeAccountName: contains },
            ],
          },
        },
      },
    ];
  }

  return where;
}

export function getIosCredentialGroupsPage(options: IosCredentialGroupPageOptions) {
  const where = iosCredentialGroupWhere(options);

  return prisma.$transaction([
    prisma.iosStoreProfile.findMany({
      where,
      include: {
        credentials: {
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: options.skip,
      take: options.take,
    }),
    prisma.iosStoreProfile.count({ where }),
  ]);
}

export function getIosCredentialsByIds(ids: string[]) {
  return prisma.iosCredential.findMany({
    where: { id: { in: ids } },
  });
}

export async function getIosCredentialTarget(input: CredentialTargetInput) {
  if (input.id) {
    return prisma.iosCredential.findUnique({ where: { id: input.id } });
  }

  if (input.credentialRef) {
    return prisma.iosCredential.findUnique({
      where: { credentialRef: input.credentialRef },
    });
  }

  return null;
}

export function getCurrentIosCredentialForStorePurpose(
  tx: Prisma.TransactionClient,
  input: { credentialPurpose: CredentialPurpose; storeProfileId: string }
) {
  return tx.iosCredential.findFirst({
    where: {
      credentialPurpose: input.credentialPurpose,
      storeProfileId: input.storeProfileId,
    },
    select: { id: true, vaultSecretId: true, vaultSecretVersion: true },
  });
}

export function createIosCredential(
  tx: Prisma.TransactionClient,
  data: Prisma.IosCredentialUncheckedCreateInput
) {
  return tx.iosCredential.create({ data });
}

export function updateIosCredential(
  tx: Prisma.TransactionClient,
  id: string,
  data: Prisma.IosCredentialUncheckedUpdateInput
) {
  return tx.iosCredential.update({
    where: { id },
    data,
  });
}

export function deleteIosCredential(
  tx: Prisma.TransactionClient,
  id: string
) {
  return tx.iosCredential.delete({ where: { id } });
}

export function deleteIosCredentialsByIds(
  tx: Prisma.TransactionClient,
  ids: string[]
) {
  return tx.iosCredential.deleteMany({ where: { id: { in: ids } } });
}
