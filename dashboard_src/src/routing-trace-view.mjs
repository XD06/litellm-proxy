const CANDIDATE_FILTER_CODES = new Set([
  "compatibility_circuit",
  "duplicate_candidate",
  "key_cooldown",
  "key_disabled",
  "model_unsupported_by_key",
  "provider_cooldown",
]);

function normalizedEvent(event) {
  return event && typeof event === "object" ? event : {};
}

function groupKind(event) {
  if (event.stage === "format_compatibility") return "format_evaluation";
  if (event.stage === "routing" && CANDIDATE_FILTER_CODES.has(event.code)) return "candidate_filter";
  return "event";
}

function summarizeGroup(group) {
  const events = group.events;
  group.eventCount = events.length;
  group.codes = [...new Set(events.map((event) => event.code).filter(Boolean))];
  group.formats = [...new Set(events.map((event) => event.target_format || event.upstream_format).filter(Boolean))];
  group.providers = [...new Set(events.map((event) => event.provider).filter(Boolean))];
  if (group.kind === "format_evaluation") {
    group.eligibleFormats = [...new Set(events
      .filter((event) => event.code === "format_eligible")
      .map((event) => event.target_format)
      .filter(Boolean))];
    group.blockedFormats = [...new Set(events
      .filter((event) => event.code === "format_blocked_by_parameter")
      .map((event) => event.target_format)
      .filter(Boolean))];
    group.mappedCount = events.filter((event) => event.code === "format_parameter_mapped").length;
    group.droppedCount = events.filter((event) => event.code === "format_hint_dropped").length;
  }
  return group;
}

/**
 * Merge only adjacent diagnostic events. The original order remains intact,
 * while repetitive format checks and candidate rejections become one visual step.
 */
export function groupRoutingTrace(rawTrace) {
  const trace = Array.isArray(rawTrace) ? rawTrace.map(normalizedEvent) : [];
  const groups = [];
  trace.forEach((event, rawIndex) => {
    const kind = groupKind(event);
    const previous = groups[groups.length - 1];
    if (kind !== "event" && previous?.kind === kind) {
      previous.events.push(event);
      previous.rawIndexes.push(rawIndex);
      return;
    }
    groups.push({
      kind,
      stage: event.stage || "routing",
      code: event.code || "unknown",
      event,
      events: [event],
      rawIndexes: [rawIndex],
    });
  });
  return groups.map(summarizeGroup);
}

export function routingTraceTone(step) {
  if (!step || typeof step !== "object") return "neutral";
  if (step.kind === "format_evaluation") {
    if (step.eligibleFormats?.length) return step.blockedFormats?.length || step.droppedCount ? "warn" : "ok";
    return step.blockedFormats?.length ? "bad" : "neutral";
  }
  if (step.kind === "candidate_filter") return "warn";
  const code = String(step.code || "");
  if (code === "selected" || code === "attempt_succeeded") return "ok";
  if (code === "attempt_failed" || code === "no_candidate" || code === "format_blocked_by_parameter") return "bad";
  if (CANDIDATE_FILTER_CODES.has(code) || code === "format_hint_dropped") return "warn";
  return "neutral";
}

export function routingTraceIdentity(event) {
  const item = normalizedEvent(event);
  return [
    item.provider,
    item.key_masked || item.key_id,
    item.provider_model || item.canonical_model,
    item.target_format || item.upstream_format,
  ].filter(Boolean);
}

export function summarizeFormatTraceStep(step, { clientFormat = "", finalFormat = "" } = {}) {
  const events = Array.isArray(step?.events) ? step.events : [];
  const sourceFormat = String(clientFormat || "");
  const hasFinalFormat = Boolean(finalFormat);
  const targetFormat = String(finalFormat || sourceFormat || "");
  const blockedByFormat = new Map();
  events.forEach((event) => {
    if (event.code !== "format_blocked_by_parameter" || !event.target_format) return;
    if (!blockedByFormat.has(event.target_format)) blockedByFormat.set(event.target_format, new Set());
    if (event.field) blockedByFormat.get(event.target_format).add(String(event.field));
  });
  const blocked = [...blockedByFormat.entries()].map(([format, fields]) => ({
    format,
    fields: [...fields],
  }));
  const selectedEvents = events.filter((event) => !targetFormat || event.target_format === targetFormat);
  const transformations = selectedEvents
    .filter((event) => event.code === "format_parameter_mapped")
    .map((event) => ({ field: event.field || "", target: event.target || "", action: event.action || "" }));
  const droppedHints = selectedEvents
    .filter((event) => event.code === "format_hint_dropped")
    .map((event) => ({ field: event.field || "", action: event.action || "" }));
  const converted = Boolean(sourceFormat && targetFormat && sourceFormat !== targetFormat);
  const mode = converted
    ? "converted"
    : (blocked.length ? "blocked" : (hasFinalFormat && sourceFormat ? "native" : "unrestricted"));
  return {
    mode,
    sourceFormat,
    targetFormat,
    path: [sourceFormat, converted ? targetFormat : ""].filter(Boolean),
    blocked,
    transformations,
    droppedHints,
  };
}
