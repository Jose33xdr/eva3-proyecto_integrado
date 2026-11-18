import { AsyncLocalStorage } from "node:async_hooks";

export type SqlOperation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export type AuditRequestContext = {
  startedAt: number;
  method: string;
  path: string;
  module: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
  sqlOperations: SqlOperation[];
  recording: boolean;
};

export const auditRequestStorage =
  new AsyncLocalStorage<AuditRequestContext>();

export const getSqlOperation = (query: string): SqlOperation | null => {
  const operation = /^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.exec(query)?.[1];
  return operation ? (operation.toUpperCase() as SqlOperation) : null;
};
