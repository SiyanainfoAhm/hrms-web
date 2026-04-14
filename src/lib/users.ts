import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabaseClient";

export type UserRole = "super_admin" | "admin" | "hr" | "manager" | "employee";
export type AuthProvider = "password" | "google";

export type User = {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  role: UserRole;
  authProvider?: AuthProvider;
  authSessionVersion: number;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
};

function randomEmployeeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "EMP-";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function generateUniqueEmployeeCode(): Promise<string> {
  // Very low collision probability, but we still check to guarantee uniqueness.
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomEmployeeCode();
    const { data, error } = await supabase
      .from("HRMS_users")
      .select("id")
      .eq("employee_code", code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  // fallback
  return `EMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

// Map a row from HRMS_users into our local User type
function mapDbRowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash ?? null,
    name: row.name ?? null,
    role: row.role as UserRole,
    authProvider: (row.auth_provider as AuthProvider) ?? "password",
    authSessionVersion: Number(row.auth_session_version ?? 0),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("HRMS_users")
    .select("*")
    .eq("email", normalized)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? mapDbRowToUser(data) : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from("HRMS_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? mapDbRowToUser(data) : null;
}

export async function createUser(data: {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
}): Promise<User> {
  const normalizedEmail = data.email.trim().toLowerCase();

  // Enforce uniqueness at application level (DB also has a unique constraint)
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    throw new Error("Email already registered");
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const finalRole = data.role ?? "super_admin";
  const employeeCode = await generateUniqueEmployeeCode();
  const employmentStatus = finalRole === "super_admin" ? "current" : "preboarding";

  const insertPayload = {
    email: normalizedEmail,
    password_hash: passwordHash,
    auth_provider: "password",
    name: data.name ?? null,
    role: finalRole,
    employee_code: employeeCode,
    employment_status: employmentStatus,
  };

  const { data: inserted, error } = await supabase
    .from("HRMS_users")
    .insert([insertPayload])
    .select("*")
    .single();

  if (error) {
    // If DB uniqueness constraint triggers
    if (typeof error.message === "string" && error.message.toLowerCase().includes("duplicate")) {
      throw new Error("Email already registered");
    }
    throw error;
  }

  return mapDbRowToUser(inserted);
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  if (!user.passwordHash) return false;
  return bcrypt.compare(password, user.passwordHash);
}

const MIN_PASSWORD_LENGTH = 8;

/** Updates password after verifying the current one. Returns new auth session version (invalidates other devices). */
export async function changePasswordForUser(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<number> {
  const trimmedNew = newPassword.trim();
  if (trimmedNew.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const user = await findUserById(userId);
  if (!user) throw new Error("User not found");
  const ok = await verifyPassword(user, currentPassword);
  if (!ok) throw new Error("Current password is incorrect");
  const password_hash = await bcrypt.hash(trimmedNew, 10);
  const nextSv = user.authSessionVersion + 1;
  const { error } = await supabase
    .from("HRMS_users")
    .update({
      password_hash,
      auth_session_version: nextSv,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) throw error;
  return nextSv;
}
