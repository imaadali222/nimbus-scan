import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    service: "web",
    status: "ok",
    timestamp: new Date().toISOString()
  });
}
