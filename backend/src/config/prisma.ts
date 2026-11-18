import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { env } from "./env.js";
import { auditRequestStorage, getSqlOperation } from "../middlewares/auditContext.js";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
});

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient<"query">;
};

export const prisma: PrismaClient<"query"> =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: [{ emit: "event", level: "query" }],
  });

prisma.$on("query", (event) => {
  const context = auditRequestStorage.getStore();
  if (!context?.recording) return;

  const operation = getSqlOperation(event.query);
  if (operation) context.sqlOperations.push(operation);
});

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
