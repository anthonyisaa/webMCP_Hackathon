import type {
  ActorRef,
  ProductWorkspacePort,
  WorkspaceView,
} from "@/components/product/types";

const maya: ActorRef = {
  id: "usr_maya_chen",
  name: "Maya Chen",
  role: "Product Lead",
};

const jordan: ActorRef = {
  id: "usr_jordan_lee",
  name: "Jordan Lee",
  role: "Engineering Lead",
};

const ratiflowAgent: ActorRef = {
  id: "agent_ratiflow_demo",
  name: "Ratiflow Agent",
  role: "Decision analyst",
};

const systemActor: ActorRef = {
  id: "system_ratiflow",
  name: "Ratiflow",
  role: "System",
};

/**
 * A contract-faithful display fixture. The page owns presentation state only;
 * S1 will replace this port with the authoritative session-backed service.
 */
export const fixtureWorkspace: WorkspaceView = {
  id: "ws_northstar_csv_launch",
  name: "Northstar CSV launch scope",
  revision: 7,
  decision: {
    id: "dec_csv_oct15",
    question: "Does CSV export belong in the Oct 15 launch?",
    state: "READY",
    selectedOptionId: "opt_csv_ga_oct15",
    launchDate: "2026-10-15",
    launchCapacityEngineerDays: 18,
    coreReliabilityEngineerDays: 10,
  },
  customer: {
    id: "cust_northstar_health",
    name: "Northstar Health",
    annualRenewalUsd: 180000,
    usableExportDueDate: "2026-11-01",
  },
  options: [
    {
      id: "opt_csv_ga_oct15",
      title: "O1 · Full CSV export at GA",
      summary: "Full CSV export, GA Oct 15, 2026",
      launchDate: "2026-10-15",
      exportEngineerDays: 8,
      totalEngineerDays: 18,
      postLaunchEngineerDays: 0,
    },
    {
      id: "opt_csv_beta_oct15",
      title: "O2 · Northstar beta, then GA",
      summary: "Invite-only, single-tenant Northstar beta Oct 15, 2026; GA Nov 1, 2026",
      launchDate: "2026-10-15",
      exportEngineerDays: 4,
      totalEngineerDays: 14,
      postLaunchEngineerDays: 4,
    },
    {
      id: "opt_csv_defer_nov1",
      title: "O3 · Defer all export to Nov 1",
      summary: "Defer all export to GA Nov 1, 2026",
      launchDate: "2026-11-01",
      exportEngineerDays: 0,
      totalEngineerDays: 10,
      postLaunchEngineerDays: 8,
    },
  ],
  evidence: [
    {
      id: "ev_capacity_r7",
      optionId: null,
      kind: "ENGINEERING_ESTIMATE",
      stance: "CONTEXT",
      title: "Launch capacity",
      detail: "18 engineer-days are available for the Oct 15 launch.",
      sourceLabel: "Jordan planning note",
      metrics: { engineerDays: 18 },
      actor: jordan,
      createdAt: "2026-08-30T00:00:00.000Z",
    },
    {
      id: "ev_northstar_deadline",
      optionId: null,
      kind: "CUSTOMER_DEADLINE",
      stance: "CONTEXT",
      title: "Northstar renewal requirement",
      detail: "The $180,000 renewal needs usable CSV export by Nov 1, not GA on Oct 15.",
      sourceLabel: "Renewal brief",
      metrics: { annualValueUsd: 180000, date: "2026-11-01" },
      actor: maya,
      createdAt: "2026-08-30T00:00:00.000Z",
    },
  ],
  challenges: [],
  preparedDecision: null,
  followup: {
    id: "fu_customer_launch_brief",
    slug: "customer-launch-brief",
    status: "BLOCKED",
    ownerId: maya.id,
    dueDate: "2026-10-16",
    inheritedContext: [],
  },
  provenance: [],
  readiness: {
    activeOptionCount: 3,
    hasCurrentCapacityEvidence: true,
    hasNorthstarDeadlineEvidence: true,
    selectedOptionId: "opt_csv_ga_oct15",
    selectedOptionEngineerDays: 18,
    launchCapacityEngineerDays: 18,
    unresolvedBlockingChallengeCount: 0,
  },
  collaboration: {
    cursor: "00000000-0000-4000-8000-000000000007",
    agent: {
      actor: ratiflowAgent,
      state: "AWAY",
      lastSeenAt: null,
      activeVia: null,
    },
    standingInstructions: {
      autoPickup: false,
      scopes: ["MENTIONS", "TASKS"],
      maxActionsPerHour: 6,
    },
    inbox: [],
    comments: [],
    questions: [],
    recentActivity: [
      {
        id: "activity_seed_r7",
        cursor: "00000000-0000-4000-8000-000000000007",
        createdAt: "2026-08-30T00:00:00.000Z",
        actor: systemActor,
        actorType: "SYSTEM",
        via: "SYSTEM",
        type: "WORKSPACE_MUTATED",
        target: { kind: "DECISION", id: "dec_csv_oct15" },
        summary: "Northstar launch decision opened at revision 7.",
        workspaceRevision: 7,
      },
    ],
  },
};

export const fixtureWorkspacePort: ProductWorkspacePort = {
  inspect: async () => fixtureWorkspace,
};
