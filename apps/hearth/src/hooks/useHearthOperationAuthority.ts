import { useLayoutEffect, useRef } from "react";
import {
  createHearthOperationAuthority,
  type HearthOperationAuthority,
  type HearthOperationScope,
} from "../lib/hearth-operation-authority";

export function useHearthOperationAuthority(scope: HearthOperationScope): HearthOperationAuthority {
  const authorityRef = useRef<HearthOperationAuthority | null>(null);
  if (!authorityRef.current) {
    authorityRef.current = createHearthOperationAuthority(scope);
  }
  const authority = authorityRef.current;
  useLayoutEffect(() => {
    authority.updateScope(scope);
  }, [
    authority,
    scope.draftId,
    scope.draftVersion,
    scope.revisionId,
    scope.workpieceId,
    scope.workspaceId,
  ]);
  return authority;
}
