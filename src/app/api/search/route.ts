import { getOptionalDoctorSession } from "@/lib/auth";
import { runEvidenceSearch } from "@/lib/search-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const doctor = await getOptionalDoctorSession();

  if (!doctor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return Response.json({ error: "Missing q" }, { status: 400 });
  }

  const result = await runEvidenceSearch({
    query,
    actor: doctor,
    channel: "api",
    route: "/api/search",
    requestMeta: {
      ip: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    },
  });

  return Response.json(result);
}
