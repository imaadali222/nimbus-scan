import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "cspm_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? "http://localhost:4000";

function secureCookie() {
  return process.env.NODE_ENV === "production";
}

export async function GET() {
  const cookieStore = await cookies();
  const authenticated = Boolean(cookieStore.get(SESSION_COOKIE)?.value);
  return NextResponse.json({ authenticated }, { status: 200 });
}

export async function POST(request: Request) {
  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (token.length < 20) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
  return response;
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await fetch(`${apiBaseUrl.replace(/\/$/, "")}/auth/revoke`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store"
      });
    } catch {
      // Best effort: still clear the browser session cookie.
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  });
  return response;
}
