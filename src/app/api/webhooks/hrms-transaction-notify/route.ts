import { NextRequest, NextResponse } from "next/server";
import {
  notifyLeaveRequestCreated,
  notifyLeaveRequestDecided,
  notifyReimbursementCreated,
  notifyReimbursementDecided,
} from "@/lib/hrmsTransactionNotify";

/**
 * Secured webhook so the **mobile app** (or Supabase Database Webhooks) can trigger the same
 * Power Automate emails as the web API after leave / reimbursement RPCs.
 *
 * When `HRMS_TRANSACTION_NOTIFY_SECRET` is set, requests must send header `x-hrms-transaction-notify-secret`
 * with the same value. If unset, the route accepts POSTs without that header (convenient for dev;
 * set a secret in production).
 */
export async function POST(request: NextRequest) {
  const expected = process.env.HRMS_TRANSACTION_NOTIFY_SECRET?.trim();
  if (expected) {
    const got = request.headers.get("x-hrms-transaction-notify-secret")?.trim();
    if (got !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const event = typeof body.event === "string" ? body.event.trim() : "";

  try {
    switch (event) {
      case "leave_request_created": {
        const id = typeof body.requestId === "string" ? body.requestId.trim() : "";
        if (!id) return NextResponse.json({ error: "requestId required" }, { status: 400 });
        await notifyLeaveRequestCreated(id);
        break;
      }
      case "leave_request_decided": {
        const id = typeof body.requestId === "string" ? body.requestId.trim() : "";
        if (!id) return NextResponse.json({ error: "requestId required" }, { status: 400 });
        await notifyLeaveRequestDecided(id);
        break;
      }
      case "reimbursement_created": {
        const id = typeof body.reimbursementId === "string" ? body.reimbursementId.trim() : "";
        if (!id) return NextResponse.json({ error: "reimbursementId required" }, { status: 400 });
        await notifyReimbursementCreated(id);
        break;
      }
      case "reimbursement_decided": {
        const id = typeof body.reimbursementId === "string" ? body.reimbursementId.trim() : "";
        if (!id) return NextResponse.json({ error: "reimbursementId required" }, { status: 400 });
        await notifyReimbursementDecided(id);
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown or missing event" }, { status: 400 });
    }
  } catch (e: any) {
    console.warn("[hrms-transaction-notify]", e);
    return NextResponse.json({ error: e?.message || "Notify failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
