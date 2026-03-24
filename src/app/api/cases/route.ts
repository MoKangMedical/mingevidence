import { getOptionalDoctorSession } from "@/lib/auth";
import { createCaseWorkspace, listCaseWorkspaces } from "@/lib/case-workspace";

export const runtime = "nodejs";

export async function GET() {
  const doctor = await getOptionalDoctorSession();

  if (!doctor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cases = await listCaseWorkspaces(doctor.id);
  return Response.json({ items: cases });
}

export async function POST(request: Request) {
  const doctor = await getOptionalDoctorSession();

  if (!doctor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as {
    title?: string;
    focusQuery?: string;
    patientSummary?: string;
  };

  if (!payload.focusQuery?.trim()) {
    return Response.json(
      { error: "病例问题不能为空。" },
      { status: 400 },
    );
  }

  const record = await createCaseWorkspace({
    title: payload.title,
    focusQuery: payload.focusQuery,
    patientSummary: payload.patientSummary,
    doctor,
  });

  return Response.json({ item: record }, { status: 201 });
}
