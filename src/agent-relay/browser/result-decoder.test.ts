import assert from "node:assert/strict";
import { test } from "vitest";

import { RelayBrowserError } from "./errors";
import {
  decodeRelayExecuteToolResult,
  wrapRelayNativeResult,
} from "./result-decoder";

test("decodes the frozen MCP-style wrapper and checked logical envelope", () => {
  const value = {
    resultReceiptId: "receipt-1",
    output: JSON.stringify({ ok: true, data: { source: "Synthetic demo source" } }),
  };
  const decoded = decodeRelayExecuteToolResult(JSON.stringify(wrapRelayNativeResult(value)));
  assert.equal(decoded.resultReceiptId, "receipt-1");
  assert.deepEqual(decoded.parsedOutput, {
    ok: true,
    data: { source: "Synthetic demo source" },
  });
});

test("rejects malformed wrappers, mismatched text, and unchecked output fields", () => {
  for (const raw of [
    "not-json",
    JSON.stringify({ structuredContent: {} }),
    JSON.stringify({
      content: [{ type: "text", text: "{}" }],
      structuredContent: { resultReceiptId: "receipt", output: "{}" },
    }),
    JSON.stringify(wrapRelayNativeResult({
      resultReceiptId: "receipt",
      output: JSON.stringify({ ok: true, data: {}, extra: true }),
    })),
  ]) {
    assert.throws(
      () => decodeRelayExecuteToolResult(raw),
      (error: unknown) => error instanceof RelayBrowserError
        && error.code === "RELAY_RESULT_INVALID",
    );
  }
});
