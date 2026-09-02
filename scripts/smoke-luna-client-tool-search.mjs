import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import OpenAI from "openai";

const model = "gpt-5.6-luna";
const terminalMarker = "LUNA_RELAY_SMOKE_OK";
const instructions = [
  "You are running a bounded Ratiflow protocol smoke test.",
  "Use client tool search to discover read_demo_signal, call it exactly once with topic relay,",
  `then, after receiving its result, respond with exactly ${terminalMarker}.`,
  "Do not infer or invent the tool result.",
].join(" ");

function hashIdentifier(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

function itemTypes(response) {
  return response.output.map((item) => item.type);
}

function totalUsage(responses) {
  return responses.reduce(
    (sum, response) => ({
      inputTokens: sum.inputTokens + (response.usage?.input_tokens ?? 0),
      outputTokens: sum.outputTokens + (response.usage?.output_tokens ?? 0),
      totalTokens: sum.totalTokens + (response.usage?.total_tokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
}

function requireSingleItem(response, type) {
  const matches = response.output.filter((item) => item.type === type);
  assert.equal(matches.length, 1, `Expected exactly one ${type} item.`);
  return matches[0];
}

function safeMessage(error) {
  if (!(error instanceof Error)) return null;
  return error.message
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}

if (process.env.RATIFLOW_LIVE_LUNA_SMOKE !== "1") {
  console.error("Luna smoke is opt-in. Set RATIFLOW_LIVE_LUNA_SMOKE=1.");
  process.exitCode = 2;
} else {
  const apiKey = process.env.open_ai_api ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Luna smoke requires the server-only OpenAI API environment variable.");
    process.exitCode = 2;
  } else {
    const client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 1 });

    try {
      const started = await client.responses.create({
        model,
        instructions,
        input: "Run the Ratiflow client tool-search smoke now.",
        tools: [
          {
            type: "tool_search",
            execution: "client",
            description: "Discover the minimum browser tool needed for this smoke test.",
            parameters: {
              type: "object",
              properties: {
                goal: { type: "string" },
              },
              required: ["goal"],
              additionalProperties: false,
            },
          },
        ],
        parallel_tool_calls: false,
        reasoning: { effort: "low" },
        max_output_tokens: 400,
        store: true,
      });

      const searchCall = requireSingleItem(started, "tool_search_call");
      assert.equal(searchCall.execution, "client");
      assert.equal(searchCall.status, "completed");
      assert.ok(searchCall.call_id, "Client tool search must return call_id.");

      const discovered = await client.responses.create({
        model,
        instructions,
        previous_response_id: started.id,
        input: [
          {
            type: "tool_search_output",
            execution: "client",
            call_id: searchCall.call_id,
            status: "completed",
            tools: [
              {
                type: "function",
                name: "read_demo_signal",
                description: "Read the fixed synthetic Ratiflow relay smoke signal.",
                defer_loading: true,
                parameters: {
                  type: "object",
                  properties: {
                    topic: { type: "string", enum: ["relay"] },
                  },
                  required: ["topic"],
                  additionalProperties: false,
                },
                strict: true,
              },
            ],
          },
        ],
        tool_choice: "required",
        parallel_tool_calls: false,
        reasoning: { effort: "low" },
        max_output_tokens: 400,
        store: true,
      });

      const functionCall = requireSingleItem(discovered, "function_call");
      assert.equal(functionCall.name, "read_demo_signal");
      assert.ok(functionCall.call_id, "Function call must return call_id.");
      const parsedArguments = JSON.parse(functionCall.arguments);
      assert.deepEqual(parsedArguments, { topic: "relay" });

      const completed = await client.responses.create({
        model,
        instructions,
        previous_response_id: discovered.id,
        input: [
          {
            type: "function_call_output",
            call_id: functionCall.call_id,
            output: JSON.stringify({
              ok: true,
              source: "synthetic-smoke",
              signal: "synthetic-client-tool-result-received",
            }),
          },
        ],
        parallel_tool_calls: false,
        reasoning: { effort: "low" },
        max_output_tokens: 200,
        store: true,
      });

      assert.equal(completed.output_text.trim(), terminalMarker);
      const responses = [started, discovered, completed];
      console.log(
        JSON.stringify({
          ok: true,
          model,
          responseHashes: responses.map((response) => hashIdentifier(response.id)),
          itemTypes: responses.map(itemTypes),
          usage: totalUsage(responses),
        }),
      );
    } catch (error) {
      const safeFailure = {
        ok: false,
        name: error instanceof Error ? error.name : "UnknownError",
        status:
          typeof error === "object" && error !== null && "status" in error
            ? error.status
            : null,
        code:
          typeof error === "object" && error !== null && "code" in error
            ? error.code
            : null,
        type:
          typeof error === "object" && error !== null && "type" in error
            ? error.type
            : null,
        param:
          typeof error === "object" && error !== null && "param" in error
            ? error.param
            : null,
        message: safeMessage(error),
      };
      console.error(JSON.stringify(safeFailure));
      process.exitCode = 1;
    }
  }
}
