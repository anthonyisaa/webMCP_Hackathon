import type { WorkspaceView } from "@/contracts";

export type { ActorRef, WorkspaceView } from "@/contracts";

/** Presentation-level seam for S1's session-backed implementation. */
export interface ProductWorkspacePort {
  inspect(): Promise<WorkspaceView>;
}
