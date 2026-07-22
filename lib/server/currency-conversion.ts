import "server-only";

const TARGET_CURRENCY = "VND";
const RATE_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_CONVERSION_URL = "https://live-earth-map.limgrow.com/money/convert";

type CachedRate = {
  expiresAt: number;
  rate: number;
};

const rateCache = new Map<string, CachedRate>();
const pendingRateRequests = new Map<string, Promise<number>>();

function conversionUrl() {
  return (
    process.env.IAP_CURRENCY_CONVERSION_API_URL?.trim() ||
    DEFAULT_CONVERSION_URL
  );
}

function normalizeCurrency(currency: string | null | undefined) {
  const normalized = currency?.trim().toUpperCase();
  return normalized || TARGET_CURRENCY;
}

async function fetchVndRate(currency: string) {
  if (currency === TARGET_CURRENCY) return 1;

  const cached = rateCache.get(currency);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  const pending = pendingRateRequests.get(currency);
  if (pending) return pending;

  const request = fetch(conversionUrl(), {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: 1,
      base: currency,
      target: TARGET_CURRENCY,
    }),
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Currency conversion failed with ${response.status}`);
      }

      const payload = (await response.json()) as { data?: unknown };
      const rate = Number(payload.data);

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`Invalid VND conversion rate for ${currency}`);
      }

      rateCache.set(currency, {
        expiresAt: Date.now() + RATE_CACHE_TTL_MS,
        rate,
      });

      return rate;
    })
    .finally(() => {
      pendingRateRequests.delete(currency);
    });

  pendingRateRequests.set(currency, request);
  return request;
}

export async function convertCurrencyAmountToVnd(
  amount: number,
  currency: string | null | undefined,
) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  const normalizedCurrency = normalizeCurrency(currency);
  if (normalizedCurrency === TARGET_CURRENCY) return amount;

  try {
    const rate = await fetchVndRate(normalizedCurrency);
    return amount * rate;
  } catch (error) {
    console.warn(
      `[currency-conversion] Could not convert ${normalizedCurrency} to ${TARGET_CURRENCY}.`,
      error,
    );
    return 0;
  }
}
