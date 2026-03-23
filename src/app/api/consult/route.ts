import { getOptionalDoctorSession } from "@/lib/auth";
import { findPopulationSignals } from "@/lib/population-signal-service";
import {
  brandSummary,
  getConsultMatrix,
  getConsultSignals,
  getConsultTracks,
} from "@/lib/platform-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const doctor = await getOptionalDoctorSession();

  if (!doctor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() || doctor.specialty;
  const population = await findPopulationSignals({
    query,
    specialty: doctor.specialty,
    maxItems: 6,
  });

  return Response.json({
    brand: brandSummary,
    mode: "deep-consult",
    generatedAt: new Date().toISOString(),
    actor: {
      id: doctor.id,
      name: doctor.name,
      hospital: doctor.hospital,
      specialty: doctor.specialty,
    },
    query,
    tracks: getConsultTracks(),
    signals: getConsultSignals(),
    matrix: getConsultMatrix(),
    populationPathway: population.pathway,
    populationSignals: population.signals,
  });
}
