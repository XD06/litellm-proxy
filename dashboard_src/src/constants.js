export const timeRanges = {
  "30m": { label: "Last 30 minutes", bucket_s: 60, buckets: 30 },
  "2h": { label: "Last 2 hours", bucket_s: 120, buckets: 60 },
  "24h": { label: "Last 24 hours", bucket_s: 900, buckets: 96 },
  "7d": { label: "Last 7 days", bucket_s: 3600, buckets: 168 },
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
    title: "Overview",
    subtitle: "Live runtime health and request flow.",
  },
  requests: {
    title: "Requests",
    subtitle: "request failure details.",
  },
  providers: {
    title: "Providers",
    subtitle: "Runtime provider and key state.",
  },
  policy: {
    title: "Routing Policy",
    subtitle: "switching rules.",
  },
  config: {
    title: "Config",
    subtitle: "configuration and safe edits",
  },
  playground: {
    title: "Playground",
    subtitle: "Test models with live routing feedback.",
  },
};
