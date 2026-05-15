import { NextRequest, NextResponse } from "next/server";
import { submitAccountDeletionRequest } from "@/lib/accountDeletion";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const result = await submitAccountDeletionRequest(email, password);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      message: result.alreadyPending
        ? "A deletion request is already pending for this account."
        : "Your account deletion request was submitted.",
      scheduledDeletionAt: result.scheduledDeletionAt,
      graceDays: 90,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
