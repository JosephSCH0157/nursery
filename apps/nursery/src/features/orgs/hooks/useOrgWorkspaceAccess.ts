import { useCallback, useEffect, useMemo, useState } from "react";
import {
  workspaceAccessRepo,
  type WorkspaceAccessRepo,
} from "../data/workspaceAccessRepo";
import type {
  ManageableWorkspaceAccessRole,
  OrgWorkspace,
  UpsertWorkspaceMembershipInput,
  WorkspaceMembership,
} from "../types";

type MutationKind = "grant" | "update" | "revoke";

function toErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export type UseOrgWorkspaceAccessResult = {
  workspaces: OrgWorkspace[];
  memberships: WorkspaceMembership[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  granting: boolean;
  updatingWorkspaceId: string | null;
  removingWorkspaceId: string | null;
  grantAccess: (input: UpsertWorkspaceMembershipInput) => Promise<void>;
  updateRole: (workspaceId: string, role: ManageableWorkspaceAccessRole) => Promise<void>;
  revokeAccess: (workspaceId: string) => Promise<void>;
  reload: () => Promise<void>;
};

export function useOrgWorkspaceAccess(
  orgId: string,
  selectedUserId: string | null,
  actingUserId: string | null,
  repo: WorkspaceAccessRepo = workspaceAccessRepo,
): UseOrgWorkspaceAccessResult {
  const [workspaces, setWorkspaces] = useState<OrgWorkspace[]>([]);
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [updatingWorkspaceId, setUpdatingWorkspaceId] = useState<string | null>(null);
  const [removingWorkspaceId, setRemovingWorkspaceId] = useState<string | null>(null);

  const normalizedOrgId = orgId.trim();
  const normalizedSelectedUserId = (selectedUserId ?? "").trim() || null;
  const normalizedActingUserId = (actingUserId ?? "").trim() || null;

  const reload = useCallback(async () => {
    if (!normalizedOrgId) {
      setWorkspaces([]);
      setMemberships([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [workspaceRows, membershipRows] = await Promise.all([
        repo.loadOrgWorkspaces(normalizedOrgId),
        normalizedSelectedUserId
          ? repo.loadWorkspaceMembershipsForMember(normalizedOrgId, normalizedSelectedUserId)
          : Promise.resolve([]),
      ]);
      setWorkspaces(workspaceRows);
      setMemberships(membershipRows);
    } catch (error: unknown) {
      setWorkspaces([]);
      setMemberships([]);
      setError(toErrorMessage(error, "Failed loading workspace access."));
    } finally {
      setIsLoading(false);
    }
  }, [normalizedOrgId, normalizedSelectedUserId, repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const mutate = useCallback(async (
    kind: MutationKind,
    run: () => Promise<void>,
    workspaceId?: string,
  ) => {
    if (!normalizedActingUserId) {
      throw new Error("Acting user is required to manage workspace access.");
    }

    if (kind === "grant") setGranting(true);
    if (kind === "update") setUpdatingWorkspaceId(workspaceId ?? null);
    if (kind === "revoke") setRemovingWorkspaceId(workspaceId ?? null);
    setError(null);

    try {
      await run();
      await reload();
    } catch (error: unknown) {
      setError(toErrorMessage(error, "Failed updating workspace access."));
      throw error;
    } finally {
      if (kind === "grant") setGranting(false);
      if (kind === "update") setUpdatingWorkspaceId(null);
      if (kind === "revoke") setRemovingWorkspaceId(null);
    }
  }, [normalizedActingUserId, reload]);

  const grantAccess = useCallback(async (input: UpsertWorkspaceMembershipInput) => {
    if (!normalizedOrgId || !normalizedActingUserId) {
      throw new Error("Workspace access grant requires an active organization and acting user.");
    }
    await mutate("grant", async () => {
      await repo.upsertWorkspaceMembership(normalizedOrgId, input, normalizedActingUserId);
    }, input.workspaceId);
  }, [mutate, normalizedActingUserId, normalizedOrgId, repo]);

  const updateRole = useCallback(async (workspaceId: string, role: ManageableWorkspaceAccessRole) => {
    if (!normalizedOrgId || !normalizedSelectedUserId || !normalizedActingUserId) {
      throw new Error("Workspace role update requires an active organization, selected member, and acting user.");
    }
    await mutate("update", async () => {
      await repo.upsertWorkspaceMembership(
        normalizedOrgId,
        { workspaceId, userId: normalizedSelectedUserId, role },
        normalizedActingUserId,
      );
    }, workspaceId);
  }, [mutate, normalizedActingUserId, normalizedOrgId, normalizedSelectedUserId, repo]);

  const revokeAccess = useCallback(async (workspaceId: string) => {
    if (!normalizedOrgId || !normalizedSelectedUserId) {
      throw new Error("Workspace access revoke requires an active organization and selected member.");
    }
    await mutate("revoke", async () => {
      await repo.revokeWorkspaceMembership(normalizedOrgId, workspaceId, normalizedSelectedUserId);
    }, workspaceId);
  }, [mutate, normalizedOrgId, normalizedSelectedUserId, repo]);

  return useMemo(() => ({
    workspaces,
    memberships,
    isLoading,
    isSaving: granting || Boolean(updatingWorkspaceId) || Boolean(removingWorkspaceId),
    error,
    granting,
    updatingWorkspaceId,
    removingWorkspaceId,
    grantAccess,
    updateRole,
    revokeAccess,
    reload,
  }), [
    error,
    grantAccess,
    granting,
    isLoading,
    memberships,
    reload,
    removingWorkspaceId,
    revokeAccess,
    updateRole,
    updatingWorkspaceId,
    workspaces,
  ]);
}