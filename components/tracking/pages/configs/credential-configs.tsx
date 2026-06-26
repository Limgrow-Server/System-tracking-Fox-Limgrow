"use client";

import {
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  CloudUpload,
  Copy,
  Eye,
  EyeOff,
  FileUp,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  PageHeader,
  StatusBadge,
  TableEmptyState,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SECRET_TYPE_LABELS,
  credentialVaultOptions,
  defaultPlatformForSecretType,
  defaultSecretFormatForType,
  secretTypeSupportsPlatform,
  storePlatformForMobilePlatform,
  type MobilePlatform,
  type SecretType,
  type VaultCredentialOption,
} from "@/lib/tracking/credential-vault";
import { dateTime } from "@/lib/tracking/format";
import type { ConfigsPageData } from "@/lib/tracking/page-data";
import type { CredentialSecretMetadata } from "@/lib/tracking/types";

type CredentialAction = "upsert" | "delete";
type SecretFormat = "json" | "p8";
type WebkitTextSecurityStyle = CSSProperties & {
  WebkitTextSecurity?: "disc" | "none";
};
type ConfigViewTarget =
  | { platform: "android"; credential: CredentialSecretMetadata }
  | { platform: "ios"; group: IosCredentialGroup };
type CredentialListResponse = {
  success?: boolean;
  data?: CredentialSecretMetadata[];
  error?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
};

const CONFIG_PAGE_SIZE = 10;

const credentialRefPrefixes: Record<SecretType, string> = {
  firebase_service_account: "FIREBASE_ADMIN_SERVICE_ACCOUNT",
  apple_asc_p8: "APPLE_ASC_KEY_P8",
  apple_iap_p8: "APPLE_IAP_KEY_P8",
};

const CONFIG_METADATA_PREFIX = "credential_config:";
const LEGACY_ANDROID_CONFIG_METADATA_PREFIX = "android_config:";

function safeCredentialRefPart(value: string) {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_.:@/-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_./:-]+|[_./:-]+$/g, "");
}

function credentialConfigMetadata(
  credential: Pick<
    CredentialSecretMetadata,
    "avatar_url" | "description" | "link_store"
  > | null,
) {
  if (credential?.link_store || credential?.avatar_url) {
    return {
      linkStore: credential.link_store ?? "",
      avatarUrl: credential.avatar_url ?? "",
    };
  }

  const description = credential?.description ?? null;
  const prefix = description?.startsWith(CONFIG_METADATA_PREFIX)
    ? CONFIG_METADATA_PREFIX
    : description?.startsWith(LEGACY_ANDROID_CONFIG_METADATA_PREFIX)
      ? LEGACY_ANDROID_CONFIG_METADATA_PREFIX
      : null;

  if (!description || !prefix) {
    return { linkStore: "", avatarUrl: "" };
  }

  try {
    const parsed = JSON.parse(description.slice(prefix.length)) as {
      linkStore?: unknown;
      avatarUrl?: unknown;
    };

    return {
      linkStore: typeof parsed.linkStore === "string" ? parsed.linkStore : "",
      avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : "",
    };
  } catch {
    return { linkStore: "", avatarUrl: "" };
  }
}

function fileFromFormData(formData: FormData | null, key: string) {
  const value = formData?.get(key);
  return typeof File !== "undefined" && value instanceof File && value.size > 0
    ? value
    : null;
}

type IosCredentialGroup = {
  id: string;
  storeProfileId: string | null;
  storeName: string;
  linkStore: string;
  avatarUrl: string;
  issuerId: string;
  keyReview: CredentialSecretMetadata | null;
  keyIap: CredentialSecretMetadata | null;
  keyFirebase: CredentialSecretMetadata | null;
  credentials: CredentialSecretMetadata[];
  updatedAt: string;
};

function notAvailable(value: string | null | undefined) {
  return value?.trim() ? value : "N/A";
}

function maskedInlineValue(value: string | null | undefined) {
  if (!value?.trim()) return "N/A";
  return "\u2022".repeat(Math.min(Math.max(value.length, 12), 28));
}

function isActiveCredentialStatus(status: string | null | undefined) {
  return status === "active";
}

function displayCredentialStatus(status: string | null | undefined) {
  return status === "disabled" ? "inactive" : status;
}

function credentialStatusLabel(status: string | null | undefined) {
  const normalized = displayCredentialStatus(status);
  if (normalized === "active") return "Active";
  if (normalized === "inactive") return "Inactive";
  return notAvailable(normalized);
}

function keyPresence(credential: CredentialSecretMetadata | null) {
  if (!credential)
    return <span className="text-sm text-muted-foreground">N/A</span>;
  return (
    <StatusBadge
      status={
        isActiveCredentialStatus(credential.status) ? "active" : "inactive"
      }
    />
  );
}

function credentialGroupStatus(group: IosCredentialGroup) {
  if (!group.credentials.length) return "unknown";
  return group.credentials.some((credential) =>
    isActiveCredentialStatus(credential.status),
  )
    ? "active"
    : "inactive";
}

function hardDeleteCredentialName(credential: CredentialSecretMetadata) {
  return credential.store_account_name?.trim() || credential.credential_ref;
}

function hardDeleteTargetName(target: ConfigViewTarget | null) {
  if (!target) return "";
  if (target.platform === "android")
    return hardDeleteCredentialName(target.credential);

  return (
    target.group.storeName.trim() ||
    target.group.credentials[0]?.credential_ref ||
    target.group.id
  );
}

function hardDeleteTargetIds(target: ConfigViewTarget | null) {
  if (!target) return [];
  if (target.platform === "android") return [target.credential.id];
  return target.group.credentials.map((credential) => credential.id);
}

function hardDeleteTargetIsInactive(target: ConfigViewTarget | null) {
  if (!target) return false;
  if (target.platform === "android")
    return !isActiveCredentialStatus(target.credential.status);
  return (
    target.group.credentials.length > 0 &&
    credentialGroupStatus(target.group) !== "active"
  );
}

function configRowClass(status: string | null | undefined, hasVault: boolean) {
  if (!hasVault) return "bg-amber-50/40 hover:bg-amber-50/60";
  if (!isActiveCredentialStatus(status))
    return "bg-muted/30 text-muted-foreground hover:bg-muted/40";
  return "bg-emerald-50/20 hover:bg-emerald-50/40";
}

function InlineStoreLink({
  href,
  storeName,
}: {
  href: string | null | undefined;
  storeName: string | null | undefined;
}) {
  const cleanedHref = href?.trim();
  if (!cleanedHref) return null;

  return (
    <a
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition hover:border-primary/50 hover:text-primary"
      href={cleanedHref}
      target="_blank"
      rel="noreferrer"
      title={cleanedHref}
      aria-label={`Open store link for ${storeName || "store"}`}
    >
      <Link2 size={13} />
    </a>
  );
}

function InputField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="font-mono text-xs"
      />
    </div>
  );
}

function SensitiveInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete = "new-password",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const toggleLabel = revealed ? "Hide value" : "Show value";
  const textSecurityStyle: WebkitTextSecurityStyle = {
    WebkitTextSecurity: revealed ? "none" : "disc",
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          data-lpignore="true"
          data-1p-ignore="true"
          style={textSecurityStyle}
          className="pr-10 font-mono text-xs"
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex w-10 items-center justify-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-events-auto size-8"
            aria-label={toggleLabel}
            aria-pressed={revealed}
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            <span className="sr-only">{toggleLabel}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyInputField({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children ?? (
        <Input readOnly value={notAvailable(value)} className="bg-muted/30" />
      )}
    </div>
  );
}

function ReadOnlySensitiveInputField({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value?: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const hasValue = Boolean(value?.trim());
  const toggleLabel = revealed ? "Hide value" : "Show value";

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          readOnly
          value={
            hasValue && !revealed
              ? maskedInlineValue(value)
              : notAvailable(value)
          }
          tabIndex={-1}
          className="pointer-events-none bg-muted/30 pr-10 font-mono text-xs"
        />
        {hasValue ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex w-10 items-center justify-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="pointer-events-auto size-8"
              aria-label={toggleLabel}
              aria-pressed={revealed}
              onClick={() => setRevealed((current) => !current)}
            >
              {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
              <span className="sr-only">{toggleLabel}</span>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function inlineSecretText(secretText: string) {
  return secretText.replace(/\s+/g, " ").trim();
}

function maskedSecretLine(secretText: string | null | undefined) {
  const textLength = inlineSecretText(secretText ?? "").length;
  return "\u2022".repeat(Math.min(Math.max(textLength || 18, 18), 28));
}

function SecretContentViewer({
  credential,
  platform,
  label,
  secretText,
  onSecretLoaded,
}: {
  credential: CredentialSecretMetadata;
  platform: MobilePlatform;
  label: string;
  secretText: string | undefined;
  onSecretLoaded: (credentialId: string, secretText: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const displayText =
    secretText && revealed
      ? inlineSecretText(secretText)
      : maskedSecretLine(secretText);
  const toggleLabel = secretText
    ? revealed
      ? "Hide key"
      : "Show key"
    : "Load key from Vault";

  async function loadSecret() {
    if (secretText) {
      setRevealed((current) => !current);
      return;
    }

    setPending(true);

    try {
      const params = new URLSearchParams({
        reveal: "secret",
        id: credential.id,
        platform,
      });
      const response = await fetch(
        `/api/admin/credentials?${params.toString()}`,
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        secretText?: string;
        error?: string;
      };

      if (
        !response.ok ||
        !payload.ok ||
        typeof payload.secretText !== "string"
      ) {
        throw new Error(payload.error ?? "Could not load Vault secret.");
      }

      onSecretLoaded(credential.id, payload.secretText);
      setRevealed(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load Vault secret.",
      );
    } finally {
      setPending(false);
    }
  }

  async function copySecret() {
    if (!secretText) return;

    try {
      await navigator.clipboard.writeText(secretText);
      toast.success("Key copied to clipboard.");
    } catch {
      toast.error("Could not copy key.");
    }
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={`secretContent-${credential.id}`}>{label}</Label>
      <div className="relative min-w-0">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 flex w-10 items-center justify-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-events-auto size-8"
            disabled={pending || !credential.vault_secret_id}
            aria-label={toggleLabel}
            aria-pressed={revealed}
            onClick={loadSecret}
            title={toggleLabel}
          >
            {pending ? (
              <Spinner />
            ) : revealed ? (
              <EyeOff size={16} />
            ) : (
              <Eye size={16} />
            )}
            <span className="sr-only">{toggleLabel}</span>
          </Button>
        </div>
        <Input
          id={`secretContent-${credential.id}`}
          readOnly
          value={displayText}
          tabIndex={-1}
          className={`pointer-events-none h-10 bg-background pl-10 font-mono text-sm ${revealed && secretText ? "pr-24" : "pr-3"}`}
        />
        {revealed && secretText ? (
          <div className="pointer-events-none absolute inset-y-0 right-1 z-20 flex items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-events-auto h-8 gap-1.5 bg-background"
              onClick={copySecret}
            >
              <Copy size={14} />
              Copy
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AvatarPreview({ src }: { src: string | null | undefined }) {
  if (!src?.trim())
    return <span className="text-sm text-muted-foreground">N/A</span>;

  return (
    <div
      className="size-10 rounded-md border bg-muted bg-cover bg-center"
      style={{ backgroundImage: `url("${src.replace(/"/g, "%22")}")` }}
      aria-label="Store avatar"
    />
  );
}

function IosCredentialKeyViewSection({
  title,
  credential,
  keyIdLabel,
  keyId,
  secretLabel,
  secretCache,
  onSecretLoaded,
}: {
  title: string;
  credential: CredentialSecretMetadata | null;
  keyIdLabel?: string;
  keyId?: string | null;
  secretLabel: string;
  secretCache: Record<string, string>;
  onSecretLoaded: (credentialId: string, secretText: string) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      {keyIdLabel ? (
        <ReadOnlySensitiveInputField
          id={`${title.replace(/\s+/g, "-").toLowerCase()}-key-id`}
          label={keyIdLabel}
          value={keyId}
        />
      ) : null}
      {credential ? (
        <SecretContentViewer
          credential={credential}
          platform="ios"
          label={secretLabel}
          secretText={secretCache[credential.id]}
          onSecretLoaded={onSecretLoaded}
        />
      ) : (
        <ReadOnlyInputField label={secretLabel} value={null} />
      )}
    </fieldset>
  );
}

function ConfigViewContent({
  target,
  secretCache,
  onSecretLoaded,
}: {
  target: ConfigViewTarget;
  secretCache: Record<string, string>;
  onSecretLoaded: (credentialId: string, secretText: string) => void;
}) {
  if (target.platform === "android") {
    const credential = target.credential;
    const metadata = credentialConfigMetadata(credential);

    return (
      <div className="space-y-4">
        <ReadOnlyInputField
          label="Store name"
          value={credential.store_account_name}
        />
        <ReadOnlyInputField
          label="Link store (optional)"
          value={metadata.linkStore}
        />
        <ReadOnlyInputField
          label="Avatar (optional)"
          value={metadata.avatarUrl}
        >
          <div className="flex items-center gap-3">
            <Input
              readOnly
              value={notAvailable(metadata.avatarUrl)}
              className="bg-muted/30"
            />
            {metadata.avatarUrl ? (
              <AvatarPreview src={metadata.avatarUrl} />
            ) : null}
          </div>
        </ReadOnlyInputField>
        <SecretContentViewer
          credential={credential}
          platform="android"
          label="Google Service Account JSON"
          secretText={secretCache[credential.id]}
          onSecretLoaded={onSecretLoaded}
        />
      </div>
    );
  }

  const group = target.group;

  return (
    <div className="space-y-4">
      <ReadOnlyInputField label="Store name" value={group.storeName} />
      <ReadOnlyInputField
        label="Link store (optional)"
        value={group.linkStore}
      />
      <ReadOnlyInputField label="Avatar (optional)" value={group.avatarUrl}>
        <div className="flex items-center gap-3">
          <Input
            readOnly
            value={notAvailable(group.avatarUrl)}
            className="bg-muted/30"
          />
          {group.avatarUrl ? <AvatarPreview src={group.avatarUrl} /> : null}
        </div>
      </ReadOnlyInputField>
      <ReadOnlySensitiveInputField
        id="iosViewIssuerId"
        label="IssuerId"
        value={group.issuerId}
      />
      <IosCredentialKeyViewSection
        title="Key Review"
        credential={group.keyReview}
        keyIdLabel="Key Review ID (optional)"
        keyId={group.keyReview?.key_id}
        secretLabel="Key Review (optional)"
        secretCache={secretCache}
        onSecretLoaded={onSecretLoaded}
      />
      <IosCredentialKeyViewSection
        title="Key IAP"
        credential={group.keyIap}
        keyIdLabel="Key IAP ID (optional)"
        keyId={group.keyIap?.key_id}
        secretLabel="Key IAP (optional)"
        secretCache={secretCache}
        onSecretLoaded={onSecretLoaded}
      />
      <IosCredentialKeyViewSection
        title="Key Firebase"
        credential={group.keyFirebase}
        secretLabel="Key firebase-admin (optional)"
        secretCache={secretCache}
        onSecretLoaded={onSecretLoaded}
      />
    </div>
  );
}

function credentialRefFromValue(secretType: SecretType, value: string) {
  return `${credentialRefPrefixes[secretType]}_${safeCredentialRefPart(value) || "credential"}`;
}

function credentialRefFromStore(prefix: string, storeName: string) {
  return `${prefix}_${safeCredentialRefPart(storeName) || "store"}`;
}

function iosCredentialRefPrefix(
  secretType: "apple_asc_p8" | "apple_iap_p8" | "firebase_service_account",
) {
  if (secretType === "apple_asc_p8") return "IOS_KEY_REVIEW";
  if (secretType === "apple_iap_p8") return "IOS_KEY_IAP";
  return "IOS_FIREBASE_ADMIN";
}

function iosCredentialPurpose(credential: CredentialSecretMetadata) {
  if (credential.secret_type === "apple_asc_p8") return "review" as const;
  if (credential.secret_type === "apple_iap_p8") return "iap" as const;
  if (credential.secret_type === "firebase_service_account")
    return "firebase" as const;
  return null;
}

function latestDateIso(left: string, right: string) {
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function groupIosCredentials(
  credentials: CredentialSecretMetadata[],
): IosCredentialGroup[] {
  const groups = new Map<string, IosCredentialGroup>();

  for (const credential of credentials) {
    const purpose = iosCredentialPurpose(credential);
    if (!purpose) continue;

    const metadata = credentialConfigMetadata(credential);
    const groupKey =
      credential.store_profile_id ||
      credential.store_account_name ||
      credential.credential_ref;
    const current =
      groups.get(groupKey) ??
      ({
        id: groupKey,
        storeProfileId: credential.store_profile_id,
        storeName: credential.store_account_name ?? "",
        linkStore: "",
        avatarUrl: "",
        issuerId: "",
        keyReview: null,
        keyIap: null,
        keyFirebase: null,
        credentials: [],
        updatedAt: credential.updated_at,
      } satisfies IosCredentialGroup);

    if (!current.storeProfileId && credential.store_profile_id)
      current.storeProfileId = credential.store_profile_id;
    if (!current.storeName && credential.store_account_name)
      current.storeName = credential.store_account_name;
    if (!current.linkStore && metadata.linkStore)
      current.linkStore = metadata.linkStore;
    if (!current.avatarUrl && metadata.avatarUrl)
      current.avatarUrl = metadata.avatarUrl;
    if (!current.issuerId && credential.issuer_id)
      current.issuerId = credential.issuer_id;
    current.updatedAt = latestDateIso(current.updatedAt, credential.updated_at);
    current.credentials.push(credential);

    if (
      purpose === "review" &&
      (!current.keyReview || credential.status === "active")
    )
      current.keyReview = credential;
    if (
      purpose === "iap" &&
      (!current.keyIap || credential.status === "active")
    )
      current.keyIap = credential;
    if (
      purpose === "firebase" &&
      (!current.keyFirebase || credential.status === "active")
    )
      current.keyFirebase = credential;

    groups.set(groupKey, current);
  }

  return Array.from(groups.values()).sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function CredentialFileDropzone({
  id,
  label,
  accept,
  fileName,
  onFile,
}: {
  id: string;
  label: string;
  accept: string;
  fileName: string;
  onFile: (file: File) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function handleFile(file: File | undefined) {
    if (!file) return;
    onFile(file);
  }

  function handleDrag(event: DragEvent<HTMLElement>) {
    event.preventDefault();
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="file"
        accept={accept}
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
        }}
        className="sr-only"
      />
      <label
        htmlFor={id}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            document.getElementById(id)?.click();
          }
        }}
        onDragEnter={(event) => {
          handleDrag(event);
          setIsDragging(true);
        }}
        onDragOver={handleDrag}
        onDragLeave={(event) => {
          handleDrag(event);
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFile(event.dataTransfer.files?.[0]);
        }}
        className={`flex min-h-28 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 bg-background hover:border-muted-foreground/45"
        }`}
      >
        <div className="flex flex-wrap items-center justify-center gap-2 text-base">
          <CloudUpload size={20} className="text-muted-foreground" />
          <span>Drag and drop or</span>
          <span className="font-semibold underline underline-offset-4">
            choose files
          </span>
          <span>to upload</span>
        </div>
      </label>
      {fileName ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <FileUp size={13} />
          {fileName}
        </div>
      ) : null}
    </div>
  );
}

function fileBaseName(fileName: string) {
  return fileName.replace(/\.[^./\\]+$/, "");
}

function looksGeneratedSuffix(part: string) {
  const token = part.toLowerCase();

  return (
    /^x{4,}$/.test(token) ||
    /^[a-f0-9]{6,}$/.test(token) ||
    (token.length >= 8 && /^[a-z0-9]+$/.test(token) && /\d/.test(token))
  );
}

function meaningfulCredentialName(secretType: SecretType, fileName: string) {
  const baseName = fileBaseName(fileName).trim();

  if (["apple_asc_p8", "apple_iap_p8"].includes(secretType)) {
    const appleKeyMatch = /^(?:AuthKey|SubscriptionKey)_([A-Za-z0-9]+)$/i.exec(
      baseName,
    );
    if (appleKeyMatch?.[1]) return appleKeyMatch[1];
  }

  const withoutFirebaseAdminSdk = baseName.replace(
    /-firebase-adminsdk(?:-[a-z0-9]+)+$/i,
    "",
  );
  const parts = withoutFirebaseAdminSdk.split("-");

  while (
    parts.length > 1 &&
    looksGeneratedSuffix(parts[parts.length - 1] ?? "")
  ) {
    parts.pop();
  }

  return parts.join("-");
}

function credentialRefFromFile(secretType: SecretType, fileName: string) {
  return credentialRefFromValue(
    secretType,
    meaningfulCredentialName(secretType, fileName),
  );
}

function fillFromCredential(credential: VaultCredentialOption) {
  const secretType = credential.secretType ?? "apple_asc_p8";

  return {
    platform: credential.platform,
    secretType: credential.secretType,
    secretFormat: defaultSecretFormatForType(secretType),
    selectedRef: credential.ref,
    storeName: credential.storeAccountName ?? "",
    linkStore: credential.linkStore ?? "",
    avatarUrl: credential.avatarUrl ?? "",
  };
}

export function CredentialConfigs({
  data,
  platformFilter,
}: {
  data: ConfigsPageData;
  platformFilter: MobilePlatform;
}) {
  const router = useRouter();
  const platformLabel = platformFilter === "android" ? "Android" : "iOS";
  const [credentialSecrets, setCredentialSecrets] = useState(data.credentialSecrets);
  const [credentialPagination, setCredentialPagination] = useState(data.credentialPagination);
  const [credentialTableLoading, setCredentialTableLoading] = useState(false);
  const [credentialSearchQuery, setCredentialSearchQuery] = useState("");
  const vaultOptions = useMemo(
    () => credentialVaultOptions(credentialSecrets),
    [credentialSecrets],
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [action, setAction] = useState<CredentialAction>("upsert");
  const [selectedCredentialId, setSelectedCredentialId] = useState("new");
  const [platform, setPlatform] = useState<MobilePlatform>(platformFilter);
  const [secretType, setSecretType] = useState<SecretType>("apple_asc_p8");
  const [secretFormat, setSecretFormat] = useState<SecretFormat>(
    platformFilter === "ios" ? "p8" : "json",
  );
  const [selectedRef, setSelectedRef] = useState("");
  const [storeName, setStoreName] = useState("");
  const [linkStore, setLinkStore] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [secretFile, setSecretFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [iosReviewKeyId, setIosReviewKeyId] = useState("");
  const [iosIapKeyId, setIosIapKeyId] = useState("");
  const [iosIssuerId, setIosIssuerId] = useState("");
  const [iosReviewFile, setIosReviewFile] = useState<File | null>(null);
  const [iosIapFile, setIosIapFile] = useState<File | null>(null);
  const [iosFirebaseFile, setIosFirebaseFile] = useState<File | null>(null);
  const [iosEditingGroup, setIosEditingGroup] =
    useState<IosCredentialGroup | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<ConfigViewTarget | null>(null);
  const [statusConfirmTarget, setStatusConfirmTarget] =
    useState<ConfigViewTarget | null>(null);
  const [hardDeleteTarget, setHardDeleteTarget] =
    useState<ConfigViewTarget | null>(null);
  const [hardDeleteConfirmationName, setHardDeleteConfirmationName] =
    useState("");
  const [vaultSecretCache, setVaultSecretCache] = useState<
    Record<string, string>
  >({});

  const isAndroidConfigCredentialView = platformFilter === "android";
  const isIosConfigCredentialView = platformFilter === "ios";
  const isAndroidCredentialOnlyFlow = isAndroidConfigCredentialView;
  const effectiveAction: CredentialAction =
    isAndroidCredentialOnlyFlow || isIosConfigCredentialView
      ? "upsert"
      : action;
  const showActionField =
    !isAndroidCredentialOnlyFlow && !isIosConfigCredentialView;
  const showSecretTypeField =
    !isAndroidCredentialOnlyFlow && !isIosConfigCredentialView;
  const showExistingCredentialField =
    !isAndroidCredentialOnlyFlow && !isIosConfigCredentialView;
  const showPlatformField = false;
  const controlFieldCount = [
    showActionField,
    showPlatformField,
    showSecretTypeField,
  ].filter(Boolean).length;
  const controlGridClass =
    controlFieldCount >= 3
      ? "grid gap-4 md:grid-cols-3"
      : controlFieldCount === 2
        ? "grid gap-4 md:grid-cols-2"
        : "grid gap-4";
  const secretTypes = (Object.keys(SECRET_TYPE_LABELS) as SecretType[]).filter(
    (type) => secretTypeSupportsPlatform(type, platform),
  );
  const iosCredentialGroups = useMemo(
    () => groupIosCredentials(credentialSecrets),
    [credentialSecrets],
  );
  const selectedAndroidCredential = useMemo(
    () =>
      credentialSecrets.find(
        (credential) =>
          credential.platform === "android" &&
          credential.id === selectedCredentialId,
      ) ?? null,
    [credentialSecrets, selectedCredentialId],
  );

  function updateCredentialSearchQuery(nextValue: string) {
    setCredentialSearchQuery(nextValue);
    void loadCredentialPage(1, { searchQuery: nextValue });
  }

  async function loadCredentialPage(
    page: number,
    overrides?: { searchQuery?: string },
  ) {
    const nextSearchQuery =
      overrides?.searchQuery ?? credentialSearchQuery;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(CONFIG_PAGE_SIZE),
      platform: platformFilter,
    });
    const search = nextSearchQuery.trim();

    if (search) params.set("search", search);

    setCredentialTableLoading(true);

    try {
      const response = await fetch(
        `/api/admin/credentials?${params.toString()}`,
      );
      const payload = (await response.json()) as CredentialListResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Load credential configs failed.");
      }

      setCredentialSecrets(payload.data);
      setCredentialPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? CONFIG_PAGE_SIZE,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Load credential configs failed.",
      );
    } finally {
      setCredentialTableLoading(false);
    }
  }

  function cacheVaultSecret(credentialId: string, secretText: string) {
    setVaultSecretCache((current) =>
      current[credentialId] === secretText
        ? current
        : { ...current, [credentialId]: secretText },
    );
  }

  function resetAndroidCredentialForm() {
    setAction("upsert");
    setSelectedCredentialId("new");
    setPlatform("android");
    setSecretType("apple_asc_p8");
    setSecretFormat("json");
    setSelectedRef("");
    setStoreName("");
    setLinkStore("");
    setAvatarUrl("");
    setSecretFile(null);
    setSelectedFileName("");
    setIosEditingGroup(null);
  }

  function resetIosCredentialForm() {
    setAction("upsert");
    setSelectedCredentialId("new");
    setPlatform("ios");
    setSecretType("apple_asc_p8");
    setSecretFormat("p8");
    setSelectedRef("");
    setStoreName("");
    setLinkStore("");
    setAvatarUrl("");
    setSecretFile(null);
    setSelectedFileName("");
    setIosReviewKeyId("");
    setIosIapKeyId("");
    setIosIssuerId("");
    setIosReviewFile(null);
    setIosIapFile(null);
    setIosFirebaseFile(null);
    setIosEditingGroup(null);
  }

  function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open);
    if (open && platformFilter === "ios") {
      resetIosCredentialForm();
    } else if (open && platform === "android") {
      resetAndroidCredentialForm();
    }
  }

  function selectCredential(nextValue: string) {
    setSelectedCredentialId(nextValue);

    if (nextValue === "new") {
      if (platformFilter) setPlatform(platformFilter);
      setSelectedRef("");
      setStoreName("");
      setLinkStore("");
      setAvatarUrl("");
      setSecretFile(null);
      setSelectedFileName("");
      setIosEditingGroup(null);
      return;
    }

    const credential = vaultOptions.find((item) => item.id === nextValue);
    if (!credential) return;

    const nextState = fillFromCredential(credential);
    setPlatform(nextState.platform);
    setSecretType(nextState.secretType ?? "apple_asc_p8");
    setSecretFormat(nextState.secretFormat);
    setSelectedRef(nextState.selectedRef);
    setStoreName(nextState.storeName);
    setLinkStore(nextState.linkStore);
    setAvatarUrl(nextState.avatarUrl);
    setSecretFile(null);
    setSelectedFileName("");
    setIosEditingGroup(null);
  }

  function editAndroidCredential(credential: CredentialSecretMetadata) {
    const metadata = credentialConfigMetadata(credential);
    setAction("upsert");
    setSelectedCredentialId(credential.id);
    setPlatform("android");
    setSecretType("apple_asc_p8");
    setSecretFormat("json");
    setSelectedRef(credential.credential_ref);
    setStoreName(credential.store_account_name ?? "");
    setLinkStore(metadata.linkStore);
    setAvatarUrl(metadata.avatarUrl);
    setSecretFile(null);
    setSelectedFileName("");
    setSheetOpen(true);
  }

  function editIosCredentialGroup(group: IosCredentialGroup) {
    setAction("upsert");
    setSelectedCredentialId(group.id);
    setPlatform("ios");
    setSecretType("apple_asc_p8");
    setSecretFormat("p8");
    setSelectedRef("");
    setStoreName(group.storeName);
    setLinkStore(group.linkStore);
    setAvatarUrl(group.avatarUrl);
    setIosReviewKeyId(group.keyReview?.key_id ?? "");
    setIosIapKeyId(group.keyIap?.key_id ?? "");
    setIosIssuerId(group.keyReview?.issuer_id ?? group.keyIap?.issuer_id ?? "");
    setSecretFile(null);
    setSelectedFileName("");
    setIosReviewFile(null);
    setIosIapFile(null);
    setIosFirebaseFile(null);
    setIosEditingGroup(group);
    setSheetOpen(true);
  }

  async function patchCredentialStatus(
    credential: CredentialSecretMetadata,
    platformValue: MobilePlatform,
    nextStatus: "active" | "disabled",
  ) {
    const response = await fetch("/api/admin/credentials", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: credential.id,
        platform: platformValue,
        status: nextStatus,
      }),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      message?: string;
      error?: string;
    };

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? "Credential status update failed.");
    }
  }

  async function toggleAndroidCredentialStatus(
    credential: CredentialSecretMetadata,
  ) {
    const nextStatus = isActiveCredentialStatus(credential.status)
      ? "disabled"
      : "active";
    setPendingActionId(credential.id);

    try {
      await patchCredentialStatus(credential, "android", nextStatus);
      toast.success(
        `Android credential has been set to ${credentialStatusLabel(nextStatus)}.`,
      );
      await loadCredentialPage(credentialPagination.page);
      router.refresh();
      setStatusConfirmTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Credential status update failed.",
      );
    } finally {
      setPendingActionId(null);
    }
  }

  async function toggleIosCredentialGroupStatus(group: IosCredentialGroup) {
    const nextStatus =
      credentialGroupStatus(group) === "active" ? "disabled" : "active";
    setPendingActionId(group.id);

    try {
      await Promise.all(
        group.credentials.map((credential) =>
          patchCredentialStatus(credential, "ios", nextStatus),
        ),
      );

      toast.success(
        `iOS credential group has been set to ${credentialStatusLabel(nextStatus)}.`,
      );
      await loadCredentialPage(credentialPagination.page);
      router.refresh();
      setStatusConfirmTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Credential status update failed.",
      );
    } finally {
      setPendingActionId(null);
    }
  }

  async function confirmStatusToggle() {
    if (!statusConfirmTarget) return;

    if (statusConfirmTarget.platform === "android") {
      await toggleAndroidCredentialStatus(statusConfirmTarget.credential);
      return;
    }

    await toggleIosCredentialGroupStatus(statusConfirmTarget.group);
  }

  function openHardDelete(target: ConfigViewTarget) {
    setHardDeleteTarget(target);
    setHardDeleteConfirmationName("");
  }

  async function confirmHardDelete() {
    if (!hardDeleteTarget || hardDeleteConfirmDisabled) return;

    const ids = hardDeleteTargetIds(hardDeleteTarget);
    const targetId =
      hardDeleteTarget.platform === "android"
        ? hardDeleteTarget.credential.id
        : hardDeleteTarget.group.id;
    setPendingActionId(targetId);

    try {
      const response = await fetch("/api/admin/credentials", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids,
          platform: hardDeleteTarget.platform,
          confirmationName: hardDeleteConfirmationName.trim(),
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Credential hard delete failed.");
      }

      setHardDeleteTarget(null);
      setHardDeleteConfirmationName("");
      setVaultSecretCache({});
      toast.success(payload.message ?? "Credential config hard deleted.");
      await loadCredentialPage(
        credentialSecrets.length <= ids.length && credentialPagination.page > 1
          ? credentialPagination.page - 1
          : credentialPagination.page,
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Credential hard delete failed.",
      );
    } finally {
      setPendingActionId(null);
    }
  }

  function changePlatform(nextValue: MobilePlatform) {
    if (platformFilter) return;

    setPlatform(nextValue);

    if (nextValue === "android") {
      resetAndroidCredentialForm();
      return;
    }

    if (!secretTypeSupportsPlatform(secretType, nextValue)) {
      const nextSecretType = "apple_asc_p8";
      setSecretType(nextSecretType);
      setSecretFormat(defaultSecretFormatForType(nextSecretType));
      if (selectedFileName)
        setSelectedRef(credentialRefFromFile(nextSecretType, selectedFileName));
    }
  }

  function changeSecretType(nextValue: SecretType) {
    const nextPlatform =
      platformFilter ?? defaultPlatformForSecretType(nextValue, platform);
    setSelectedCredentialId("new");
    setSecretType(nextValue);
    setPlatform(nextPlatform);
    setSecretFormat(defaultSecretFormatForType(nextValue));
    if (selectedFileName)
      setSelectedRef(credentialRefFromFile(nextValue, selectedFileName));
  }

  function selectSecretFile(file: File) {
    const lowerName = file.name.toLowerCase();

    if (
      isAndroidCredentialOnlyFlow &&
      !lowerName.endsWith(".json") &&
      file.type !== "application/json"
    ) {
      toast.error("Google Service Account must be a JSON file.");
      return;
    }

    setSecretFile(file);
    setSelectedFileName(file.name);
    if (!isAndroidCredentialOnlyFlow) {
      setSelectedCredentialId("new");
      setSelectedRef(credentialRefFromFile(secretType, file.name));
    } else if (storeName.trim()) {
      setSelectedRef(
        credentialRefFromStore("ANDROID_SERVICE_ACCOUNT", storeName),
      );
    }

    if (isAndroidCredentialOnlyFlow || lowerName.endsWith(".json")) {
      setSecretFormat("json");
    } else if (lowerName.endsWith(".p8")) {
      setSecretFormat("p8");
    } else {
      toast.error(
        "Credential file must be a JSON service account or Apple .p8 key.",
      );
      return;
    }

    toast.info(`${file.name} selected for secure upload.`);
  }

  function selectIosSecretFile(
    kind: "review" | "iap" | "firebase",
    file: File,
  ) {
    const lowerName = file.name.toLowerCase();

    if ((kind === "review" || kind === "iap") && !lowerName.endsWith(".p8")) {
      toast.error("Apple keys must be .p8 files.");
      return;
    }

    if (
      kind === "firebase" &&
      !lowerName.endsWith(".json") &&
      file.type !== "application/json"
    ) {
      toast.error("Key firebase-admin must be a JSON file.");
      return;
    }

    if (kind === "review") setIosReviewFile(file);
    if (kind === "iap") setIosIapFile(file);
    if (kind === "firebase") setIosFirebaseFile(file);
    toast.info(`${file.name} selected for secure upload.`);
  }

  async function patchCredentialMetadata(
    credential: CredentialSecretMetadata,
    fields: { keyId?: string | null; issuerId?: string | null },
  ) {
    const response = await fetch("/api/admin/credentials", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: credential.id,
        platform: "ios",
        storeAccountName: storeName,
        linkStore,
        avatarUrl,
        keyId: fields.keyId,
        issuerId: fields.issuerId,
        status: "active",
      }),
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? "Credential metadata update failed.");
    }
  }

  async function uploadIosCredential(
    secretType: Extract<
      SecretType,
      "apple_asc_p8" | "apple_iap_p8" | "firebase_service_account"
    >,
    file: File,
    options: {
      existingId?: string | null;
      existingRef?: string | null;
      keyId?: string;
    },
  ) {
    const keyId = options.keyId?.trim() ?? "";
    const credentialRef = credentialRefFromStore(
      iosCredentialRefPrefix(secretType),
      storeName,
    );
    const body = new FormData();
    if (options.existingId) body.set("id", options.existingId);
    if (iosEditingGroup?.storeProfileId)
      body.set("storeProfileId", iosEditingGroup.storeProfileId);
    body.set("credentialRef", options.existingRef || credentialRef);
    body.set("secretType", secretType);
    body.set("secretFormat", defaultSecretFormatForType(secretType));
    body.set("storePlatform", "apple_app_store");
    body.set("platform", "ios");
    body.set("storeAccountName", storeName);
    body.set("linkStore", linkStore);
    body.set("avatarUrl", avatarUrl);
    body.set("secretFile", file);

    if (keyId) body.set("keyId", keyId);
    if (secretType !== "firebase_service_account" && iosIssuerId.trim())
      body.set("issuerId", iosIssuerId.trim());

    const response = await fetch("/api/admin/credentials", {
      method: "POST",
      body,
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? "Credential upload failed.");
    }
  }

  async function submitIosCredentialGroup(formData: FormData | null) {
    const reviewFile =
      iosReviewFile ?? fileFromFormData(formData, "iosReviewFile");
    const iapFile = iosIapFile ?? fileFromFormData(formData, "iosIapFile");
    const firebaseFile =
      iosFirebaseFile ?? fileFromFormData(formData, "iosFirebaseFile");
    const hasAnyFile = Boolean(reviewFile || iapFile || firebaseFile);

    if (!storeName.trim()) {
      throw new Error("Store name is required.");
    }

    if (!hasAnyFile && !iosEditingGroup) {
      throw new Error("Upload at least one iOS credential file.");
    }

    if ((reviewFile || iapFile) && !iosIssuerId.trim()) {
      throw new Error("IssuerId is required when uploading Apple .p8 keys.");
    }

    if (iosEditingGroup) {
      const metadataUpdates = iosEditingGroup.credentials.filter(
        (credential) => {
          if (credential.secret_type === "apple_asc_p8") return !reviewFile;
          if (credential.secret_type === "apple_iap_p8") return !iapFile;
          if (credential.secret_type === "firebase_service_account")
            return !firebaseFile;
          return false;
        },
      );

      await Promise.all(
        metadataUpdates.map((credential) =>
          patchCredentialMetadata(credential, {
            keyId:
              credential.secret_type === "apple_asc_p8"
                ? iosReviewKeyId
                : credential.secret_type === "apple_iap_p8"
                  ? iosIapKeyId
                  : undefined,
            issuerId:
              credential.secret_type === "apple_asc_p8" ||
              credential.secret_type === "apple_iap_p8"
                ? iosIssuerId
                : undefined,
          }),
        ),
      );
    }

    if (reviewFile) {
      await uploadIosCredential("apple_asc_p8", reviewFile, {
        existingId: iosEditingGroup?.keyReview?.id,
        keyId: iosReviewKeyId,
        existingRef: iosEditingGroup?.keyReview?.credential_ref,
      });
    }

    if (iapFile) {
      await uploadIosCredential("apple_iap_p8", iapFile, {
        existingId: iosEditingGroup?.keyIap?.id,
        keyId: iosIapKeyId,
        existingRef: iosEditingGroup?.keyIap?.credential_ref,
      });
    }

    if (firebaseFile) {
      await uploadIosCredential("firebase_service_account", firebaseFile, {
        existingId: iosEditingGroup?.keyFirebase?.id,
        existingRef: iosEditingGroup?.keyFirebase?.credential_ref,
      });
    }

    setSheetOpen(false);
    resetIosCredentialForm();
    setVaultSecretCache({});
    toast.success("iOS credential vault has been saved.");
    await loadCredentialPage(credentialPagination.page);
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const submittedFormData = new FormData(event.currentTarget);

    try {
      if (isIosConfigCredentialView) {
        await submitIosCredentialGroup(submittedFormData);
        return;
      }

      const submittedSecretFile =
        secretFile ?? fileFromFormData(submittedFormData, "secretFile");
      const isAndroidMetadataUpdate =
        isAndroidCredentialOnlyFlow &&
        selectedCredentialId !== "new" &&
        !submittedSecretFile;

      if (effectiveAction === "upsert" && !submittedSecretFile) {
        if (!isAndroidMetadataUpdate) {
          throw new Error("Google Service Account JSON file is required.");
        }
      }

      if (isAndroidMetadataUpdate) {
        const response = await fetch("/api/admin/credentials", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: selectedCredentialId,
            credentialRef: selectedRef,
            platform: "android",
            storeAccountName: storeName,
            linkStore,
            avatarUrl,
            status: "active",
          }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          message?: string;
          error?: string;
        };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Credential operation failed.");
        }

        setSecretFile(null);
        setSelectedFileName("");
        setSheetOpen(false);
        toast.success(payload.message ?? "Credential metadata updated.");
        await loadCredentialPage(credentialPagination.page);
        router.refresh();
        return;
      }

      const body = new FormData();
      const targetCredentialRef =
        isAndroidCredentialOnlyFlow &&
        selectedCredentialId !== "new" &&
        selectedRef
          ? selectedRef
          : isAndroidCredentialOnlyFlow
            ? credentialRefFromStore("ANDROID_SERVICE_ACCOUNT", storeName)
            : selectedRef;

      body.set("credentialRef", targetCredentialRef);
      if (isAndroidCredentialOnlyFlow && selectedCredentialId !== "new") {
        body.set("id", selectedCredentialId);
      }
      if (!isAndroidCredentialOnlyFlow) {
        body.set("secretType", secretType);
        body.set("secretFormat", secretFormat);
      }
      body.set("storePlatform", storePlatformForMobilePlatform(platform));
      body.set("platform", platform);
      body.set("storeAccountName", storeName);
      if (isAndroidCredentialOnlyFlow) {
        const currentCredential = credentialSecrets.find(
          (credential) => credential.id === selectedCredentialId,
        );
        if (currentCredential?.store_profile_id) {
          body.set("storeProfileId", currentCredential.store_profile_id);
        }
        body.set("linkStore", linkStore);
        body.set("avatarUrl", avatarUrl);
      }
      if (submittedSecretFile) body.set("secretFile", submittedSecretFile);

      const response = await fetch("/api/admin/credentials", {
        method: effectiveAction === "delete" ? "DELETE" : "POST",
        body:
          effectiveAction === "delete"
            ? JSON.stringify({ credentialRef: selectedRef, platform })
            : body,
        headers:
          effectiveAction === "delete"
            ? { "content-type": "application/json" }
            : undefined,
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Credential operation failed.");
      }

      setSecretFile(null);
      setSelectedFileName("");
      setVaultSecretCache({});
      setSheetOpen(false);
      toast.success(payload.message ?? "Credential operation completed.");
      await loadCredentialPage(selectedCredentialId === "new" ? 1 : credentialPagination.page);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Credential operation failed.",
      );
    } finally {
      setPending(false);
    }
  }

  const statusTargetId =
    statusConfirmTarget?.platform === "android"
      ? statusConfirmTarget.credential.id
      : statusConfirmTarget?.group.id;
  const statusTargetName =
    statusConfirmTarget?.platform === "android"
      ? notAvailable(statusConfirmTarget.credential.store_account_name)
      : statusConfirmTarget
        ? notAvailable(statusConfirmTarget.group.storeName)
        : "";
  const statusTargetCurrent =
    statusConfirmTarget?.platform === "android"
      ? isActiveCredentialStatus(statusConfirmTarget.credential.status)
        ? "active"
        : "inactive"
      : statusConfirmTarget
        ? credentialGroupStatus(statusConfirmTarget.group)
        : "inactive";
  const statusTargetNext =
    statusTargetCurrent === "active" ? "inactive" : "active";
  const statusTargetCurrentLabel = credentialStatusLabel(statusTargetCurrent);
  const statusTargetNextLabel = credentialStatusLabel(statusTargetNext);
  const statusConfirmDisabled =
    !statusConfirmTarget ||
    pendingActionId === statusTargetId ||
    (statusConfirmTarget.platform === "ios" &&
      !statusConfirmTarget.group.credentials.length);
  const hardDeleteExpectedName = hardDeleteTargetName(hardDeleteTarget);
  const hardDeleteTargetId =
    hardDeleteTarget?.platform === "android"
      ? hardDeleteTarget.credential.id
      : hardDeleteTarget?.group.id;
  const hardDeleteConfirmDisabled =
    !hardDeleteTarget ||
    !hardDeleteTargetIsInactive(hardDeleteTarget) ||
    pendingActionId === hardDeleteTargetId ||
    hardDeleteConfirmationName.trim() !== hardDeleteExpectedName;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Configs / ${platformLabel} / Credentials`}
        title={`${platformLabel} credential config`}
        description={`Create ${platformLabel} provider credentials by store name, store secrets in Vault, then attach them to ${platformLabel} App Mapping.`}
        action={
          <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
            <SheetTrigger asChild>
              <Button>
                <Plus size={15} />
                {isAndroidCredentialOnlyFlow || isIosConfigCredentialView
                  ? "Add credential"
                  : "Add / rotate credential"}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="gap-0 p-0 data-[side=right]:w-full md:data-[side=right]:w-[40vw] md:data-[side=right]:max-w-none"
            >
              <SheetHeader className="border-b px-5 py-4">
                <SheetTitle>Credential config form</SheetTitle>
              </SheetHeader>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                <form
                  className="space-y-4"
                  autoComplete="off"
                  onSubmit={submit}
                >
                  {controlFieldCount ? (
                    <div className={controlGridClass}>
                      {showActionField ? (
                        <div className="grid gap-2">
                          <Label htmlFor="action">Action</Label>
                          <Select
                            value={action}
                            onValueChange={(nextValue) =>
                              setAction(nextValue as CredentialAction)
                            }
                          >
                            <SelectTrigger id="action" className="h-9 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="upsert">
                                Create / rotate
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}

                      {showPlatformField ? (
                        <div className="grid gap-2">
                          <Label htmlFor="platform">Platform</Label>
                          <Select
                            value={platform}
                            onValueChange={(nextValue) =>
                              changePlatform(nextValue as MobilePlatform)
                            }
                          >
                            <SelectTrigger id="platform" className="h-9 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="android">Android</SelectItem>
                              <SelectItem value="ios">iOS</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}

                      {showSecretTypeField ? (
                        <div className="grid gap-2">
                          <Label htmlFor="secretType">Secret type</Label>
                          <Select
                            value={secretType}
                            onValueChange={(nextValue) =>
                              changeSecretType(nextValue as SecretType)
                            }
                          >
                            <SelectTrigger
                              id="secretType"
                              className="h-9 w-full"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {secretTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {SECRET_TYPE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    <Label htmlFor="storeName">Store name</Label>
                    <Input
                      id="storeName"
                      value={storeName}
                      onChange={(event) => setStoreName(event.target.value)}
                      placeholder={
                        platform === "android"
                          ? "Google Play store/account name"
                          : "App Store Connect store/account name"
                      }
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      required={effectiveAction === "upsert"}
                    />
                  </div>

                  {isAndroidCredentialOnlyFlow || isIosConfigCredentialView ? (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="linkStore">
                          Link store{" "}
                          <span className="text-muted-foreground">
                            (optional)
                          </span>
                        </Label>
                        <Input
                          id="linkStore"
                          type="url"
                          value={linkStore}
                          onChange={(event) => setLinkStore(event.target.value)}
                          placeholder={
                            platform === "ios"
                              ? "https://apps.apple.com/app/id..."
                              : "https://play.google.com/store/apps/details?id=..."
                          }
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore="true"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="avatarUrl">
                          Avatar{" "}
                          <span className="text-muted-foreground">
                            (optional)
                          </span>
                        </Label>
                        <Input
                          id="avatarUrl"
                          type="url"
                          value={avatarUrl}
                          onChange={(event) => setAvatarUrl(event.target.value)}
                          placeholder="https://.../store-avatar.png"
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore="true"
                        />
                      </div>

                    </>
                  ) : null}

                  {showExistingCredentialField ? (
                    <div className="grid gap-2">
                      <Label htmlFor="existingCredential">
                        Existing credential
                      </Label>
                      <Select
                        value={selectedCredentialId}
                        onValueChange={selectCredential}
                      >
                        <SelectTrigger
                          id="existingCredential"
                          className="h-9 w-full"
                        >
                          <SelectValue placeholder="Create new credential ref" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">
                            Create new credential ref
                          </SelectItem>
                          {vaultOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  {!isAndroidCredentialOnlyFlow &&
                  !isIosConfigCredentialView ? (
                    <div className="grid gap-2">
                      <Label htmlFor="credentialRef">Credential ref</Label>
                      <Input
                        id="credentialRef"
                        className="font-mono text-xs"
                        placeholder="APPLE_ASC_KEY_P8__team__key_id"
                        value={selectedRef}
                        onChange={(event) => {
                          setSelectedCredentialId("new");
                          setSelectedRef(event.target.value);
                        }}
                        required
                      />
                    </div>
                  ) : null}

                  {isIosConfigCredentialView ? (
                    <>
                      <SensitiveInput
                        id="iosIssuerId"
                        label="IssuerId"
                        value={iosIssuerId}
                        onChange={setIosIssuerId}
                        placeholder="App Store Connect issuer id"
                      />

                      <fieldset className="space-y-3 rounded-lg border p-3">
                        <legend className="px-1 text-sm font-medium">
                          Key Review
                        </legend>
                        <InputField
                          id="iosReviewKeyId"
                          label="Key Review ID (optional)"
                          value={iosReviewKeyId}
                          onChange={setIosReviewKeyId}
                          placeholder="ASC key id for reviews"
                        />
                        <CredentialFileDropzone
                          id="iosReviewFile"
                          label="Key Review (optional)"
                          accept=".p8"
                          fileName={iosReviewFile?.name ?? ""}
                          onFile={(file) => selectIosSecretFile("review", file)}
                        />
                        {iosEditingGroup?.keyReview ? (
                          <SecretContentViewer
                            credential={iosEditingGroup.keyReview}
                            platform="ios"
                            label="Current Key Review"
                            secretText={
                              vaultSecretCache[iosEditingGroup.keyReview.id]
                            }
                            onSecretLoaded={cacheVaultSecret}
                          />
                        ) : null}
                      </fieldset>

                      <fieldset className="space-y-3 rounded-lg border p-3">
                        <legend className="px-1 text-sm font-medium">
                          Key IAP
                        </legend>
                        <InputField
                          id="iosIapKeyId"
                          label="Key IAP ID (optional)"
                          value={iosIapKeyId}
                          onChange={setIosIapKeyId}
                          placeholder="ASC key id for IAP"
                        />
                        <CredentialFileDropzone
                          id="iosIapFile"
                          label="Key IAP (optional)"
                          accept=".p8"
                          fileName={iosIapFile?.name ?? ""}
                          onFile={(file) => selectIosSecretFile("iap", file)}
                        />
                        {iosEditingGroup?.keyIap ? (
                          <SecretContentViewer
                            credential={iosEditingGroup.keyIap}
                            platform="ios"
                            label="Current Key IAP"
                            secretText={
                              vaultSecretCache[iosEditingGroup.keyIap.id]
                            }
                            onSecretLoaded={cacheVaultSecret}
                          />
                        ) : null}
                      </fieldset>

                      <fieldset className="space-y-3 rounded-lg border p-3">
                        <legend className="px-1 text-sm font-medium">
                          Key Firebase
                        </legend>
                        <CredentialFileDropzone
                          id="iosFirebaseFile"
                          label="Key firebase-admin (optional)"
                          accept=".json,application/json"
                          fileName={iosFirebaseFile?.name ?? ""}
                          onFile={(file) =>
                            selectIosSecretFile("firebase", file)
                          }
                        />
                        {iosEditingGroup?.keyFirebase ? (
                          <SecretContentViewer
                            credential={iosEditingGroup.keyFirebase}
                            platform="ios"
                            label="Current key firebase-admin"
                            secretText={
                              vaultSecretCache[iosEditingGroup.keyFirebase.id]
                            }
                            onSecretLoaded={cacheVaultSecret}
                          />
                        ) : null}
                      </fieldset>
                    </>
                  ) : effectiveAction === "upsert" ? (
                    <>
                      <CredentialFileDropzone
                        id="secretFile"
                        label={
                          isAndroidCredentialOnlyFlow
                            ? "Google Service Account JSON"
                            : "Secret file"
                        }
                        accept={
                          isAndroidCredentialOnlyFlow
                            ? ".json,application/json"
                            : ".json,.p8,application/json"
                        }
                        fileName={selectedFileName}
                        onFile={selectSecretFile}
                      />
                      {isAndroidCredentialOnlyFlow &&
                      selectedAndroidCredential ? (
                        <SecretContentViewer
                          credential={selectedAndroidCredential}
                          platform="android"
                          label="Current Google Service Account JSON"
                          secretText={
                            vaultSecretCache[selectedAndroidCredential.id]
                          }
                          onSecretLoaded={cacheVaultSecret}
                        />
                      ) : null}
                    </>
                  ) : (
                    <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                      <AlertTitle>Delete impact</AlertTitle>
                      <AlertDescription className="text-amber-900">
                        Deleting the credential revokes its Vault secret and may
                        remove readiness/runtime credentials from mappings that
                        still reference it.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button disabled={pending} className="w-full">
                    {pending ? (
                      <Spinner />
                    ) : effectiveAction === "delete" ? (
                      <Trash2 size={15} />
                    ) : (
                      <RotateCcw size={15} />
                    )}
                    {pending
                      ? "Processing..."
                      : effectiveAction === "delete"
                        ? "Delete credential"
                        : "Save Vault credential"}
                  </Button>
                </form>
              </div>
            </SheetContent>
          </Sheet>
        }
      />

      <Sheet
        open={Boolean(viewTarget)}
        onOpenChange={(open) => !open && setViewTarget(null)}
      >
        <SheetContent
          side="right"
          className="gap-0 p-0 data-[side=right]:w-full md:data-[side=right]:w-[42vw] md:data-[side=right]:max-w-none"
        >
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle>Credential config details</SheetTitle>
            <SheetDescription>
              Config fields mirror the add form. Vault key content loads only
              when an Admin requests it.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {viewTarget ? (
              <ConfigViewContent
                target={viewTarget}
                secretCache={vaultSecretCache}
                onSecretLoaded={cacheVaultSecret}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(statusConfirmTarget)}
        onOpenChange={(open) => {
          if (!open && !pendingActionId) setStatusConfirmTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusTargetNext === "active"
                ? "Activate credential config?"
                : "Deactivate credential config?"}
            </DialogTitle>
            <DialogDescription>
              {statusTargetName} is currently {statusTargetCurrentLabel}.
              Confirm to change it to {statusTargetNextLabel}.
              {statusTargetNext === "inactive"
                ? " Existing mappings that depend on this config may stop using this key."
                : " This config will become selectable and usable again."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(pendingActionId)}
              onClick={() => setStatusConfirmTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={statusConfirmDisabled}
              onClick={confirmStatusToggle}
            >
              {pendingActionId === statusTargetId ? (
                <Spinner />
              ) : statusTargetNext === "active" ? (
                <Power size={15} />
              ) : (
                <PowerOff size={15} />
              )}
              {statusTargetNext === "active" ? "Activate" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(hardDeleteTarget)}
        onOpenChange={(open) => {
          if (!open && !pendingActionId) {
            setHardDeleteTarget(null);
            setHardDeleteConfirmationName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hard delete credential config?</DialogTitle>
            <DialogDescription>
              This will delete the Vault secret and permanently delete the
              credential record from the app database. To confirm, type the
              exact store name below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="hardDeleteConfirmationName">
              Type `{hardDeleteExpectedName}` to confirm
            </Label>
            <Input
              id="hardDeleteConfirmationName"
              value={hardDeleteConfirmationName}
              onChange={(event) =>
                setHardDeleteConfirmationName(event.target.value)
              }
              placeholder={hardDeleteExpectedName}
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(pendingActionId)}
              onClick={() => {
                setHardDeleteTarget(null);
                setHardDeleteConfirmationName("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={hardDeleteConfirmDisabled}
              onClick={confirmHardDelete}
            >
              {pendingActionId === hardDeleteTargetId ? (
                <Spinner />
              ) : (
                <Trash2 size={15} />
              )}
              Hard delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isAndroidConfigCredentialView ? (
        <Card className="rounded-lg">
          <CardHeader className="gap-3 border-b">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                Credential config
                {credentialTableLoading ? (
                  <Spinner className="size-4" />
                ) : null}
              </CardTitle>
              <div className="relative sm:w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={credentialSearchQuery}
                  onChange={(event) =>
                    updateCredentialSearchQuery(event.target.value)
                  }
                  placeholder="Search stores or credentials..."
                  className="h-9 pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <Table className="min-w-[1040px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Avatar</TableHead>
                  <TableHead>Store name</TableHead>
                  <TableHead>Service account JSON</TableHead>
                  <TableHead>Vault</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated at</TableHead>
                  <TableHead className="w-[208px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credentialSecrets.map((secret) => {
                  const metadata = credentialConfigMetadata(secret);

                  return (
                    <TableRow
                      key={secret.id}
                      className={configRowClass(
                        secret.status,
                        Boolean(secret.vault_secret_name),
                      )}
                    >
                      <TableCell className="pl-4">
                        <AvatarPreview src={metadata.avatarUrl} />
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[260px] items-center gap-2">
                          <span className="min-w-0 truncate font-medium">
                            {notAvailable(secret.store_account_name)}
                          </span>
                          <InlineStoreLink
                            href={metadata.linkStore}
                            storeName={secret.store_account_name}
                          />
                        </div>
                      </TableCell>
                      <TableCell>{keyPresence(secret)}</TableCell>
                      <TableCell>
                        {secret.vault_secret_name ? (
                          <>
                            <div className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                              {secret.vault_secret_name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              v{secret.vault_secret_version}
                            </div>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            N/A
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={displayCredentialStatus(secret.status)}
                        />
                      </TableCell>
                      <TableCell>{dateTime(secret.updated_at)}</TableCell>
                      <TableCell className="align-middle">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="View credential"
                            onClick={() =>
                              setViewTarget({
                                platform: "android",
                                credential: secret,
                              })
                            }
                          >
                            <Eye size={14} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Edit credential"
                            onClick={() => editAndroidCredential(secret)}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title={
                              isActiveCredentialStatus(secret.status)
                                ? "Deactivate credential"
                                : "Activate credential"
                            }
                            disabled={pendingActionId === secret.id}
                            onClick={() =>
                              setStatusConfirmTarget({
                                platform: "android",
                                credential: secret,
                              })
                            }
                          >
                            {pendingActionId === secret.id ? (
                              <Spinner />
                            ) : isActiveCredentialStatus(secret.status) ? (
                              <PowerOff size={14} />
                            ) : (
                              <Power size={14} />
                            )}
                          </Button>
                          {!isActiveCredentialStatus(secret.status) ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              title="Hard delete credential"
                              disabled={pendingActionId === secret.id}
                              onClick={() =>
                                openHardDelete({
                                  platform: "android",
                                  credential: secret,
                                })
                              }
                            >
                              <Trash2 size={14} />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!credentialSecrets.length ? (
                  <TableEmptyState
                    colSpan={8}
                    icon={KeyRound}
                    title="No credentials"
                    description="Add a Google Service Account JSON key to create the first Android credential."
                  />
                ) : null}
              </TableBody>
            </Table>
            <TablePaginationFooter
              from={
                (credentialPagination.page - 1) *
                  credentialPagination.pageSize +
                1
              }
              onPageChange={(page) => void loadCredentialPage(page)}
              page={credentialPagination.page}
              shown={credentialSecrets.length}
              to={
                (credentialPagination.page - 1) *
                  credentialPagination.pageSize +
                credentialSecrets.length
              }
              total={credentialPagination.total}
              totalPages={credentialPagination.totalPages}
            />
          </CardContent>
        </Card>
      ) : isIosConfigCredentialView ? (
        <Card className="rounded-lg">
          <CardHeader className="gap-3 border-b">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                Credential config
                {credentialTableLoading ? (
                  <Spinner className="size-4" />
                ) : null}
              </CardTitle>
              <div className="relative sm:w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={credentialSearchQuery}
                  onChange={(event) =>
                    updateCredentialSearchQuery(event.target.value)
                  }
                  placeholder="Search stores or credentials..."
                  className="h-9 pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <Table className="min-w-[1240px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Avatar</TableHead>
                  <TableHead>Store name</TableHead>
                  <TableHead>Issuer ID</TableHead>
                  <TableHead>Key IAP</TableHead>
                  <TableHead>Key Review</TableHead>
                  <TableHead>Key Firebase</TableHead>
                  <TableHead>Vault</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated at</TableHead>
                  <TableHead className="w-[208px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {iosCredentialGroups.map((group) => (
                  <TableRow
                    key={group.id}
                    className={configRowClass(
                      credentialGroupStatus(group),
                      group.credentials.some((credential) =>
                        Boolean(credential.vault_secret_name),
                      ),
                    )}
                  >
                    <TableCell className="pl-4">
                      <AvatarPreview src={group.avatarUrl} />
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-[260px] items-center gap-2">
                        <span className="min-w-0 truncate font-medium">
                          {notAvailable(group.storeName)}
                        </span>
                        <InlineStoreLink
                          href={group.linkStore}
                          storeName={group.storeName}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-[220px] truncate text-muted-foreground">
                        {notAvailable(group.issuerId)}
                      </span>
                    </TableCell>
                    <TableCell>{keyPresence(group.keyIap)}</TableCell>
                    <TableCell>{keyPresence(group.keyReview)}</TableCell>
                    <TableCell>{keyPresence(group.keyFirebase)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {group.credentials.length ? (
                          group.credentials.slice(0, 3).map((credential) => (
                            <div
                              key={credential.id}
                              className="max-w-[220px] truncate font-mono text-xs text-muted-foreground"
                            >
                              {credential.vault_secret_name
                                ? `${credential.vault_secret_name} v${credential.vault_secret_version}`
                                : "N/A"}
                            </div>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            N/A
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={credentialGroupStatus(group)} />
                    </TableCell>
                    <TableCell>{dateTime(group.updatedAt)}</TableCell>
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="View credential"
                          onClick={() =>
                            setViewTarget({ platform: "ios", group })
                          }
                        >
                          <Eye size={14} />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="Update credential"
                          onClick={() => editIosCredentialGroup(group)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title={
                            credentialGroupStatus(group) === "active"
                              ? "Deactivate credential group"
                              : "Activate credential group"
                          }
                          disabled={
                            pendingActionId === group.id ||
                            !group.credentials.length
                          }
                          onClick={() =>
                            setStatusConfirmTarget({ platform: "ios", group })
                          }
                        >
                          {pendingActionId === group.id ? (
                            <Spinner />
                          ) : credentialGroupStatus(group) === "active" ? (
                            <PowerOff size={14} />
                          ) : (
                            <Power size={14} />
                          )}
                        </Button>
                        {credentialGroupStatus(group) !== "active" &&
                        group.credentials.length ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            title="Hard delete credential group"
                            disabled={pendingActionId === group.id}
                            onClick={() =>
                              openHardDelete({ platform: "ios", group })
                            }
                          >
                            <Trash2 size={14} />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!iosCredentialGroups.length ? (
                  <TableEmptyState
                    colSpan={10}
                    icon={KeyRound}
                    title="No credentials"
                    description="Add iOS review, IAP or firebase-admin keys to create the first credential group."
                  />
                ) : null}
              </TableBody>
            </Table>
            <TablePaginationFooter
              from={
                (credentialPagination.page - 1) *
                  credentialPagination.pageSize +
                1
              }
              onPageChange={(page) => void loadCredentialPage(page)}
              page={credentialPagination.page}
              shown={iosCredentialGroups.length}
              to={
                (credentialPagination.page - 1) *
                  credentialPagination.pageSize +
                iosCredentialGroups.length
              }
              total={credentialPagination.total}
              totalPages={credentialPagination.totalPages}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
