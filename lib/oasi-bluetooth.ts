import type { MedicationSchedule } from "@/lib/medications"

// El firmware del ESP32 debe publicar este servicio y su característica de escritura.
export const OASI_SERVICE_UUID = "6f617369-0001-4d44-5350-333200000001"
export const OASI_SCHEDULE_CHARACTERISTIC_UUID = "6f617369-0002-4d44-5350-333200000001"

type GattCharacteristic = {
  writeValue?: (value: BufferSource) => Promise<void>
  writeValueWithResponse?: (value: BufferSource) => Promise<void>
}

type GattService = {
  getCharacteristic: (uuid: string) => Promise<GattCharacteristic>
}

type GattServer = {
  getPrimaryService: (uuid: string) => Promise<GattService>
}

type GattConnection = {
  connected: boolean
  connect: () => Promise<GattServer>
  disconnect: () => void
}

type BluetoothDevice = {
  id: string
  name?: string
  gatt?: GattConnection
  addEventListener: (type: "gattserverdisconnected", listener: () => void) => void
  removeEventListener: (type: "gattserverdisconnected", listener: () => void) => void
}

type BluetoothApi = {
  requestDevice: (options: {
    filters: Array<{ namePrefix: string }>
    optionalServices: string[]
  }) => Promise<BluetoothDevice>
}

type NavigatorWithBluetooth = Navigator & { bluetooth?: BluetoothApi }

export type BluetoothSession = {
  deviceName: string
  deviceId: string
  disconnect: () => void
  syncSchedules: (schedules: MedicationSchedule[]) => Promise<void>
}

export function getWebBluetoothAvailability() {
  if (typeof window === "undefined") return { available: false, reason: "" }
  if (!(navigator as NavigatorWithBluetooth).bluetooth) {
    return {
      available: false,
      reason: "Este navegador no permite conectar dispositivos por Bluetooth.",
    }
  }
  if (!window.isSecureContext) {
    return {
      available: false,
      reason: "La conexión Bluetooth necesita abrirse desde una página segura.",
    }
  }
  return { available: true, reason: "" }
}

export async function connectToOasiDevice({
  onDeviceSelected,
  onDisconnected,
}: {
  onDeviceSelected: (name: string) => void
  onDisconnected: () => void
}): Promise<BluetoothSession> {
  const bluetooth = (navigator as NavigatorWithBluetooth).bluetooth
  if (!bluetooth) throw new Error("Web Bluetooth no está disponible")

  const device = await bluetooth.requestDevice({
    filters: [{ namePrefix: "OASI" }, { namePrefix: "ESP32" }],
    optionalServices: [OASI_SERVICE_UUID],
  })

  const deviceName = device.name || "ESP32 sin nombre"
  onDeviceSelected(deviceName)

  if (!device.gatt) throw new Error("El dispositivo no permite una conexión de datos")

  const server = await device.gatt.connect()
  const service = await server.getPrimaryService(OASI_SERVICE_UUID)
  const characteristic = await service.getCharacteristic(OASI_SCHEDULE_CHARACTERISTIC_UUID)
  const disconnectedHandler = () => onDisconnected()
  device.addEventListener("gattserverdisconnected", disconnectedHandler)

  return {
    deviceName,
    deviceId: device.id,
    disconnect: () => {
      device.removeEventListener("gattserverdisconnected", disconnectedHandler)
      if (device.gatt?.connected) device.gatt.disconnect()
    },
    syncSchedules: async (schedules) => {
      if (!device.gatt?.connected) throw new Error("El dispensador se ha desconectado")

      const messages = [
        { type: "schedule_clear" },
        ...schedules.map((schedule) => ({
          type: "schedule",
          id: schedule.id,
          medicine: schedule.medicine,
          dose: schedule.dose,
          time: schedule.time,
          days: schedule.days,
          active: schedule.active,
        })),
        { type: "schedule_commit", count: schedules.length },
      ]

      for (const message of messages) {
        const payload = new TextEncoder().encode(`${JSON.stringify(message)}\n`)
        if (payload.byteLength > 512) {
          throw new Error("Uno de los horarios contiene demasiado texto")
        }

        if (characteristic.writeValueWithResponse) {
          await characteristic.writeValueWithResponse(payload)
        } else if (characteristic.writeValue) {
          await characteristic.writeValue(payload)
        } else {
          throw new Error("El dispensador no acepta la sincronización")
        }
      }
    },
  }
}

export async function simulateScheduleSync() {
  await new Promise((resolve) => window.setTimeout(resolve, 900))
}
