import { NextResponse } from "next/server";

import {
  buildSessionCookieOptions,
  getOptionalDoctorSession,
  getSessionCookieName,
} from "@/lib/auth";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const doctor = await getOptionalDoctorSession();
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });

  response.cookies.set(getSessionCookieName(), "", {
    ...buildSessionCookieOptions(),
    maxAge: 0,
  });

  await writeAuditEvent({
    event: "auth.logout",
    actorId: doctor?.id,
    actorEmail: doctor?.email,
    actorRole: doctor?.role,
    route: "/api/auth/logout",
    status: "ok",
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return response;
}
