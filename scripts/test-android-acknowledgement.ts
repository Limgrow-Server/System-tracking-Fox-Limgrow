import assert from "node:assert/strict";
import { androidAcknowledgementMeta } from "../lib/tracking/android-acknowledgement";

assert.equal(
  androidAcknowledgementMeta({ acknowledged: false }).label,
  "Chưa xác nhận",
);
assert.equal(
  androidAcknowledgementMeta({ acknowledged: true }).source,
  "Không rõ nguồn",
);
assert.equal(
  androidAcknowledgementMeta({
    acknowledged: true,
    acknowledgementSource: "server",
  }).source,
  "Server",
);
assert.equal(
  androidAcknowledgementMeta({
    acknowledged: true,
    acknowledgementSource: "app",
  }).source,
  "App",
);
assert.equal(
  androidAcknowledgementMeta({
    acknowledged: true,
    acknowledgementSource: "legacy",
  }).source,
  "Không rõ nguồn",
);
assert.equal(
  androidAcknowledgementMeta({
    acknowledged: false,
    acknowledgementSource: "server",
  }).source,
  null,
);
console.log("Android acknowledgement UI metadata: 6 assertions passed");
