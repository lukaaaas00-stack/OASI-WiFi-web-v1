import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const redis = Redis.fromEnv()
const NOTIFY_KEY = "oasi-notify-config"

type NotifyConfig = { phone: string; apiKey: string }

export async function GET() {
  const config = await redis.get<NotifyConfig>(NOTIFY_KEY)
  return NextResponse.json(config ?? { phone: "", apiKey: "" })
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.phone !== "string" || typeof body.apiKey !== "string") {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }
  const config: NotifyConfig = { phone: body.phone.trim(), apiKey: body.apiKey.trim() }
  await redis.set(NOTIFY_KEY, config)
  return NextResponse.json(config)
}
