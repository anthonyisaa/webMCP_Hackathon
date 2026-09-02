import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const appliedMigration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260901154147_repository_v4_issue_documents.sql",
), "utf8");
const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260902021004_repository_v4_1_comment_first_collaboration.sql",
), "utf8");
const postmortem = JSON.parse(readFileSync(resolve(
  process.cwd(),
  "evals/goldens/repo-document-v4.1/postmortem-comment-first.json",
), "utf8")) as {
  title: string;
  r1MarkdownSource: string;
  revisionTrajectory: Array<{ contentDigest: string; summary: string }>;
  tasks: Array<{
    visiblePrompt: string;
    contextSnapshot: {
      selectedText: string;
      beforeExcerpt: string;
      afterExcerpt: string;
    };
    completion: {
      replacementText: string;
      resultSummary: string;
      evidenceRefs: string[];
    };
  }>;
  threads: Array<{ comments: Array<{ body: string; evidenceRefs: string[] }> }>;
};
const product = JSON.parse(readFileSync(resolve(
  process.cwd(),
  "evals/goldens/repo-document-v4.1/product-document-comment-first.json",
), "utf8")) as typeof postmortem & {
  humanCapacityCorrection: { before: string; after: string; summary: string };
  restoreDemonstration: { alternativeAfter: string; restoreSummary: string };
};

const rpcNames = [
  "ratiflow_launch_issue_v4", "ratiflow_join_issue_v4",
  "ratiflow_inspect_issue_v4", "ratiflow_save_issue_revision_v4",
  "ratiflow_create_issue_task_v4", "ratiflow_create_issue_mention_v4",
  "ratiflow_create_issue_thread_v4", "ratiflow_add_issue_comment_v4",
  "ratiflow_resolve_issue_thread_v4", "ratiflow_cancel_issue_task_v4",
  "ratiflow_accept_issue_task_v4", "ratiflow_reject_issue_task_v4",
  "ratiflow_restore_issue_revision_v4", "ratiflow_read_issue_history_v4",
  "ratiflow_read_issue_revision_v4", "ratiflow_connect_issue_agent_v4",
  "ratiflow_read_issue_collaboration_context_v4",
  "ratiflow_list_my_issue_tasks_v4", "ratiflow_begin_issue_task_wait_v4",
  "ratiflow_end_issue_task_wait_v4", "ratiflow_comment_on_issue_task_v4",
  "ratiflow_submit_issue_task_result_v4", "ratiflow_touch_issue_presence_v4",
  "ratiflow_reset_postmortem_hero_v4",
] as const;

const ledgerOperations = [
  "SAVE_HUMAN", "SET_STAGE", "CREATE_ACTION", "APPLY_AGENT_EDIT",
  "UNDO_AGENT_EDIT", "CREATE_ANNOTATION", "CANCEL_ANNOTATION",
  "APPLY_AGENT_ANNOTATION", "SAVE_DOCUMENT_V3", "CREATE_DOCUMENT_WORK_V3",
  "CANCEL_DOCUMENT_WORK_V3", "SUBMIT_DOCUMENT_PROPOSAL_V3",
  "ACCEPT_DOCUMENT_PROPOSAL_V3", "REJECT_DOCUMENT_PROPOSAL_V3",
  "SAVE_ISSUE_REVISION_V4", "CREATE_ISSUE_TASK_V4", "CREATE_ISSUE_THREAD_V4",
  "ADD_ISSUE_COMMENT_V4", "RESOLVE_ISSUE_THREAD_V4", "CANCEL_ISSUE_TASK_V4",
  "ACCEPT_ISSUE_TASK_V4", "REJECT_ISSUE_TASK_V4", "RESTORE_ISSUE_REVISION_V4",
  "COMMENT_ON_ISSUE_TASK_V4", "SUBMIT_ISSUE_TASK_RESULT_V4",
  "TOUCH_ISSUE_PRESENCE_V4", "CONNECT_ISSUE_AGENT_V4",
  "CREATE_ISSUE_MENTION_V4",
] as const;

function section(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe("repository-v4.1 additive migration", () => {
  it("preserves applied issue tables and adds only frozen collaboration storage", () => {
    expect(migration).not.toMatch(
      /(?:drop|create)\s+table\s+public\.ratiflow_issue_(?:revisions|tasks|threads|comments|activity)_v4/iu,
    );
    expect(migration).not.toMatch(/truncate\s+table/iu);
    expect(migration).toContain("create table public.ratiflow_issue_agent_profiles_v4");
    expect(migration).toContain(
      "create table ratiflow_document_private.issue_agent_page_connections_v4",
    );
    expect(migration).toContain(
      "create table ratiflow_document_private.issue_agent_wait_leases_v4",
    );
    expect(migration).toContain("add column agent_profile_id uuid");
    expect(migration).toContain("add column context_snapshot jsonb");
    expect(appliedMigration).toContain("create table public.ratiflow_issue_revisions_v4");
  });

  it("preserves every ledger operation and adds exactly two", () => {
    const constraint = section(
      "add constraint ratiflow_document_request_ledger_operation_check check (",
      "create table public.ratiflow_issue_agent_profiles_v4",
    );
    const actual = [...constraint.matchAll(/'([A-Z0-9_]+)'/gu)]
      .map((match) => match[1]);
    expect(actual).toEqual(ledgerOperations);
  });

  it("binds stable profiles to private credential/page generations", () => {
    expect(migration).toContain("profile_id uuid primary key");
    expect(migration).toContain("identity_generation bigint not null default 1");
    expect(migration).toContain("access_count bigint not null default 1");
    expect(migration).toContain("check (access_count between 0 and 9007199254740991)");
    expect(migration).toContain(
      "name = ratiflow_document_private.trim_ecmascript_v4(name)",
    );
    expect(migration).not.toContain("name = btrim(name)");
    expect(migration).toContain(
      "primary key (document_id, member_id, session_instance_id, page_session_id)",
    );
    const connected = section(
      "function ratiflow_document_private.connected_agent_v41",
      "function ratiflow_document_private.agent_identity_failure_v41",
    );
    for (const predicate of [
      "c.session_instance_id = s.session_instance_id",
      "c.page_session_id = p_page_session_id", "c.profile_id = p.profile_id",
      "c.identity_generation = p.identity_generation",
    ]) expect(connected).toContain(predicate);
    const connect = section(
      "function public.ratiflow_connect_issue_agent_v4",
      "function public.ratiflow_begin_issue_task_wait_v4",
    );
    const trimCheck = "p_input->>'name' <> ratiflow_document_private.trim_ecmascript_v4";
    expect(connect).toContain(trimCheck);
    expect(connect.indexOf(trimCheck))
      .toBeLessThan(connect.indexOf("insert into public.ratiflow_issue_agent_profiles_v4"));
  });

  it("backfills authoritative comment revisions without mutable anchors", () => {
    const backfill = section(
      "alter table public.ratiflow_issue_comments_v4 add column created_revision bigint;",
      "function ratiflow_document_private.set_comment_created_revision_v41",
    );
    expect(backfill).toContain("disable trigger ratiflow_issue_comments_immutable_v4");
    expect(backfill).toContain("a.comment_id = c.comment_id");
    expect(backfill).toContain("order by a.activity_version, a.activity_id");
    expect(backfill).toContain("select t.created_revision");
    expect(backfill).toContain("where created_revision is null");
    expect(backfill).toContain("alter column created_revision set not null");
    expect(backfill).toContain("enable trigger ratiflow_issue_comments_immutable_v4");
    expect(backfill).not.toContain("anchor_revision");
  });

  it("keeps task profile and context immutable and checked", () => {
    const immutable = section(
      "function ratiflow_document_private.immutable_task_identity_v4",
      "alter table public.ratiflow_issue_comments_v4 add column created_revision",
    );
    expect(immutable).toContain("new.agent_profile_id is distinct from old.agent_profile_id");
    expect(immutable).toContain("new.context_snapshot is distinct from old.context_snapshot");
    expect(migration).toContain("and (context_snapshot - array[");
    expect(migration).toContain("]) = '{}'::jsonb");
    expect(migration).not.toContain("jsonb_object_length(");
    expect(migration).toContain("jsonb_array_length(context_snapshot->'priorContext') <= 10");
  });

  it("uses a server-clock CAS lease and UUID-conditional full-tuple release", () => {
    const begin = section(
      "function public.ratiflow_begin_issue_task_wait_v4",
      "function public.ratiflow_end_issue_task_wait_v4",
    );
    expect(begin).toContain(
      "on conflict (document_id, member_id, session_instance_id, page_session_id)",
    );
    expect(begin).toContain("issue_agent_wait_leases_v4.expires_at\n    < clock_timestamp()");
    expect(begin).toContain("returning lease_id into v_acquired");
    expect(begin).toContain("'WAIT_ALREADY_ACTIVE'");
    expect(begin).toContain("p_deadline + interval '5 seconds'");
    const end = section(
      "function public.ratiflow_end_issue_task_wait_v4",
      "function public.ratiflow_create_issue_mention_v4",
    );
    expect(end).toContain("member_for_handle_v4(p_handle)");
    expect(end).toContain("where actor_type = 'AGENT'");
    expect(end).not.toContain("connected_agent_v41(");
    for (const predicate of [
      "document_id = v_session.document_id", "member_id = v_session.member_id",
      "session_instance_id = v_session.session_instance_id",
      "page_session_id = p_page_session_id", "lease_id = p_lease_id",
    ]) expect(end).toContain(predicate);
  });

  it("creates one checked mention task/thread/comment/context activity", () => {
    const mention = section(
      "function public.ratiflow_create_issue_mention_v4",
      "function public.ratiflow_read_issue_collaboration_context_v4",
    );
    expect(mention).toContain("'CREATE_ISSUE_MENTION_V4'");
    expect(mention).toContain("'STALE_AGENT_PROFILE'");
    expect(mention).toContain("select p.* into v_profile");
    expect(mention).toContain("select m.* into strict v_member");
    expect(mention).not.toContain("select p, m into v_profile, v_member");
    expect(mention).toContain("not in (' ', chr(9), chr(10), chr(13))");
    expect(mention).toContain("E' \\t\\r\\n'");
    expect(mention).toContain("'TASK-' || ((select count(*) + 1");
    expect(mention).toContain("'GENERAL'");
    expect(mention).toContain("'DIRECT'");
    expect(mention).toContain("insert into public.ratiflow_issue_comments_v4");
    expect(mention.match(/bump_activity_v4\(/gu)).toHaveLength(1);
    expect(mention).toContain("v_profile.profile_id, v_context");
  });

  it("scopes v4.1 replay and does not ledger identity/page failures", () => {
    const fingerprint = section(
      "function ratiflow_document_private.request_fingerprint_v41",
      "function ratiflow_document_private.replay_v41",
    );
    expect(fingerprint).toContain("'responseContract', 'v4.1'");
    expect(fingerprint).toContain("'credentialSessionInstanceId', p_session_instance_id");
    expect(fingerprint).toContain("'pageSessionId', p_page_session_id");
    const record = section(
      "function ratiflow_document_private.record_v41",
      "function ratiflow_document_private.connected_agent_v41",
    );
    expect(record).toContain(
      "'UNAUTHORIZED', 'AGENT_IDENTITY_REQUIRED', 'STALE_PAGE_CONTEXT'",
    );
    const connect = section(
      "function public.ratiflow_connect_issue_agent_v4",
      "function public.ratiflow_begin_issue_task_wait_v4",
    );
    expect(connect.indexOf("member_for_handle_v4(p_handle)"))
      .toBeLessThan(connect.indexOf("replay_v41("));
    expect(connect.indexOf("replay_v41("))
      .toBeLessThan(connect.indexOf("array['requestId','name']"));
    expect(connect).toContain("record_v41(");

    const humanMutation = section(
      "function ratiflow_document_private.human_mutation_v41",
      "function ratiflow_document_private.legacy_agent_task_allowed_v41",
    );
    expect(humanMutation.indexOf("creator_member_id = v_session.member_id"))
      .toBeLessThan(humanMutation.indexOf("replay_v41("));
    expect(humanMutation).toContain(
      "request_id = v_internal_request_id",
    );
    const agentMutation = section(
      "function ratiflow_document_private.agent_mutation_v41",
      "create or replace function public.ratiflow_launch_issue_v4",
    );
    expect(agentMutation.indexOf("assignee_member_id = v_agent.member_id"))
      .toBeLessThan(agentMutation.indexOf("replay_v41("));
    expect(agentMutation).toContain(
      "request_id = v_internal_request_id",
    );
  });

  it("exposes exactly one non-overloaded frozen RPC catalog", () => {
    const declared = [...migration.matchAll(
      /create or replace function public\.(ratiflow_[a-z0-9_]+_v4)/gu,
    )].map((match) => match[1]);
    expect(new Set(declared)).toEqual(new Set(rpcNames));
    expect(declared).toHaveLength(rpcNames.length);
    expect(migration).not.toContain("ratiflow_wait_for_my_tasks_v4");
  });

  it("keeps default v4 behavior and gates expanded projections with v4.1", () => {
    for (const name of [
      "ratiflow_launch_issue_v4", "ratiflow_join_issue_v4",
      "ratiflow_inspect_issue_v4", "ratiflow_save_issue_revision_v4",
      "ratiflow_create_issue_task_v4", "ratiflow_create_issue_thread_v4",
      "ratiflow_add_issue_comment_v4", "ratiflow_resolve_issue_thread_v4",
      "ratiflow_cancel_issue_task_v4", "ratiflow_accept_issue_task_v4",
      "ratiflow_reject_issue_task_v4", "ratiflow_restore_issue_revision_v4",
      "ratiflow_read_issue_history_v4", "ratiflow_read_issue_revision_v4",
      "ratiflow_list_my_issue_tasks_v4", "ratiflow_comment_on_issue_task_v4",
      "ratiflow_submit_issue_task_result_v4", "ratiflow_touch_issue_presence_v4",
    ]) {
      const start = migration.lastIndexOf(`create or replace function public.${name}`);
      expect(migration.slice(start, start + 420)).toContain(
        "p_response_contract text default 'v4'",
      );
    }
    expect(migration).toContain("t.agent_profile_id is null");
    expect(migration).toContain("legacy_agent_task_allowed_v41");
    const save = section(
      "function ratiflow_document_private.legacy_save_compat_v41",
      "function public.ratiflow_save_issue_revision_v4",
    );
    expect(save).toContain("array['changeSummary']");
    expect(save).toContain("p_input - 'changeSummary'");
    expect(save).toContain("replay_v4(");
    expect(save.indexOf("replay_v4("))
      .toBeLessThan(save.indexOf("array['requestId','expectedRevision','title','body']"));
    expect(save).toContain("request_id = v_internal_request_id");

    const list = section(
      "create or replace function public.ratiflow_list_my_issue_tasks_v4",
      "create or replace function public.ratiflow_comment_on_issue_task_v4",
    );
    expect(list.indexOf("p_page_session_id is null"))
      .toBeLessThan(list.indexOf("array['includeResolved']"));
    expect(list).toContain("t.agent_profile_id is null");

    for (const [name, legacyName, nextName] of [
      [
        "ratiflow_comment_on_issue_task_v4",
        "legacy_comment_on_issue_task_v4",
        "ratiflow_submit_issue_task_result_v4",
      ],
      [
        "ratiflow_submit_issue_task_result_v4",
        "legacy_submit_issue_task_result_v4",
        "seed_postmortem_start_v41",
      ],
    ] as const) {
      const wrapper = section(
        `create or replace function public.${name}`,
        `create or replace function ${nextName === "seed_postmortem_start_v41"
          ? "ratiflow_document_private." : "public."}${nextName}`,
      );
      expect(wrapper.indexOf("p_page_session_id is null"))
        .toBeLessThan(wrapper.indexOf("legacy_agent_task_allowed_v41"));
      expect(wrapper).toContain(`return ratiflow_document_private.${legacyName}(`);
    }
  });

  it("seeds the exact executable r1 reset with zero-access profiles", () => {
    const seed = section(
      "function ratiflow_document_private.seed_postmortem_start_v41",
      "function ratiflow_document_private.seed_mention_v41",
    );
    const body = seed.match(/v_body text := \$reset\$([\s\S]*?)\$reset\$;/u)?.[1];
    expect(body).toBe(postmortem.r1MarkdownSource);
    const digest = `sha256:${createHash("sha256").update(JSON.stringify({
      title: postmortem.title,
      body,
    }), "utf8").digest("hex")}`;
    expect(digest).toBe(postmortem.revisionTrajectory[0]!.contentDigest);
    expect(seed).toContain(`'${postmortem.revisionTrajectory[0]!.summary}'`);
    for (const task of postmortem.tasks.slice(0, 3)) {
      expect(seed).toContain(task.visiblePrompt);
      expect(seed).toContain(task.contextSnapshot.beforeExcerpt);
      expect(seed).toContain(task.contextSnapshot.afterExcerpt);
    }
    expect(seed).toContain("v_base, v_base, 0");
    expect(seed).not.toContain("issue_agent_page_connections_v4");
    const reset = section(
      "function public.ratiflow_reset_postmortem_hero_v4",
      "-- Moving the applied functions preserves their former ACLs",
    );
    expect(reset).toContain("seed_postmortem_start_v41()");
    expect(reset).toContain("'expiresAt', v_expiry, 'revision', 1, 'activityVersion', 4");
  });

  it("materializes both public examples from the independent detailed goldens", () => {
    const launch = section(
      "create or replace function public.ratiflow_launch_issue_v4",
      "create or replace function public.ratiflow_join_issue_v4",
    );
    expect(launch).toContain("build_postmortem_example_v41(");
    expect(launch).toContain("build_product_example_v41(");
    expect(launch).not.toContain("ratiflow_reset_postmortem_hero_v4");

    const postmortemExample = section(
      "function ratiflow_document_private.seed_postmortem_start_v41",
      "function ratiflow_document_private.seed_product_start_v41",
    );
    const productExample = section(
      "function ratiflow_document_private.seed_product_start_v41",
      "-- Protected deterministic rehearsal start",
    );
    const mentionSeed = section(
      "function ratiflow_document_private.seed_mention_v41",
      "function ratiflow_document_private.build_postmortem_example_v41",
    );
    const productBody = productExample.match(
      /v_body text := \$product\$([\s\S]*?)\$product\$;/u,
    )?.[1];
    expect(productBody).toBe(product.r1MarkdownSource);
    const productDigest = `sha256:${createHash("sha256").update(JSON.stringify({
      title: product.title,
      body: productBody,
    }), "utf8").digest("hex")}`;
    expect(productDigest).toBe(product.revisionTrajectory[0]!.contentDigest);

    for (const [golden, builder] of [
      [postmortem, postmortemExample],
      [product, productExample],
    ] as const) {
      for (const task of golden.tasks) {
        expect(mentionSeed).toContain(task.contextSnapshot.selectedText);
        expect(builder).toContain(task.visiblePrompt);
        expect(builder).toContain(task.contextSnapshot.beforeExcerpt);
        expect(builder).toContain(task.contextSnapshot.afterExcerpt);
        expect(builder).toContain(task.completion.replacementText);
        expect(builder).toContain(task.completion.resultSummary);
        for (const ref of task.completion.evidenceRefs) expect(builder).toContain(`'${ref}'`);
      }
      for (const thread of golden.threads) {
        for (const comment of thread.comments) {
          expect(builder).toContain(comment.body);
          for (const ref of comment.evidenceRefs) expect(builder).toContain(`'${ref}'`);
        }
      }
    }
    expect(productExample).toContain(product.humanCapacityCorrection.before);
    expect(productExample).toContain(product.humanCapacityCorrection.after);
    expect(productExample).toContain(product.restoreDemonstration.alternativeAfter);
    expect(productExample).toContain(product.restoreDemonstration.restoreSummary);
    expect(migration).not.toContain("jsonb_object_length(");
  });

  it("pins search paths, locks storage, and grants only intended RPCs", () => {
    expect(migration).toContain(
      "alter table public.ratiflow_issue_agent_profiles_v4 enable row level security;",
    );
    expect(migration).toContain(
      "revoke all on public.ratiflow_issue_agent_profiles_v4 from public, anon, authenticated;",
    );
    expect(migration).not.toMatch(/create\s+policy/iu);
    expect(migration.match(/(?:as|do) \$\$/gu)).toHaveLength(
      migration.match(/\$\$;/gu)?.length ?? 0,
    );
    expect(migration).toContain(
      "revoke all on all functions in schema ratiflow_document_private",
    );
    expect(migration).toContain(
      "public.ratiflow_reset_postmortem_hero_v4()\n  from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.ratiflow_reset_postmortem_hero_v4()\n  to service_role;",
    );
    expect(migration).toContain("to anon, authenticated;");
    expect(migration.match(
      /set search_path = pg_catalog, ratiflow_document_private, extensions/gu,
    )).toHaveLength(migration.match(/security definer/gu)?.length ?? 0);
  });
});
