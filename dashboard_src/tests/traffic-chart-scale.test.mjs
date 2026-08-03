import assert from "node:assert/strict";
import { chartScaleMax, positiveChartPoints } from "../src/traffic-chart-scale.mjs";

assert.equal(
  chartScaleMax([112, 5, 107], { fallback: 1000, nice: true }),
  200,
  "non-zero token data must use its observed range instead of the empty-state fallback",
);

assert.equal(
  chartScaleMax([0, 0, 0], { fallback: 1000, nice: true }),
  1000,
  "an empty token chart must retain a safe fallback range",
);

assert.ok(
  Math.abs(chartScaleMax([0.00003066], { fallback: 0.01 }) - 0.000035259) < 1e-12,
  "non-zero cost data must scale from its observed value",
);

assert.deepEqual(
  positiveChartPoints([{ value: 0 }, { value: 112 }, { value: 0 }]),
  [{ value: 112 }],
  "zero-value dates must not render redundant chart markers",
);

console.log("traffic chart scale tests passed");
