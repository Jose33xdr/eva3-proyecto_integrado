import { z } from "zod";

export const loginSchema = z
  .object({
  username: z.string().trim().min(3).max(80),
    password: z.string().min(1).max(200),
  })
  .refine(
    ({ username, password }) =>
      password.length >= 8 ||
      (process.env.NODE_ENV === "development" &&
        username === (process.env.ADMIN_USERNAME ?? "admin")),
    {
      path: ["password"],
      message: "La contraseña debe tener al menos 8 caracteres",
    },
  );

export const refreshSchema = z.object({
  refreshToken: z.string().min(32),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
