import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import type { MedicationSchedule } from "@/lib/medications"

export const dynamic = "force-dynamic"

const redis = Redis.fromEnv()
const STORE_KEY = "oasi-store"

type Store = { schedules: MedicationSchedule[]; updatedAt: string; deviceStatus?: unknown }

async function readStore(): Promise<Store> {
  const store = await redis.get<Store>(STORE_KEY)
  return store ?? { schedules: [], updatedAt: new Date(0).toISOString() }
}

async function writeStore(store: Store) {
  await redis.set(STORE_KEY, store)
}

function isSchedule(value: unknown): value is MedicationSchedule {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<MedicationSchedule>
  return typeof item.id === "string" && typeof item.medicine === "string" && typeof item.dose === "string" && /^\d{2}:\d{2}$/.test(item.time ?? "") && Array.isArray(item.days) && typeof item.active === "boolean"
}

export async function GET() {
  const store = await readStore()
  return NextResponse.json({ schedules: store.schedules, updatedAt: store.updatedAt })
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.schedules) || !body.schedules.every(isSchedule)) {
    return NextResponse.json({ error: "Formato de horarios invalido" }, { status: 400 })
  }
  const current = await readStore()
  const store: Store = { ...current, schedules: body.schedules, updatedAt: new Date().toISOString() }
  await writeStore(store)
  return NextResponse.json({ schedules: store.schedules, updatedAt: store.updatedAt })
}
