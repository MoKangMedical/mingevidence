import { appendJsonLine } from "@/lib/storage";

type AuditPayload = {
  event: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  route?: string;
  requestId?: string;
  query?: string;
  status?: string;
  detail?: string;
  ip?: string | null;
  userAgent?: string | null;
  extra?: Record<string, unknown>;
};

export async function writeAuditEvent(payload: AuditPayload) {
  await appendJsonLine("runtime/audit-log.ndjson", {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

export async function writeFeedbackEvent(payload: Record<string, unknown>) {
  await appendJsonLine("runtime/feedback-log.ndjson", {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}
