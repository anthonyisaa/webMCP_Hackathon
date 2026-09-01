import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260901154147_repository_v4_issue_documents.sql",
), "utf8");
const postmortemGolden = JSON.parse(readFileSync(resolve(
  process.cwd(),
  "evals/goldens/repo-document-v4/postmortem.json",
), "utf8")) as {
  document: { title: string };
  revisions: Array<{ body: string; contentDigest: string }>;
};

function migrationSection(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

const rpcNames = [
  "ratiflow_launch_issue_v4",
  "ratiflow_join_issue_v4",
  "ratiflow_inspect_issue_v4",
  "ratiflow_save_issue_revision_v4",
  "ratiflow_create_issue_task_v4",
  "ratiflow_create_issue_thread_v4",
  "ratiflow_add_issue_comment_v4",
  "ratiflow_resolve_issue_thread_v4",
  "ratiflow_cancel_issue_task_v4",
  "ratiflow_accept_issue_task_v4",
  "ratiflow_reject_issue_task_v4",
  "ratiflow_restore_issue_revision_v4",
  "ratiflow_read_issue_history_v4",
  "ratiflow_read_issue_revision_v4",
  "ratiflow_list_my_issue_tasks_v4",
  "ratiflow_comment_on_issue_task_v4",
  "ratiflow_submit_issue_task_result_v4",
  "ratiflow_touch_issue_presence_v4",
  "ratiflow_reset_postmortem_hero_v4",
] as const;

describe("repository-v4 additive migration", () => {
  it("widens shared fences and creates exactly the five checked v4 tables", () => {
    expect(migration).toContain("check (protocol_version in (2, 3, 4))");
    expect(migration).toContain("add column issue_kind text");
    expect(migration.match(/create table public\.ratiflow_issue_(?:revisions|tasks|threads|comments|activity)_v4/g))
      .toHaveLength(5);
    for (const table of ["revisions", "tasks", "threads", "comments", "activity"]) {
      expect(migration).toContain(`create table public.ratiflow_issue_${table}_v4`);
    }
    expect(migration).not.toMatch(/drop\s+table|truncate\s+table/i);
  });

  it("defines only the exact public RPC catalog and carries page identity to agent RPCs", () => {
    const declared = [...migration.matchAll(/function public\.(ratiflow_[a-z0-9_]+_v4)/g)]
      .map((match) => match[1]);
    expect(new Set(declared)).toEqual(new Set(rpcNames));
    for (const name of rpcNames) expect(migration).toContain(`function public.${name}`);
    expect(migration).not.toMatch(/function public\.ratiflow_wait_[a-z0-9_]*_v4/i);
    for (const name of [
      "ratiflow_list_my_issue_tasks_v4",
      "ratiflow_comment_on_issue_task_v4",
      "ratiflow_submit_issue_task_result_v4",
    ]) {
      const start = migration.indexOf(`function public.${name}`);
      expect(migration.slice(start, start + 240)).toContain("p_page_session_id uuid");
    }
  });

  it("terminates every PL/pgSQL body with a complete END statement", () => {
    const declarations = migration.match(/language plpgsql/g) ?? [];
    const bodies = [...migration.matchAll(
      /language plpgsql[\s\S]*?as \$\$([\s\S]*?)\n\$\$;/g,
    )];

    expect(bodies).toHaveLength(declarations.length);
    for (const [, body] of bodies) {
      expect(body?.trimEnd()).toMatch(/end;$/);
    }
  });

  it("parenthesizes CASE expressions used inside PL/pgSQL IF conditions", () => {
    expect(migration.match(
      /char_length\(v_next_value\) > \(case when v_task\.anchor_field = 'TITLE' then 160 else 50000 end\)/g,
    )).toHaveLength(2);
    expect(migration).not.toMatch(
      /char_length\(v_next_value\) > case when v_task\.anchor_field = 'TITLE'/,
    );
  });

  it("stores only credential digests and makes issuance deliberately non-replayable", () => {
    expect(migration).toContain("extensions.digest(v_share_token, 'sha256')");
    expect(migration).toContain("extensions.digest(v_human, 'sha256')");
    expect(migration).toContain("extensions.digest(v_agent, 'sha256')");
    expect(migration).toContain("handle_hash, document_id, member_id");
    for (const name of ["ratiflow_launch_issue_v4", "ratiflow_join_issue_v4", "ratiflow_reset_postmortem_hero_v4"]) {
      const start = migration.indexOf(`function public.${name}`);
      const end = migration.indexOf("\n$$;", start);
      expect(migration.slice(start, end)).not.toContain("requestId");
    }
    expect(migration).not.toMatch(/raise\s+(?:notice|log|warning).*token/i);
  });

  it("locks the document first and centralizes scoped replay and immutable history", () => {
    expect(migration).toContain("where id = v_session.document_id and protocol_version = 4");
    expect(migration.match(/for update;/g)?.length).toBeGreaterThanOrEqual(8);
    expect(migration).toContain("REQUEST_REPLAY_MISMATCH");
    for (const operation of [
      "SAVE_ISSUE_REVISION_V4", "CREATE_ISSUE_TASK_V4", "CREATE_ISSUE_THREAD_V4",
      "ADD_ISSUE_COMMENT_V4", "RESOLVE_ISSUE_THREAD_V4", "CANCEL_ISSUE_TASK_V4",
      "ACCEPT_ISSUE_TASK_V4", "REJECT_ISSUE_TASK_V4", "RESTORE_ISSUE_REVISION_V4",
      "COMMENT_ON_ISSUE_TASK_V4", "SUBMIT_ISSUE_TASK_RESULT_V4",
      "TOUCH_ISSUE_PRESENCE_V4",
    ]) expect(migration).toContain(`'${operation}'`);
    expect(migration).toContain("immutable_revision_v4");
    expect(migration).toContain("immutable_comment_v4");
    expect(migration).toContain("immutable_task_identity_v4");
    expect(migration).toContain("immutable_thread_identity_v4");
  });

  it("authorizes task scope before replay without letting denials poison replay", () => {
    const human = migrationSection(
      "function ratiflow_document_private.human_mutation_v4",
      "function ratiflow_document_private.agent_mutation_v4",
    );
    const agent = migrationSection(
      "function ratiflow_document_private.agent_mutation_v4",
      "function public.ratiflow_save_issue_revision_v4",
    );
    expect(human.indexOf("and creator_member_id = v_session.member_id"))
      .toBeLessThan(human.indexOf("v_replay := ratiflow_document_private.replay_v4"));
    expect(agent.indexOf("and assignee_member_id = v_session.member_id"))
      .toBeLessThan(agent.indexOf("v_replay := ratiflow_document_private.replay_v4"));

    const finish = migrationSection(
      "function ratiflow_document_private.finish_mutation_v4",
      "function ratiflow_document_private.stale_document_v4",
    );
    expect(finish).toContain("member_for_handle_v4(p_handle)");
    expect(finish.indexOf("p_result->>'code' = 'UNAUTHORIZED'"))
      .toBeLessThan(finish.indexOf("insert into public.ratiflow_document_request_ledger"));
    expect(finish).toContain("on conflict (document_id, request_id) do nothing");
    expect(finish).not.toContain("update public.ratiflow_documents");
    expect(finish).not.toContain("ratiflow_issue_activity_v4");
    expect(finish).not.toContain("ratiflow_document_presence");
    expect(migration.match(/select ratiflow_document_private\.finish_mutation_v4\(/g))
      .toHaveLength(12);
    const presence = migrationSection(
      "function public.ratiflow_touch_issue_presence_v4",
      "function public.ratiflow_comment_on_issue_task_v4",
    );
    expect(presence).toContain("finish_mutation_v4");
  });

  it("stores immutable creation targets and pre-apply submission snapshots", () => {
    expect(migration.match(/creation_anchor jsonb not null/g)).toHaveLength(2);
    expect(migration).toContain("'creationAnchor', t.creation_anchor");
    expect(migration).toContain("or new.creation_anchor is distinct from old.creation_anchor");
    expect(migration).toContain("old.proposal_live_anchor is not null");
    expect(migration).toContain("old.result_live_anchor is not null");
    expect(migration).toContain("old.result_replacement_text is not null");
    expect(migration).toContain("'liveAnchor', t.proposal_live_anchor");
    expect(migration).toContain("'liveAnchor', t.result_live_anchor");
    expect(migration).toContain("'replacementText', t.result_replacement_text");
    expect(migration.match(/proposal_live_anchor = ratiflow_document_private\.anchor_json_v4\(/g))
      .toHaveLength(2);
    expect(migration.match(/result_live_anchor = ratiflow_document_private\.anchor_json_v4\(/g))
      .toHaveLength(4);
    expect(migration).toContain("result_replacement_text = null");
    expect(migration).toContain("result_replacement_text = v_replacement");
  });

  it("uses checked failure codes without mutating state and preserves selection diffs", () => {
    expect(migration).toContain("jsonb_typeof(p_value) <> 'array'");
    expect(migration.match(/p_input \? 'evidenceRefs' and not ratiflow_document_private\.evidence_v4/g))
      .toHaveLength(3);
    expect(migration.match(/invalid_v4\('The reply target must belong to this thread\.'\)/g))
      .toHaveLength(2);
    expect(migration).toContain(
      "invalid_v4('Comment tasks cannot replace content.')",
    );
    expect(migration).toContain(
      "error_v4('STALE_TASK_CONTEXT', 'The proposal target is stale.'",
    );
    expect(migration).toContain(
      "error_v4('STALE_TASK_CONTEXT', 'The task target is stale.'",
    );
    const decision = migrationSection(
      "elsif p_operation in ('ACCEPT_ISSUE_TASK_V4','REJECT_ISSUE_TASK_V4')",
      "elsif p_operation = 'RESTORE_ISSUE_REVISION_V4'",
    );
    expect(decision.indexOf("if v_task.status = 'STALE'"))
      .toBeLessThan(decision.indexOf("if v_task.mode <> 'REVIEW'"));
    const agentResult = migrationSection(
      "elsif p_operation = 'SUBMIT_ISSUE_TASK_RESULT_V4'",
      "return ratiflow_document_private.record_v4(\n    v_document.id",
    );
    expect(agentResult.indexOf("if v_task.status = 'STALE'"))
      .toBeLessThan(agentResult.indexOf("if v_task.status <> 'OPEN'"));
    const append = migrationSection(
      "function ratiflow_document_private.append_revision_v4",
      "function ratiflow_document_private.issue_tokens_v4",
    );
    expect(append).toContain("'rangeStart', v_own_task.range_start");
    expect(append).toContain("'rangeEnd', v_own_task.range_end");
    expect(append).toContain("'before', v_own_task.selected_text");
    expect(append).toContain("'after', p_own_replacement");
    const rebase = migrationSection(
      "function ratiflow_document_private.rebase_anchors_v4",
      "function ratiflow_document_private.bump_activity_v4",
    );
    expect(rebase).toContain("where document_id = p_document_id\n      and (p_own_task_id is null");
    expect(rebase).toContain("if v_task.status in ('OPEN', 'PROPOSED') then");
    expect(rebase).not.toContain(
      "where document_id = p_document_id and status in ('OPEN', 'PROPOSED')",
    );
  });

  it("rate-limits each non-replayable credential issuer atomically", () => {
    const limiter = migrationSection(
      "function ratiflow_document_private.rate_limit_v4",
      "function ratiflow_document_private.rebase_selection_v4",
    );
    expect(limiter).toContain("on conflict (operation, bucket) do update");
    for (const [name, next] of [
      ["ratiflow_launch_issue_v4", "ratiflow_join_issue_v4"],
      ["ratiflow_join_issue_v4", "ratiflow_inspect_issue_v4"],
      ["ratiflow_reset_postmortem_hero_v4", "human_mutation_v4"],
    ] as const) {
      const issuer = migrationSection(`function public.${name}`, `function ${
        next === "human_mutation_v4" ? "ratiflow_document_private." : "public."
      }${next}`);
      expect(issuer).toContain("rate_limit_v4(");
    }
    const reset = migrationSection(
      "function public.ratiflow_reset_postmortem_hero_v4",
      "function ratiflow_document_private.anchor_from_input_v4",
    );
    expect(reset).toContain("pg_catalog.pg_try_advisory_xact_lock");
  });

  it("freezes caps, deterministic ordering, Unicode splices, and hero parity", () => {
    expect(migration).toContain(">= 500");
    expect(migration).toContain(">= 100");
    expect(migration).toContain(">= 50");
    expect(migration).toContain("char_length(p_old)");
    expect(migration).toContain("p_end <= v_prefix");
    expect(migration).toContain("p_start >= v_splice_end");
    expect(migration).toContain("order by c.created_at, c.comment_id");
    expect(migration).toContain("order by selected.revision desc");
    expect(migration).toContain(
      "greatest(clock_timestamp(), v_document.updated_at + interval '1 microsecond')",
    );
    expect(migration).toContain(
      "p.last_seen_at > clock_timestamp() - interval '15 seconds'",
    );
    expect(migration).not.toContain(
      "p.last_seen_at >= clock_timestamp() - interval '15 seconds'",
    );
    expect(migration).toContain("'COMPLETED'");
    expect(migration).toContain("'RESET'");
    expect(migration).toContain("'revision', 1, 'activityVersion', 4");
    expect(migration).toContain("#ratiflow-bootstrap=");
    expect(migration).toContain("INC-482 · Checkout outage postmortem");
  });

  it("reconstructs the exact r1-r4 public-example bodies and content digests", () => {
    const capture = (expression: RegExp) => {
      const match = migration.match(expression);
      expect(match?.[1]).toBeDefined();
      return match![1]!;
    };
    const r1 = capture(/v_body := \$hero\$([\s\S]*?)\$hero\$;/u);
    const impact = capture(/v_impact text := '([^']*)';/u);
    const timeline = capture(/v_timeline text := E'([^']*)';/u).replaceAll("\\n", "\n");
    const rootCause = capture(/v_root_cause text := '([^']*)';/u);
    const replace = (value: string, start: number, end: number, replacement: string) => [
      ...Array.from(value).slice(0, start),
      ...Array.from(replacement),
      ...Array.from(value).slice(end),
    ].join("");
    const bodies = [
      r1,
      replace(r1, 174, 200, impact),
      replace(replace(r1, 174, 200, impact), 319, 345, timeline),
      replace(replace(replace(r1, 174, 200, impact), 319, 345, timeline), 573, 599, rootCause),
    ];
    expect(bodies).toEqual(postmortemGolden.revisions.map(({ body }) => body));
    const digests = bodies.map((body) => `sha256:${createHash("sha256").update(JSON.stringify({
      title: postmortemGolden.document.title,
      body,
    }), "utf8").digest("hex")}`);
    expect(digests).toEqual(postmortemGolden.revisions.map(({ contentDigest }) => contentDigest));
  });

  it("enables RLS, revokes tables/functions, pins search_path, and isolates reset", () => {
    for (const table of ["revisions", "tasks", "threads", "comments", "activity"]) {
      expect(migration).toContain(
        `alter table public.ratiflow_issue_${table}_v4 enable row level security;`,
      );
      expect(migration).toContain(
        `revoke all on public.ratiflow_issue_${table}_v4 from public, anon, authenticated;`,
      );
    }
    expect(migration).not.toMatch(/create\s+policy/i);
    expect(migration).toContain("set search_path = pg_catalog, ratiflow_document_private, extensions");
    expect(migration).toContain(
      "revoke all on function public.ratiflow_reset_postmortem_hero_v4() from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.ratiflow_reset_postmortem_hero_v4() to service_role;",
    );
    expect(migration).toContain("to anon, authenticated;");
  });
});
