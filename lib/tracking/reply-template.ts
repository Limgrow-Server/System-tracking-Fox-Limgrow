export const MAX_REVIEW_REPLY_TEXT_LENGTH = 350;

export const REVIEW_REPLY_TEMPLATE_TOKENS = [
  {
    description: "Reviewer display name",
    label: "Author",
    searchTerms: ["author", "author_name", "name", "reviewer"],
    token: "{{authorName}}",
  },
  {
    description: "Current app name",
    label: "App",
    searchTerms: ["app", "app_name"],
    token: "{{appName}}",
  },
  {
    description: "Store profile name",
    label: "Store",
    searchTerms: ["store", "store_name"],
    token: "{{storeName}}",
  },
  {
    description: "Store contact email",
    label: "Email",
    searchTerms: ["contact", "contact_email", "email"],
    token: "{{contactEmail}}",
  },
  {
    description: "Store support phone",
    label: "Phone",
    searchTerms: ["phone", "support", "support_phone"],
    token: "{{supportPhone}}",
  },
  {
    description: "Store website URL",
    label: "Website",
    searchTerms: ["website", "website_url", "url"],
    token: "{{websiteUrl}}",
  },
] as const;

export type ReviewReplyTemplateContext = {
  appName?: string | null;
  authorName?: string | null;
  contactEmail?: string | null;
  storeName?: string | null;
  supportPhone?: string | null;
  websiteUrl?: string | null;
};

function clean(value: string | number | null | undefined) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function renderReviewReplyTemplate(
  templateText: string,
  context: ReviewReplyTemplateContext,
) {
  const replacements: Array<[string, string]> = [
    ["{{appName}}", clean(context.appName) || "this app"],
    ["{{authorName}}", clean(context.authorName) || "there"],
    ["{{contactEmail}}", clean(context.contactEmail)],
    ["{{storeName}}", clean(context.storeName)],
    ["{{supportPhone}}", clean(context.supportPhone)],
    ["{{websiteUrl}}", clean(context.websiteUrl)],
  ];

  return replacements
    .reduce(
      (text, [token, value]) => text.replaceAll(token, value),
      templateText,
    )
    .trim();
}
