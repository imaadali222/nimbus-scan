import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "cspm_session";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? "http://localhost:4000";
const passthroughRequestHeaders = new Set(["accept", "content-type"]);
const passthroughResponseHeaders = new Set(["content-type", "content-disposition", "cache-control", "etag", "x-request-id"]);

function errorResponse(status: number, error: string) {
  const requestId = randomUUID();
  const response = NextResponse.json({ error, requestId }, { status });
  response.headers.set("x-request-id", requestId);
  return response;
}

function buildUpstreamUrl(request: NextRequest, pathSegments: string[]) {
  const path = pathSegments.join("/");
  const url = new URL(`${apiBaseUrl.replace(/\/$/, "")}/${path}`);
  url.search = request.nextUrl.search;
  return url.toString();
}

async function forward(request: NextRequest, params: { path?: string[] }) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return errorResponse(401, "Not authenticated");
  }

  const pathSegments = params.path ?? [];
  if (pathSegments.length === 0) {
    return errorResponse(400, "Proxy path required");
  }

  const upstreamHeaders = new Headers();
  request.headers.forEach((value, key) => {
    if (passthroughRequestHeaders.has(key.toLowerCase())) {
      upstreamHeaders.set(key, value);
    }
  });
  upstreamHeaders.set("authorization", `Bearer ${token}`);

  const bodyText = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
  const body = bodyText && bodyText.length > 0 ? bodyText : undefined;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(buildUpstreamUrl(request, pathSegments), {
      method: request.method,
      headers: upstreamHeaders,
      body,
      redirect: "manual"
    });
  } catch (error) {
    return errorResponse(502, `Upstream API unreachable: ${error instanceof Error ? error.message : "request failed"}`);
  }

  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, key) => {
    if (passthroughResponseHeaders.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return forward(request, await context.params);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return forward(request, await context.params);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return forward(request, await context.params);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return forward(request, await context.params);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return forward(request, await context.params);
}
