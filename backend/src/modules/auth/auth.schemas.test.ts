import { afterEach, describe, expect, it } from "vitest";
import { loginSchema } from "./auth.schemas.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalAdminUsername = process.env.ADMIN_USERNAME;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalAdminUsername === undefined) delete process.env.ADMIN_USERNAME;
  else process.env.ADMIN_USERNAME = originalAdminUsername;
});

describe("loginSchema", () => {
  it("allows the configured admin's short password only in development", () => {
    process.env.NODE_ENV = "development";
    process.env.ADMIN_USERNAME = "admin";

    expect(loginSchema.safeParse({ username: "admin", password: "admin" }).success).toBe(true);
    expect(loginSchema.safeParse({ username: "seller", password: "admin" }).success).toBe(false);

    process.env.NODE_ENV = "production";
    expect(loginSchema.safeParse({ username: "admin", password: "admin" }).success).toBe(false);
  });
});
