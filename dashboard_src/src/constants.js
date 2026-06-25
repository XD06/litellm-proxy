import { t } from "./i18n.js";

export const timeRanges = {
  "30m": { get label() { return t("ov.last_30m"); }, bucket_s: 60, buckets: 30 },
  "2h": { get label() { return t("ov.last_2h"); }, bucket_s: 120, buckets: 60 },
  "24h": { get label() { return t("ov.last_24h"); }, bucket_s: 900, buckets: 96 },
  "7d": { get label() { return t("ov.last_7d"); }, bucket_s: 3600, buckets: 168 },
};

export const REQUEST_PAGE_SIZE = 10;
export const PROVIDERS_PAGE_SIZE = 6;
export const CONFIG_PROVIDERS_PAGE_SIZE = 8;
export const MODEL_ROUTES_PAGE_SIZE = 8;
export const PROVIDER_MODEL_MAP_PAGE_SIZE = 6;
export const AUDIT_PAGE_SIZE = 8;
export const OVERVIEW_PROVIDER_LIMIT = 5;
export const OVERVIEW_FAILURE_LIMIT = 5;
export const USAGE_MODEL_LIMIT = 5;

export const views = {
  overview: {
    get title() { return t("view.overview.title"); },
    get subtitle() { return t("view.overview.subtitle"); },
  },
  requests: {
    get title() { return t("view.requests.title"); },
    get subtitle() { return t("view.requests.subtitle"); },
  },
  providers: {
    get title() { return t("view.providers.title"); },
    get subtitle() { return t("view.providers.subtitle"); },
  },
  policy: {
    get title() { return t("view.policy.title"); },
    get subtitle() { return t("view.policy.subtitle"); },
  },
  config: {
    get title() { return t("view.config.title"); },
    get subtitle() { return t("view.config.subtitle"); },
  },
  playground: {
    get title() { return t("view.playground.title"); },
    get subtitle() { return t("view.playground.subtitle"); },
  },
};
