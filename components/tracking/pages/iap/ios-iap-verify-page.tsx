"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Apple,
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  ReceiptText,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader, StatusBadge } from "@/components/tracking/primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { dateTime, microsToMoney, money, toNumber } from "@/lib/tracking/format";
import type { IosIapVerifyPageData } from "@/lib/tracking/page-data";
import type {
  CredentialSecretMetadata,
  IosIapTransactionSummary,
  StoreMapping,
} from "@/lib/tracking/types";

const AUTO_CREDENTIAL = "__auto__";
const NO_MAPPING = "__none__";

type VerifyEnvironment = "production" | "sandbox";

type VerifyIosResult = {
  app?: {
    appName?: string | null;
    bundleId?: string | null;
    storeAccountName?: string | null;
  } | null;
  credentialRef?: string | null;
  transaction?: Record<string, unknown> | null;
};

type VerifyIosApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  result?: VerifyIosResult;
};

function firstMapping(mappings: StoreMapping[]) {
  return mappings.find((mapping) => mapping.bundle_id) ?? mappings[0] ?? null;
}

function credentialsForMapping(
  credentials: CredentialSecretMetadata[],
  mapping: StoreMapping | null
) {
  if (!mapping) return credentials;

  return credentials.filter(
    (credential) =>
      credential.store_profile_id === mapping.store_profile_id ||
      credential.store_account_name === mapping.store_account_name
  );
}

function defaultCredentialValue(
  credentials: CredentialSecretMetadata[],
  mapping: StoreMapping | null
) {
  return credentialsForMapping(credentials, mapping)[0]?.credential_ref ?? AUTO_CREDENTIAL;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown) {
  const text = stringValue(value);
  return text || null;
}

function numberLikeString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function boolOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function transactionToSummary(transaction: Record<string, unknown> | null | undefined): IosIapTransactionSummary | null {
  if (!transaction) return null;

  const transactionId = stringValue(transaction.transaction_id);
  if (!transactionId) return null;

  const verifiedAt = stringValue(transaction.verified_at) || new Date().toISOString();

  return {
    id: stringValue(transaction.id) || transactionId,
    transaction_id: transactionId,
    original_transaction_id: nullableString(transaction.original_transaction_id),
    product_id: stringValue(transaction.product_id) || "unknown_product",
    user_id: nullableString(transaction.user_id),
    bundle_id: nullableString(transaction.bundle_id),
    purchase_date: nullableString(transaction.purchase_date),
    expires_date: nullableString(transaction.expires_date),
    state: stringValue(transaction.state) || "verified",
    revenue_micros: numberLikeString(transaction.revenue_micros),
    price_milliunits: numberLikeString(transaction.price_milliunits),
    currency: nullableString(transaction.currency),
    is_trial: boolOrNull(transaction.is_trial),
    environment: stringValue(transaction.environment) || "production",
    raw_receipt: transaction.raw_receipt ?? transaction,
    verified_at: verifiedAt,
    created_at: stringValue(transaction.created_at) || verifiedAt,
  };
}

function upsertTransaction(
  rows: IosIapTransactionSummary[],
  next: IosIapTransactionSummary
) {
  return [
    next,
    ...rows.filter((row) => row.transaction_id !== next.transaction_id),
  ].slice(0, 20);
}

function formatMilliunits(value: string | null, currency: string | null) {
  if (!value) return "No price";
  return money(toNumber(value) / 1000, currency || "USD");
}

function AppIdentity({ mapping }: { mapping: StoreMapping | null }) {
  if (!mapping) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Create an iOS app mapping first, then return here to verify a transaction.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/80 bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-border">
          <Apple size={18} />
        </div>
        <div className="min-w-0">
          <div className="font-medium">{mapping.app_name}</div>
          <div className="mt-1 break-all text-xs text-muted-foreground">{mapping.bundle_id}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{mapping.store_account_name}</Badge>
            <StatusBadge status={mapping.status} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 word-break-all font-medium">{value}</div>
    </div>
  );
}

export function IosIapVerifyPage({ data }: { data: IosIapVerifyPageData }) {
  const router = useRouter();
  const initialMapping = firstMapping(data.storeMappings);
  const [selectedMappingId, setSelectedMappingId] = useState(initialMapping?.id ?? NO_MAPPING);
  const [credentialRef, setCredentialRef] = useState(defaultCredentialValue(data.credentialSecrets, initialMapping));
  const [transactionId, setTransactionId] = useState("");
  const [productId, setProductId] = useState("");
  const [userId, setUserId] = useState("");
  const [environment, setEnvironment] = useState<VerifyEnvironment>("sandbox");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyIosResult | null>(null);
  const [recentTransactions, setRecentTransactions] = useState(data.recentTransactions);

  const selectedMapping =
    data.storeMappings.find((mapping) => mapping.id === selectedMappingId) ?? null;
  const credentialOptions = credentialsForMapping(data.credentialSecrets, selectedMapping);
  const selectedTransaction = transactionToSummary(result?.transaction);

  function selectMapping(nextId: string) {
    const nextMapping = data.storeMappings.find((mapping) => mapping.id === nextId) ?? null;
    setSelectedMappingId(nextMapping?.id ?? NO_MAPPING);
    setCredentialRef(defaultCredentialValue(data.credentialSecrets, nextMapping));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedMapping?.bundle_id) {
      setError("Please select an active iOS app mapping with BundleId.");
      return;
    }

    setPending(true);

    try {
      const response = await fetch("/api/admin/ios-iap/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bundleId: selectedMapping.bundle_id,
          credentialRef: credentialRef === AUTO_CREDENTIAL ? undefined : credentialRef,
          environment,
          productId,
          transactionId,
          userId,
        }),
      });
      const payload = (await response.json()) as VerifyIosApiResponse;

      if (!response.ok || !payload.ok || !payload.result) {
        throw new Error(payload.error ?? "iOS IAP verification failed.");
      }

      setResult(payload.result);
      const summary = transactionToSummary(payload.result.transaction);
      if (summary) {
        setRecentTransactions((current) => upsertTransaction(current, summary));
      }
      toast.success(payload.message ?? "iOS transaction verified.");
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "iOS IAP verification failed.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="iOS IAP"
        title="Verify Apple transactions"
        description="Run the same verify-ios Edge Function from the dashboard: select an app mapping, paste a StoreKit transaction ID, and save the normalized result into ios_iap_transactions."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)]">
        <Card className="rounded-lg border border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText size={18} />
              Test request
            </CardTitle>
            <CardDescription>
              Use Sandbox for StoreKit/TestFlight transactions, Production for live App Store transactions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={submit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="ios-iap-mapping" className="text-xs font-medium text-muted-foreground">App mapping</Label>
                  <Select
                    value={selectedMappingId}
                    onValueChange={selectMapping}
                    disabled={!data.storeMappings.length}
                  >
                    <SelectTrigger id="ios-iap-mapping" className="h-9 w-full">
                      <SelectValue placeholder="Select iOS app mapping" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.storeMappings.length ? (
                        data.storeMappings.map((mapping) => (
                          <SelectItem key={mapping.id} value={mapping.id}>
                            {mapping.app_name} - {mapping.bundle_id}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value={NO_MAPPING} disabled>
                          No active iOS mappings
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ios-iap-transaction" className="text-xs font-medium text-muted-foreground">Transaction ID</Label>
                  <Input
                    id="ios-iap-transaction"
                    value={transactionId}
                    onChange={(event) => setTransactionId(event.target.value)}
                    placeholder="2000001191192424"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ios-iap-environment" className="text-xs font-medium text-muted-foreground">Environment</Label>
                  <Select value={environment} onValueChange={(value) => setEnvironment(value as VerifyEnvironment)}>
                    <SelectTrigger id="ios-iap-environment" className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="ios-iap-credential" className="text-xs font-medium text-muted-foreground">IAP credential</Label>
                  <Select value={credentialRef} onValueChange={setCredentialRef}>
                    <SelectTrigger id="ios-iap-credential" className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO_CREDENTIAL}>Auto resolve from selected mapping</SelectItem>
                      {credentialOptions.map((credential) => (
                        <SelectItem key={credential.id} value={credential.credential_ref}>
                          {credential.credential_ref} - {credential.store_account_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ios-iap-product" className="text-xs font-medium text-muted-foreground">Product ID optional</Label>
                  <Input
                    id="ios-iap-product"
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                    placeholder="com.test.new.monthly"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ios-iap-user" className="text-xs font-medium text-muted-foreground">User ID optional</Label>
                  <Input
                    id="ios-iap-user"
                    value={userId}
                    onChange={(event) => setUserId(event.target.value)}
                    placeholder="internal-user-id"
                  />
                </div>
              </div>

              <AppIdentity mapping={selectedMapping} />

              {selectedMapping && !credentialOptions.length ? (
                <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                  <AlertCircle size={16} />
                  <AlertTitle>No active IAP key for this mapping</AlertTitle>
                  <AlertDescription className="text-amber-800/80">
                    Add an iOS credential with secret type apple_iap_p8 for this store before verifying.
                  </AlertDescription>
                </Alert>
              ) : null}

              {error ? (
                <Alert variant="destructive">
                  <AlertCircle size={16} />
                  <AlertTitle>Verification failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={pending || !transactionId.trim() || !selectedMapping?.bundle_id}
              >
                {pending ? <Spinner /> : <ClipboardCheck size={16} />}
                Verify iOS transaction
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-lg border border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 size={18} />
              Verification result
            </CardTitle>
            <CardDescription>
              The raw Apple receipt is intentionally hidden; use the normalized fields below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedTransaction ? (
              <>
                <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
                  <CheckCircle2 size={16} />
                  <AlertTitle>Saved to ios_iap_transactions</AlertTitle>
                  <AlertDescription className="text-emerald-800/80">
                    {result?.app?.appName ?? selectedMapping?.app_name ?? "iOS app"} - {result?.credentialRef ?? "auto credential"}
                  </AlertDescription>
                </Alert>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ResultMetric label="Transaction" value={selectedTransaction.transaction_id} />
                  <ResultMetric label="Product" value={selectedTransaction.product_id} />
                  <ResultMetric
                    label="Revenue"
                    value={microsToMoney(selectedTransaction.revenue_micros, selectedTransaction.currency || "USD")}
                  />
                  <ResultMetric
                    label="Apple price"
                    value={formatMilliunits(selectedTransaction.price_milliunits, selectedTransaction.currency)}
                  />
                  <ResultMetric label="Environment" value={selectedTransaction.environment} />
                  <ResultMetric label="Verified at" value={dateTime(selectedTransaction.verified_at)} />
                </div>

                <div className="rounded-lg border border-border/80 bg-muted/30 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <KeyRound size={15} />
                    Sanitized response
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-md bg-background p-3 text-xs leading-5 text-muted-foreground">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
                  <ReceiptText className="text-muted-foreground" size={22} />
                </div>
                <div className="mt-4 font-medium">No verification yet</div>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Paste a transaction ID and click verify. The response will appear here without exposing the raw receipt.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg border border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Recent iOS IAP verifications</CardTitle>
          <CardDescription>
            Latest rows from ios_iap_transactions, ordered by verified_at.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-foreground">
              <thead className="bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3">Bundle</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Verified</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.length ? (
                  recentTransactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{transaction.transaction_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {transaction.environment}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-56 truncate text-sm">{transaction.bundle_id ?? "No bundle"}</td>
                      <td className="px-4 py-3 text-sm">{transaction.product_id}</td>
                      <td className="px-4 py-3 text-sm">{microsToMoney(transaction.revenue_micros, transaction.currency || "USD")}</td>
                      <td className="px-4 py-3"><StatusBadge status={transaction.state} /></td>
                      <td className="px-4 py-3 text-sm">{dateTime(transaction.verified_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
                          <ReceiptText className="text-muted-foreground" size={24} />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">No iOS IAP transactions</p>
                          <p className="text-sm text-muted-foreground">Verified Apple transactions will appear here.</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
