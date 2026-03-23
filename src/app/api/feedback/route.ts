import { getOptionalDoctorSession } from "@/lib/auth";
import { writeAuditEvent, writeFeedbackEvent } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const doctor = await getOptionalDoctorSession();

  if (!doctor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    requestId?: string;
    query?: string;
    verdict?: string;
    note?: string;
    context?: string;
  };

  if (!body.requestId || !body.query || !body.verdict) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  await writeFeedbackEvent({
    doctorId: doctor.id,
    doctorEmail: doctor.email,
    requestId: body.requestId,
    query: body.query,
    verdict: body.verdict,
    note: body.note ?? "",
    context: body.context ?? "search-result",
  });

  await writeAuditEvent({
    event: "feedback.submitted",
    actorId: doctor.id,
    actorEmail: doctor.email,
    actorRole: doctor.role,
    route: "/api/feedback",
    requestId: body.requestId,
    query: body.query,
    status: "ok",
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
    extra: {
      verdict: body.verdict,
      context: body.context ?? "search-result",
    },
  });

  return Response.json({ ok: true });
}
