import {
  ISSUE_COMMENT_MAX_LENGTH,
  ISSUE_TASK_INSTRUCTION_MAX_LENGTH,
  ISSUE_TASK_TITLE_MAX_LENGTH,
} from "@/repository/contracts";
import { issuePointLength, issueSlice } from "@/repository/range";

const ASCII_MENTION_WHITESPACE = "[ \\t\\r\\n]";
const ASCII_MENTION_WHITESPACE_RUN = /[ \t\r\n]+/gu;
const ASCII_MENTION_WHITESPACE_EDGES = /^[ \t\r\n]+|[ \t\r\n]+$/gu;

export type CompiledIssueMention = {
  visibleComment: string;
  instruction: string;
  title: string;
};

export type CompileIssueMentionResult =
  | { ok: true; value: CompiledIssueMention }
  | { ok: false; reason: "INVALID_COMMENT" | "INVALID_PREFIX" | "INVALID_INSTRUCTION" };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Compiles the exact visible `@Agent prompt` comment into immutable task fields.
 * Only ASCII space/tab/CR/LF are separators; all other Unicode whitespace remains
 * ordinary prompt text so browser, server, and SQL implementations can agree exactly.
 */
export function compileIssueMention(
  visibleComment: string,
  mentionedAgentName: string,
): CompileIssueMentionResult {
  if (typeof visibleComment !== "string"
    || issuePointLength(visibleComment) > ISSUE_COMMENT_MAX_LENGTH) {
    return { ok: false, reason: "INVALID_COMMENT" };
  }

  const prefix = new RegExp(`^@${escapeRegExp(mentionedAgentName)}${ASCII_MENTION_WHITESPACE}+`, "u");
  const match = prefix.exec(visibleComment);
  if (!match) return { ok: false, reason: "INVALID_PREFIX" };

  const instruction = visibleComment
    .slice(match[0].length)
    .replace(ASCII_MENTION_WHITESPACE_EDGES, "");
  if (instruction.length === 0
    || issuePointLength(instruction) > ISSUE_TASK_INSTRUCTION_MAX_LENGTH) {
    return { ok: false, reason: "INVALID_INSTRUCTION" };
  }

  const title = issueSlice(
    instruction.replace(ASCII_MENTION_WHITESPACE_RUN, " "),
    0,
    ISSUE_TASK_TITLE_MAX_LENGTH,
  );
  return {
    ok: true,
    value: { visibleComment, instruction, title },
  };
}
