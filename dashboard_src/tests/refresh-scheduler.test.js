const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

assert.match(source, /async function refreshRuntimeData\(/, 'runtime refresh domain must exist');
assert.match(source, /async function refreshStaticAdminData\(/, 'static admin refresh domain must exist');
assert.match(source, /async function refreshCapabilitiesOnly\(/, 'capability-only refresh must exist');
const capabilityRefreshBody = source.slice(
  source.indexOf('async function refreshCapabilitiesOnly('),
  source.indexOf('function _maybeScheduleCapabilityFollowUp', source.indexOf('async function refreshCapabilitiesOnly(')),
);
assert.doesNotMatch(
  capabilityRefreshBody,
  /renderProviderDrawer\(\{ force: true \}\)/,
  'background capability refresh must not overwrite focused or dirty provider forms',
);
assert.match(
  capabilityRefreshBody,
  /renderProviderDrawer\(\)/,
  'background capability refresh must use the drawer dirty-input guard',
);
assert.doesNotMatch(
  source,
  /_capabilityFollowUpTimer = setTimeout[\s\S]{0,250}refreshAll\(/,
  'capability follow-up must not trigger a full refresh',
);
assert.match(
  source,
  /if \(!state\.paused && !document\.hidden\) refreshRuntimeData\(\)/,
  'timer must use the runtime domain and skip hidden pages',
);
assert.match(
  source,
  /const needRecentRing = !quiet \|\| !state\.data\.metricsFull \|\| state\.forceRequestsFetch/,
  'full recent ring must not be fetched on every quiet overview poll',
);
assert.match(
  source,
  /refreshArgs\.staticData[\s\S]{0,120}refreshStaticAdminData/,
  'background static refreshes must use the static data domain',
);
assert.match(
  source,
  /const RUNTIME_VIEW_REFRESH_MS = 15000/,
  'heavy view payloads must refresh less often than runtime core data',
);
assert.match(
  source,
  /const cacheKey = `\$\{name\}\\n\$\{version\}\\n\$\{modelsVersion\}`/,
  'model capability memoization must invalidate on capability-only refreshes',
);
assert.match(
  source,
  /if \(root && !\(active\.closest && active\.closest\(root\)\)\) return false/,
  'focused inputs must only protect the container they belong to',
);
assert.match(
  source,
  /data-refresh-safe-control/,
  'read-only model search and filter controls must allow background capability rendering',
);
assert.match(
  source,
  /\["routerSnapshot", apiGet\("\/-\/admin\/router\/snapshot"\)\]/,
  'runtime core must poll the lightweight router snapshot',
);
assert.match(
  source,
  /result\.routerSnapshot\?\.providers[\s\S]{0,180}state\.data\.status/,
  'runtime router snapshots must update the provider/key state used by the dashboard',
);
assert.match(
  source,
  /state\.forceRequestsFetch[\s\S]{0,220}apiGet\(requestsPath\(\), \{ signal: viewController\.signal \}\)/,
  'explicit request-list invalidation must still trigger an immediate fetch',
);
assert.match(
  source,
  /const viewPromise = Promise\.allSettled[\s\S]{0,1800}renderAll\(\)[\s\S]{0,240}await viewPromise/,
  'core state must render before slow view payloads complete',
);
assert.match(
  source,
  /generation !== _runtimeRefreshGeneration \|\| requestedView !== state\.view/,
  'late responses from a previous view must not apply to the active view',
);
assert.ok(
  source.includes('_runtimeRefreshWantedForceViewData ||= forceViewData;') &&
    source.includes('refreshRuntimeData({ forceViewData: trailingForceViewData })'),
  'coalesced refreshes must preserve an immediate view-data request',
);
assert.ok(
  source.includes('_runtimeViewAbortController?.abort();') &&
    source.includes('signal: viewController.signal'),
  'switching views must cancel obsolete heavy view requests',
);
function bodyBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing source region: ${startMarker}`);
  return source.slice(start, end);
}

const requestPaginationBody = bodyBetween('function bindRequestPagination', 'function paginate');
assert.doesNotMatch(
  requestPaginationBody,
  /refreshAll\(/,
  'request pagination must not trigger the legacy full refresh',
);
assert.match(
  requestPaginationBody,
  /refreshRuntimeData\(\{ forceViewData: true \}\)/,
  'request pagination must fetch only current runtime view data',
);
assert.match(
  requestPaginationBody,
  /if \(_requestPageNavigation\) return;/,
  'request pagination must ignore repeated clicks while navigation is pending',
);
assert.match(
  requestPaginationBody,
  /_requestPageNavigation = \{ from: currentPage, to: targetPage \}/,
  'request pagination must advance exactly one page from the committed page',
);
assert.match(
  requestPaginationBody,
  /state\.forceRequestsFetch = true/,
  'request pagination must force the target page payload even inside the refresh window',
);
assert.match(
  source,
  /requestPayloadMatchesPage\(requestsPayload, requestedRequestPage, REQUEST_PAGE_SIZE\)/,
  'request view refreshes must reject payloads for an obsolete offset',
);
const requestFilterStart = source.lastIndexOf('qsa("[data-request-status]")');
const requestFilterEnd = source.indexOf('el("deleteRequestsButton")', requestFilterStart);
assert.ok(requestFilterStart >= 0 && requestFilterEnd > requestFilterStart, 'missing request filter handlers');
const requestFilterHandlers = source.slice(requestFilterStart, requestFilterEnd);
assert.doesNotMatch(
  requestFilterHandlers,
  /refreshAll\(/,
  'request filters must not trigger the legacy full refresh',
);
assert.match(
  requestFilterHandlers,
  /state\.forceRequestsFetch = true[\s\S]{0,90}refreshRuntimeData\(\{ forceViewData: true \}\)/,
  'request filter invalidation must refresh the request view immediately',
);

console.log('refresh scheduler tests passed');
