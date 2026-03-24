import { getOptionalDoctorSession } from "@/lib/auth";
import { getCaseWorkspace } from "@/lib/case-workspace";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/cases/[caseId]">,
) {
  const doctor = await getOptionalDoctorSession();

  if (!doctor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { caseId } = await context.params;
  const record = await getCaseWorkspace(caseId, doctor.id);

  if (!record) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ item: record });
}
