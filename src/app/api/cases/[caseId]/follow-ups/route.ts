import { getOptionalDoctorSession } from "@/lib/auth";
import { appendCaseFollowUp } from "@/lib/case-workspace";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/cases/[caseId]/follow-ups">,
) {
  const doctor = await getOptionalDoctorSession();

  if (!doctor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { caseId } = await context.params;
  const payload = (await request.json()) as { question?: string };

  if (!payload.question?.trim()) {
    return Response.json({ error: "追问不能为空。" }, { status: 400 });
  }

  const record = await appendCaseFollowUp({
    caseId,
    question: payload.question,
    doctor,
  });

  if (!record) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ item: record });
}
