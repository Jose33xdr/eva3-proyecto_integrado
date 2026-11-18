import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET debe tener al menos 32 caracteres"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),

  ADMIN_RUT: z.string().default("11.111.111-1"),
  ADMIN_FIRST_NAME: z.string().default("Administrador"),
  ADMIN_LAST_NAME: z.string().default("Sistema"),
  ADMIN_EMAIL: z.string().email().default("admin@farmacia.local"),
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().min(1).default("administrador"),
}).superRefine((config, context) => {
  if (config.NODE_ENV === "production" && config.ADMIN_PASSWORD.length < 8) {
    context.addIssue({
      code: "custom",
      path: ["ADMIN_PASSWORD"],
      message: "ADMIN_PASSWORD debe tener al menos 8 caracteres en producción",
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variables de entorno inválidas:");
  console.error(z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
