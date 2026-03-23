import { NextResponse } from "next/server";

import {
  authenticateDoctor,
  buildSessionCookieOptions,
  createSessionCookieValue,
  getSessionCookieName,
  sanitizeNextPath,
} from "@/lib/auth";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextPath = sanitizeNextPath(String(formData.get("next") ?? "/search"));
  const ip = request.headers.get("x-forwarded-for");
  const userAgent = request.headers.get("user-agent");

  const doctor = await authenticateDoctor(email, password);

  if (!doctor) {
    await writeAuditEvent({
      event: "auth.login.failed",
      actorEmail: email,
      route: "/api/auth/login",
      status: "denied",
      ip,
      userAgent,
    });

    const loginUrl = new URL(`/login?error=invalid&next=${encodeURIComponent(nextPath)}`, request.url);
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url), {
    status: 303,
  });

  response.cookies.set(
    getSessionCookieName(),
    createSessionCookieValue(doctor),
    buildSessionCookieOptions(),
  );

  await writeAuditEvent({
    event: "auth.login.success",
    actorId: doctor.id,
    actorEmail: doctor.email,
    actorRole: doctor.role,
    route: "/api/auth/login",
    status: "ok",
    ip,
    userAgent,
  });

  return response;
}
