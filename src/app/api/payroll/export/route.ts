import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildPayrollExcelRow,
  PAYROLL_EXCEL_HEADER,
  payrollExcelAmountColumnIndices,
} from "@/lib/payrollExcelExport";
import * as XLSX from "xlsx-js-style";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const periodId = typeof body?.periodId === "string" ? body.periodId : "";
  const companyId = typeof body?.companyId === "string" ? body.companyId : "";
  const periodName = typeof body?.periodName === "string" ? body.periodName : "";
  const month = typeof body?.month === "number" ? body.month : 0;
  const year = typeof body?.year === "number" ? body.year : 0;

  if (!periodId || !companyId || !periodName || !month || !year) {
    return NextResponse.json({ error: "periodId, companyId, periodName, month and year are required" }, { status: 400 });
  }

  const { data: me } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (!me?.company_id || me.company_id !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: payslips, error: slipErr } = await supabase
    .from("HRMS_payslips")
    .select(`
      employee_user_id,
      payroll_mode,
      bank_name,
      bank_account_number,
      bank_ifsc,
      ctc,
      esic_employee,
      gross_pay,
      pf_employee,
      esic_employer,
      pf_employer,
      net_pay,
      pay_days,
      professional_tax,
      incentive,
      pr_bonus,
      reimbursement,
      tds,
      deductions,
      basic,
      hra,
      medical,
      trans,
      lta,
      personal
    `)
    .eq("payroll_period_id", periodId)
    .eq("company_id", companyId);

  if (slipErr || !payslips?.length) {
    return NextResponse.json({ error: "No payslips found for this period" }, { status: 404 });
  }

  const userIds = payslips.map((p: any) => p.employee_user_id).filter(Boolean);
  const { data: users } = await supabase
    .from("HRMS_users")
    .select("id, name, bank_name, bank_account_number, bank_ifsc")
    .in("id", userIds);
  const userById = new Map((users ?? []).map((u: any) => [u.id, u]));

  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const fileName = `${monthNames[month]} ${year} Payroll`;

  const rows = payslips.map((p: any) => {
    const u = userById.get(p.employee_user_id);
    const mergedSlip = {
      ...p,
      bank_name: p.bank_name ?? u?.bank_name ?? null,
      bank_account_number: p.bank_account_number ?? u?.bank_account_number ?? null,
      bank_ifsc: p.bank_ifsc ?? u?.bank_ifsc ?? null,
    };
    return buildPayrollExcelRow(mergedSlip, u?.name ?? "");
  });

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [...PAYROLL_EXCEL_HEADER],
  });

  ws["!cols"] = PAYROLL_EXCEL_HEADER.map((_, i) => ({ wch: i < 4 ? 22 : 14 }));
  const amountCols = payrollExcelAmountColumnIndices();
  const rowCount = rows.length + 1;
  for (let r = 1; r <= rowCount; r++) {
    for (const c of amountCols) {
      const ref = XLSX.utils.encode_cell({ r: r - 1, c });
      if (ws[ref]) ws[ref].s = { alignment: { horizontal: "center", vertical: "center" } };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Payroll");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "photomedia";
  const storagePath = `HRMS/${companyId}/monthly payroll/${fileName}.xlsx`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buf, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json({ error: `Failed to upload: ${uploadErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    path: storagePath,
    fileName: `${fileName}.xlsx`,
    bucket,
  });
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId") ?? "";

  if (!periodId) return NextResponse.json({ error: "periodId required" }, { status: 400 });

  const { data: me } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (!me?.company_id) return NextResponse.json({ error: "No company" }, { status: 403 });

  const { data: period } = await supabase
    .from("HRMS_payroll_periods")
    .select("id, company_id, period_start, period_name")
    .eq("id", periodId)
    .eq("company_id", me.company_id)
    .maybeSingle();

  if (!period) return NextResponse.json({ error: "Period not found" }, { status: 404 });

  const periodStart = String(period.period_start);
  const [y, m] = periodStart.split("-").map(Number);
  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const fileName = `${monthNames[m]} ${y} Payroll.xlsx`;

  const { data: payslips, error: slipErr } = await supabase
    .from("HRMS_payslips")
    .select(`
      employee_user_id,
      payroll_mode,
      bank_name,
      bank_account_number,
      bank_ifsc,
      ctc,
      esic_employee,
      gross_pay,
      pf_employee,
      esic_employer,
      pf_employer,
      net_pay,
      pay_days,
      professional_tax,
      incentive,
      pr_bonus,
      reimbursement,
      tds,
      deductions,
      basic,
      hra,
      medical,
      trans,
      lta,
      personal
    `)
    .eq("payroll_period_id", periodId)
    .eq("company_id", me.company_id);

  if (slipErr || !payslips?.length) {
    return NextResponse.json({ error: "No payslips found" }, { status: 404 });
  }

  const userIds = payslips.map((p: any) => p.employee_user_id).filter(Boolean);
  const { data: users } = await supabase
    .from("HRMS_users")
    .select("id, name, bank_name, bank_account_number, bank_ifsc")
    .in("id", userIds);
  const userById = new Map((users ?? []).map((u: any) => [u.id, u]));

  const rows = payslips.map((p: any) => {
    const u = userById.get(p.employee_user_id);
    const mergedSlip = {
      ...p,
      bank_name: p.bank_name ?? u?.bank_name ?? null,
      bank_account_number: p.bank_account_number ?? u?.bank_account_number ?? null,
      bank_ifsc: p.bank_ifsc ?? u?.bank_ifsc ?? null,
    };
    return buildPayrollExcelRow(mergedSlip, u?.name ?? "");
  });

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [...PAYROLL_EXCEL_HEADER],
  });
  ws["!cols"] = PAYROLL_EXCEL_HEADER.map((_, i) => ({ wch: i < 4 ? 22 : 14 }));
  const amountCols = payrollExcelAmountColumnIndices();
  const rowCount = rows.length + 1;
  for (let r = 1; r <= rowCount; r++) {
    for (const c of amountCols) {
      const ref = XLSX.utils.encode_cell({ r: r - 1, c });
      if (ws[ref]) ws[ref].s = { alignment: { horizontal: "center", vertical: "center" } };
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Payroll");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
