import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const redis = Redis.fromEnv()
const STORE_KEY = "oasi-store"

type Status = { deviceId: string; online: boolean; updatedAt: string | null; currentTime?: string; nextDose?: string; servoPosition?: number }
type Store = { schedules: unknown[]; updatedAt: string; deviceStatus?: Status }

async function readStore(): Promise<Store> {
  const store = await redis.get<Store>(STORE_KEY)
  return store ?? { schedules: [], updatedAt: new Date(0).toISOString() }
}

async function writeStore(store: Store) {
  await redis.set(STORE_KEY, store)
}

export async function GET() {
  const status = (await readStore()).deviceStatus
  return NextResponse.json(status ?? { deviceId: "OASI-ESP32", online: false, updatedAt: null })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.deviceId !== "string") return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
  const current = await readStore()
  const status: Status = {
    deviceId: body.deviceId,
    online: true,
    updatedAt: new Date().toISOString(),
    ...(typeof body.currentTime === "string" ? { currentTime: body.currentTime } : {}),
    ...(typeof body.nextDose === "string" ? { nextDose: body.nextDose } : {}),
    ...(typeof body.servoPosition === "number" ? { servoPosition: body.servoPosition } : {}),
  }
  await writeStore({ ...current, deviceStatus: status })
  return NextResponse.json(status)
}
