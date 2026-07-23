import type { MedicationSchedule } from "@/lib/medications"

export type OasiDeviceStatus = {
  deviceId: string
  online: boolean
  updatedAt: string | null
  currentTime?: string
  nextDose?: string
  servoPosition?: number
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!response.ok) throw new Error("No se pudo comunicar con el servicio Wi-Fi de OASI")
  return response.json() as Promise<T>
}

export async function loadSchedulesFromServer() {
  return request<{ schedules: MedicationSchedule[] }>("/api/oasi/schedules", { cache: "no-store" })
}

export async function saveSchedulesToServer(schedules: MedicationSchedule[]) {
  return request<{ schedules: MedicationSchedule[]; updatedAt: string }>("/api/oasi/schedules", {
    method: "PUT",
    body: JSON.stringify({ schedules }),
  })
}

export async function getDeviceStatus() {
  return request<OasiDeviceStatus>("/api/oasi/status", { cache: "no-store" })
}
