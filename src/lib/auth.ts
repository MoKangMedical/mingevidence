import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { readJsonFile } from "@/lib/storage";

const SESSION_COOKIE_NAME = "mingzheng_doctor_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

type DoctorAccount = {
  id: string;
  name: string;
  email: string;
  hospital: string;
  specialty: string;
  role: string;
  licenseId: string;
  passwordSalt: string;
  passwordHash: string;
};

export type DoctorSession = {
  id: string;
  name: string;
  email: string;
  hospital: string;
  specialty: string;
  role: string;
  licenseId: string;
  expiresAt: number;
};

type SessionPayload = {
  sub: string;
  name: string;
  email: string;
  hospital: string;
  specialty: string;
  role: string;
  licenseId: string;
  exp: number;
};

function getSessionSecret() {
  return process.env.MINGZHENG_SESSION_SECRET ?? "mingzheng-local-dev-secret";
}

function encodePayload(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function toPublicSession(account: DoctorAccount): DoctorSession {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    hospital: account.hospital,
    specialty: account.specialty,
    role: account.role,
    licenseId: account.licenseId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
}

function verifyHash(password: string, salt: string, expectedHash: string) {
  const actualHash = scryptSync(password, salt, 64).toString("hex");
  const actualBuffer = Buffer.from(actualHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

async function loadDoctorAccounts() {
  return readJsonFile<DoctorAccount[]>("seeds", "doctor-users.json");
}

export async function authenticateDoctor(email: string, password: string) {
  const accounts = await loadDoctorAccounts();
  const account = accounts.find(
    (candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase(),
  );

  if (!account) {
    return null;
  }

  if (!verifyHash(password, account.passwordSalt, account.passwordHash)) {
    return null;
  }

  return toPublicSession(account);
}

export function createSessionCookieValue(session: DoctorSession) {
  const payload: SessionPayload = {
    sub: session.id,
    name: session.name,
    email: session.email,
    hospital: session.hospital,
    specialty: session.specialty,
    role: session.role,
    licenseId: session.licenseId,
    exp: session.expiresAt,
  };

  const encodedPayload = encodePayload(payload);
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function buildSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

function parseSessionCookieValue(cookieValue: string): DoctorSession | null {
  const [encodedPayload, signature] = cookieValue.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as SessionPayload;

    if (!payload.exp || payload.exp < Date.now()) {
      return null;
    }

    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      hospital: payload.hospital,
      specialty: payload.specialty,
      role: payload.role,
      licenseId: payload.licenseId,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function getOptionalDoctorSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return parseSessionCookieValue(token);
}

export async function requireDoctorSession(nextPath: string) {
  const session = await getOptionalDoctorSession();

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return session;
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function sanitizeNextPath(candidate?: string | null) {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/search";
  }

  return candidate;
}
