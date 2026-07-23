"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  CirclePlus,
  Clock3,
  Home,
  LoaderCircle,
  Pencil,
  Pill,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ScheduleDialog } from "@/components/oasi/schedule-dialog"
import {
  EXAMPLE_SCHEDULES,
  formatDays,
  getNextDose,
  getTodaySchedules,
  sortSchedules,
  type MedicationSchedule,
} from "@/lib/medications"
import { getDeviceStatus, loadSchedulesFromServer, saveSchedulesToServer } from "@/lib/oasi-wifi"

const STORAGE_KEY = "oasi-medication-schedules-v1"

type View = "home" | "schedules" | "connection"
type ConnectionMode = "real" | "demo"
type ConnectionStatus = "disconnected" | "searching" | "connecting" | "connected" | "error"
type SyncStatus = "idle" | "syncing" | "success" | "error"
type ScheduleDraft = Omit<MedicationSchedule, "id">

const NAV_ITEMS: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "schedules", label: "Horarios", icon: CalendarClock },
  { id: "connection", label: "Conexión", icon: Wifi },
]

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `horario-${Date.now()}`
}

function getFriendlyError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No se eligió ningún dispositivo. Puedes volver a intentarlo."
  }
  if (error instanceof Error && error.message) return error.message
  return "No se pudo completar la conexión. Acerca el dispensador e inténtalo otra vez."
}

function formatNextDate(date: Date, now: Date) {
  const sameDay = date.toDateString() === now.toDateString()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const isTomorrow = date.toDateString() === tomorrow.toDateString()
  const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })

  if (sameDay) return `Hoy, ${time}`
  if (isTomorrow) return `Mañana, ${time}`
  const day = date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${time}`
}

function ConnectionPill({
  status,
  mode,
  deviceName,
}: {
  status: ConnectionStatus
  mode: ConnectionMode
  deviceName: string | null
}) {
  if (status === "connected" && mode === "demo") {
    return (
      <Badge className="gap-2 rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-950/40">
        <ShieldCheck className="size-4" aria-hidden="true" />
        Modo demo activo
      </Badge>
    )
  }

  if (status === "connected") {
    return (
      <Badge className="gap-2 rounded-md border border-emerald-800 bg-emerald-950/50 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-950/50">
        <Wifi className="size-4" aria-hidden="true" />
        {deviceName || "Conectado"}
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="gap-2 rounded-md border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-300">
      <WifiOff className="size-4" aria-hidden="true" />
      Desconectado
    </Badge>
  )
}

function ScheduleItem({
  schedule,
  onEdit,
  onDelete,
  onToggle,
}: {
  schedule: MedicationSchedule
  onEdit: () => void
  onDelete: () => void
  onToggle: (active: boolean) => void
}) {
  return (
    <article className={`rounded-lg border bg-zinc-950 p-4 shadow-sm sm:p-5 ${schedule.active ? "border-zinc-800" : "border-zinc-800 opacity-70"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-24 items-center gap-3 sm:block">
          <p className="text-3xl font-bold tabular-nums text-white sm:text-2xl">{schedule.time}</p>
          <Badge
            variant="outline"
            className={`mt-0 rounded-md px-2 py-1 text-xs sm:mt-2 ${
              schedule.active
                ? "border-emerald-800 bg-emerald-950/50 text-emerald-200"
                : "border-zinc-700 bg-zinc-900 text-zinc-300"
            }`}
          >
            {schedule.active ? "Activo" : "Pausado"}
          </Badge>
        </div>

        <div className="min-w-0 flex-1 border-zinc-800 sm:border-l sm:pl-5">
          <h3 className="break-words text-lg font-semibold text-white">{schedule.medicine}</h3>
          <p className="mt-1 break-words text-base text-zinc-300">{schedule.dose}</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
            <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
            {formatDays(schedule.days)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4 sm:border-0 sm:pt-0">
          <div className="mr-auto flex min-h-11 items-center gap-3 sm:mr-2">
            <Switch
              checked={schedule.active}
              onCheckedChange={onToggle}
              aria-label={`${schedule.active ? "Pausar" : "Activar"} ${schedule.medicine}`}
              className="data-[state=checked]:bg-teal-700"
            />
            <span className="text-sm font-medium text-zinc-300 sm:hidden">
              {schedule.active ? "Activo" : "Pausado"}
            </span>
          </div>
          <Button
            variant="outline"
            onClick={onEdit}
            className="h-11 border-zinc-700 px-3 text-zinc-200 focus-visible:ring-4 focus-visible:ring-teal-700/25"
          >
            <Pencil className="size-4" aria-hidden="true" />
            Editar
          </Button>
          <Button
            variant="outline"
            onClick={onDelete}
            className="h-11 border-red-900 px-3 text-red-400 hover:bg-red-950/50 hover:text-red-300 focus-visible:ring-4 focus-visible:ring-red-700/25"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Eliminar
          </Button>
        </div>
      </div>
    </article>
  )
}

function TodayItem({ schedule }: { schedule: MedicationSchedule }) {
  return (
    <article className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-sm">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-teal-950/50 text-xl font-bold tabular-nums text-teal-200">
        {schedule.time}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-lg font-semibold text-white">{schedule.medicine}</h3>
        <p className="break-words text-base text-zinc-400">{schedule.dose}</p>
      </div>
      <CheckCircle2 className="hidden size-6 shrink-0 text-emerald-400 sm:block" aria-label="Horario activo" />
    </article>
  )
}

export default function OasiApp({ userMenu }: { userMenu: ReactNode }) {
  const [view, setView] = useState<View>("home")
  const [schedules, setSchedules] = useState<MedicationSchedule[]>([])
  const [storageReady, setStorageReady] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<MedicationSchedule | null>(null)
  const [deletingSchedule, setDeletingSchedule] = useState<MedicationSchedule | null>(null)
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("real")
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState("")
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle")
  const [syncMessage, setSyncMessage] = useState("Los horarios todavía no se han sincronizado.")
  const [lastSync, setLastSync] = useState<Date | null>(null)

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      setSchedules(EXAMPLE_SCHEDULES)
    } else {
      try {
        const parsed = JSON.parse(stored)
        setSchedules(Array.isArray(parsed) ? parsed : EXAMPLE_SCHEDULES)
      } catch {
        setSchedules(EXAMPLE_SCHEDULES)
        toast.error("No se pudieron recuperar los horarios guardados. Se cargaron ejemplos.")
      }
    }
    setStorageReady(true)

    void loadSchedulesFromServer()
      .then(({ schedules: remoteSchedules }) => {
        if (remoteSchedules.length > 0) setSchedules(sortSchedules(remoteSchedules))
      })
      .catch(() => {
        // La copia local permite seguir usando la interfaz si el servidor no está disponible.
      })
  }, [])

  useEffect(() => {
    if (storageReady) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules))
  }, [schedules, storageReady])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const sortedSchedules = useMemo(() => sortSchedules(schedules), [schedules])
  const todaySchedules = useMemo(() => getTodaySchedules(schedules, now), [schedules, now])
  const nextDose = useMemo(() => getNextDose(schedules, now), [schedules, now])

  async function syncWithDevice(nextSchedules = schedules) {
    setSyncStatus("syncing")
    setSyncMessage("Guardando horarios para el dispensador…")
    try {
      if (connectionMode === "demo") {
        await new Promise((resolve) => window.setTimeout(resolve, 650))
      } else {
        await saveSchedulesToServer(nextSchedules)
      }
      const syncedAt = new Date()
      setLastSync(syncedAt)
      setSyncStatus("success")
      setSyncMessage(
        connectionMode === "demo"
          ? "Prueba completada. No se enviaron datos a un dispositivo real."
          : "Horarios guardados. El ESP32 los descargará por Wi-Fi en su próxima sincronización."
      )
      toast.success(connectionMode === "demo" ? "Sincronización de prueba completada" : "Horarios sincronizados")
    } catch (error) {
      const message = getFriendlyError(error)
      setSyncStatus("error")
      setSyncMessage(message)
      toast.error("No se pudieron sincronizar los horarios")
    }
  }

  async function connectRealDevice() {
    setConnectionError("")
    setSyncStatus("idle")
    setConnectionStatus("connecting")
    try {
      const status = await getDeviceStatus()
      setDeviceName(status.deviceId)
      setConnectionStatus(status.online ? "connected" : "disconnected")
      if (status.online) {
        toast.success(`${status.deviceId} está conectado por Wi-Fi`)
      } else {
        setConnectionError("El servidor está listo, pero el ESP32 todavía no informó una conexión Wi-Fi.")
      }
      await syncWithDevice(schedules)
    } catch (error) {
      setConnectionStatus("error")
      setConnectionError(getFriendlyError(error))
    }
  }

  async function startDemo() {
    setConnectionMode("demo")
    setConnectionError("")
    setDeviceName("ESP32 OASI de demostración")
    setConnectionStatus("connecting")
    await new Promise((resolve) => window.setTimeout(resolve, 650))
    setConnectionStatus("connected")
    setSyncStatus("idle")
    setSyncMessage("Modo de prueba activo. No hay un dispensador real conectado.")
    toast.info("Modo demostración iniciado")
  }

  function disconnectDevice() {
    setConnectionStatus("disconnected")
    setDeviceName(null)
    setSyncStatus("idle")
    setSyncMessage(
      connectionMode === "demo"
        ? "La demostración está detenida."
        : "Los horarios están guardados en esta aplicación y podrán sincronizarse al reconectar."
    )
    toast.info(connectionMode === "demo" ? "Modo demostración detenido" : "Dispensador desconectado")
  }

  function changeConnectionMode(mode: ConnectionMode) {
    if (mode === connectionMode) return
    setConnectionMode(mode)
    setConnectionStatus("disconnected")
    setDeviceName(null)
    setConnectionError("")
    setSyncStatus("idle")
    setSyncMessage("Los horarios todavía no se han sincronizado.")
  }

  function updateSchedules(nextSchedules: MedicationSchedule[], successMessage: string) {
    const sorted = sortSchedules(nextSchedules)
    setSchedules(sorted)
    toast.success(successMessage)
    if (connectionMode === "real") void syncWithDevice(sorted)
  }

  function saveSchedule(draft: ScheduleDraft) {
    if (editingSchedule) {
      updateSchedules(
        schedules.map((schedule) => (schedule.id === editingSchedule.id ? { ...draft, id: schedule.id } : schedule)),
        "Horario actualizado"
      )
    } else {
      updateSchedules([...schedules, { ...draft, id: makeId() }], "Horario agregado")
    }
    setDialogOpen(false)
    setEditingSchedule(null)
  }

  function openNewSchedule() {
    setEditingSchedule(null)
    setDialogOpen(true)
  }

  function confirmDelete() {
    if (!deletingSchedule) return
    updateSchedules(
      schedules.filter((schedule) => schedule.id !== deletingSchedule.id),
      "Horario eliminado"
    )
    setDeletingSchedule(null)
  }

  const connectionLabel =
    connectionStatus === "connecting"
        ? "Conectando con el dispensador…"
        : connectionStatus === "connected"
          ? connectionMode === "demo"
            ? "Demostración conectada"
            : "Dispensador conectado"
          : connectionStatus === "error"
            ? "No se pudo conectar"
            : "Dispensador desconectado"

  function renderHome() {
    return (
      <div className="space-y-8">
        <section aria-labelledby="home-title">
          <p className="text-sm font-semibold uppercase text-teal-300">Panel principal</p>
          <div className="mt-1 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 id="home-title" className="text-3xl font-bold text-white sm:text-4xl">Inicio</h1>
              <p className="mt-2 text-base text-zinc-400">
                {now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
            <Button
              onClick={openNewSchedule}
              className="h-12 justify-center bg-teal-800 px-5 text-base text-white hover:bg-teal-900 focus-visible:ring-4 focus-visible:ring-teal-700/30"
            >
              <Plus className="size-5" aria-hidden="true" />
              Agregar horario
            </Button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-5" aria-label="Resumen del día">
          <article className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 shadow-sm lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase text-zinc-400">Dispensador</p>
                <h2 className="mt-2 text-xl font-semibold text-white">{connectionLabel}</h2>
                <p className="mt-2 text-base text-zinc-400">
                  {connectionStatus === "connected"
                    ? connectionMode === "demo"
                      ? "Prueba sin hardware real"
                      : deviceName
                    : "Conecta el ESP32 para enviar los horarios"}
                </p>
              </div>
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-md ${
                  connectionStatus === "connected"
                    ? connectionMode === "demo"
                      ? "bg-amber-950 text-amber-200"
                      : "bg-emerald-950 text-emerald-300"
                    : "bg-zinc-900 text-zinc-400"
                }`}
              >
                {connectionStatus === "connected" ? (
                  <Wifi className="size-6" aria-hidden="true" />
                ) : (
                  <WifiOff className="size-6" aria-hidden="true" />
                )}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setView("connection")}
              className="mt-6 h-11 w-full border-zinc-700 text-base text-zinc-200 focus-visible:ring-4 focus-visible:ring-teal-700/25"
            >
              <Wifi className="size-5" aria-hidden="true" />
              {connectionStatus === "connected" ? "Ver conexión" : "Conectar dispensador"}
            </Button>
          </article>

          <article className="rounded-lg border border-teal-900 bg-zinc-950 p-5 text-white shadow-sm lg:col-span-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase text-teal-200">Próxima toma</p>
                {nextDose ? (
                  <>
                    <p className="mt-3 text-2xl font-bold sm:text-3xl">{nextDose.schedule.medicine}</p>
                    <p className="mt-2 text-lg text-teal-50">{nextDose.schedule.dose}</p>
                    <p className="mt-5 flex items-center gap-2 text-xl font-semibold text-white">
                      <Clock3 className="size-6" aria-hidden="true" />
                      {formatNextDate(nextDose.date, now)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-2xl font-bold">No hay próximas tomas</p>
                    <p className="mt-2 text-base text-teal-100">Agrega o activa un horario para verlo aquí.</p>
                  </>
                )}
              </div>
              <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-zinc-800">
                <Pill className="size-7" aria-hidden="true" />
              </div>
            </div>
          </article>
        </section>

        <section aria-labelledby="today-title">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 id="today-title" className="text-2xl font-bold text-white">Tomas de hoy</h2>
              <p className="mt-1 text-base text-zinc-400">
                {todaySchedules.length === 1 ? "1 horario activo" : `${todaySchedules.length} horarios activos`}
              </p>
            </div>
            <Button variant="ghost" onClick={() => setView("schedules")} className="h-11 text-base font-semibold text-teal-300 hover:bg-teal-950/50 hover:text-teal-200">
              Ver horarios
            </Button>
          </div>

          {storageReady && todaySchedules.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {todaySchedules.map((schedule) => <TodayItem key={schedule.id} schedule={schedule} />)}
            </div>
          ) : storageReady ? (
            <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950 px-6 py-10 text-center">
              <CalendarClock className="mx-auto size-8 text-zinc-400" aria-hidden="true" />
              <h3 className="mt-3 text-lg font-semibold text-zinc-100">No hay tomas para hoy</h3>
              <p className="mt-1 text-base text-zinc-400">Puedes revisar los horarios o agregar uno nuevo.</p>
            </div>
          ) : (
            <div className="h-28 animate-pulse rounded-lg bg-zinc-800" aria-label="Cargando horarios" />
          )}
        </section>
      </div>
    )
  }

  function renderSchedules() {
    return (
      <div className="space-y-6">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end" aria-labelledby="schedules-title">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-300">Medicación</p>
            <h1 id="schedules-title" className="mt-1 text-3xl font-bold text-white sm:text-4xl">Horarios</h1>
            <p className="mt-2 text-base text-zinc-400">
              {schedules.length === 1 ? "1 horario guardado" : `${schedules.length} horarios guardados`}
            </p>
          </div>
          <Button
            onClick={openNewSchedule}
            className="h-12 bg-teal-800 px-5 text-base text-white hover:bg-teal-900 focus-visible:ring-4 focus-visible:ring-teal-700/30"
          >
            <CirclePlus className="size-5" aria-hidden="true" />
            Agregar horario
          </Button>
        </section>

        {storageReady && sortedSchedules.length > 0 ? (
          <section className="space-y-3" aria-label="Lista de horarios ordenados por hora">
            {sortedSchedules.map((schedule) => (
              <ScheduleItem
                key={schedule.id}
                schedule={schedule}
                onEdit={() => {
                  setEditingSchedule(schedule)
                  setDialogOpen(true)
                }}
                onDelete={() => setDeletingSchedule(schedule)}
                onToggle={(active) =>
                  updateSchedules(
                    schedules.map((item) => (item.id === schedule.id ? { ...item, active } : item)),
                    active ? "Horario activado" : "Horario pausado"
                  )
                }
              />
            ))}
          </section>
        ) : storageReady ? (
          <section className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950 px-6 py-14 text-center" aria-label="Sin horarios">
            <CalendarClock className="mx-auto size-10 text-zinc-400" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold text-white">Todavía no hay horarios</h2>
            <p className="mx-auto mt-2 max-w-md text-base text-zinc-400">
              Agrega la primera medicación para preparar el dispensador.
            </p>
            <Button onClick={openNewSchedule} className="mt-6 h-12 bg-teal-800 px-5 text-base text-white hover:bg-teal-900">
              <Plus className="size-5" aria-hidden="true" />
              Agregar primer horario
            </Button>
          </section>
        ) : (
          <div className="space-y-3" aria-label="Cargando horarios">
            <div className="h-32 animate-pulse rounded-lg bg-zinc-800" />
            <div className="h-32 animate-pulse rounded-lg bg-zinc-800" />
          </div>
        )}
      </div>
    )
  }

  function renderConnection() {
    const isBusy = connectionStatus === "searching" || connectionStatus === "connecting"
    const isConnected = connectionStatus === "connected"

    return (
      <div className="space-y-7">
        <section aria-labelledby="connection-title">
          <p className="text-sm font-semibold uppercase text-teal-300">Dispositivo</p>
          <h1 id="connection-title" className="mt-1 text-3xl font-bold text-white sm:text-4xl">Conexión</h1>
          <p className="mt-2 text-base text-zinc-400">Gestiona el vínculo entre OASI y el dispensador ESP32.</p>
        </section>

        <section aria-labelledby="mode-title">
          <h2 id="mode-title" className="text-lg font-semibold text-white">Tipo de conexión</h2>
          <div className="mt-3 inline-flex w-full rounded-lg border border-zinc-700 bg-zinc-950 p-1 sm:w-auto" role="radiogroup" aria-label="Tipo de conexión">
            <button
              type="button"
              role="radio"
              aria-checked={connectionMode === "real"}
              onClick={() => changeConnectionMode("real")}
              className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md px-5 text-base font-semibold outline-none focus-visible:ring-4 focus-visible:ring-teal-700/30 sm:min-w-48 ${
                connectionMode === "real" ? "bg-teal-800 text-white" : "text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              <Wifi className="size-5" aria-hidden="true" />
              Wi-Fi
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={connectionMode === "demo"}
              onClick={() => changeConnectionMode("demo")}
              className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md px-5 text-base font-semibold outline-none focus-visible:ring-4 focus-visible:ring-amber-700/30 sm:min-w-48 ${
                connectionMode === "demo" ? "bg-amber-500 text-black" : "text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              <ShieldCheck className="size-5" aria-hidden="true" />
              Modo demo
            </button>
          </div>
        </section>

        {connectionMode === "demo" ? (
          <section className="flex gap-4 rounded-lg border border-amber-800 bg-amber-950/40 p-5" aria-label="Aviso de modo demostración">
            <ShieldCheck className="mt-0.5 size-6 shrink-0 text-amber-300" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold text-amber-100">Estás en modo demostración</h2>
              <p className="mt-1 text-base text-amber-200">Las acciones son simuladas. No hay ningún ESP32 conectado y no se envían datos por Wi-Fi.</p>
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 shadow-sm sm:p-6" aria-labelledby="device-status-title">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-md ${
                  isConnected
                    ? connectionMode === "demo"
                      ? "bg-amber-950 text-amber-200"
                      : "bg-emerald-950 text-emerald-300"
                    : connectionStatus === "error"
                      ? "bg-red-950 text-red-300"
                      : "bg-zinc-900 text-zinc-400"
                }`}
              >
                {isBusy ? (
                  <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
                ) : isConnected ? (
                  <Wifi className="size-6" aria-hidden="true" />
                ) : connectionStatus === "error" ? (
                  <AlertCircle className="size-6" aria-hidden="true" />
                ) : (
                  <WifiOff className="size-6" aria-hidden="true" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold uppercase text-zinc-400">Estado</p>
                <h2 id="device-status-title" className="mt-1 text-xl font-semibold text-white" aria-live="polite">{connectionLabel}</h2>
                <p className="mt-1 text-base text-zinc-400">
                  {deviceName || (connectionMode === "real" ? "Ningún dispositivo seleccionado" : "Simulador detenido")}
                </p>
              </div>
            </div>

            {isConnected ? (
              <Button
                variant="outline"
                onClick={disconnectDevice}
                className="h-12 border-zinc-700 px-5 text-base text-zinc-200 focus-visible:ring-4 focus-visible:ring-red-700/20"
              >
                <WifiOff className="size-5" aria-hidden="true" />
                {connectionMode === "demo" ? "Detener demo" : "Desconectar"}
              </Button>
            ) : connectionMode === "real" ? (
              <Button
                onClick={connectRealDevice}
                disabled={isBusy}
                className="h-12 bg-teal-800 px-5 text-base text-white hover:bg-teal-900 focus-visible:ring-4 focus-visible:ring-teal-700/30 disabled:opacity-60"
              >
                {isBusy ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Wifi className="size-5" aria-hidden="true" />}
                {connectionStatus === "connecting" ? "Comprobando…" : "Comprobar ESP32"}
              </Button>
            ) : (
              <Button
                onClick={startDemo}
                disabled={isBusy}
                className="h-12 bg-amber-500 px-5 text-base font-semibold text-black hover:bg-amber-400 focus-visible:ring-4 focus-visible:ring-amber-700/30"
              >
                {isBusy ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-5" aria-hidden="true" />}
                {isBusy ? "Iniciando…" : "Iniciar demostración"}
              </Button>
            )}
          </div>

          {connectionError ? (
            <div className="mt-5 flex gap-3 border-t border-red-900 pt-4 text-red-300" role="alert">
              <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p className="text-base font-medium">{connectionError}</p>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 shadow-sm sm:p-6" aria-labelledby="sync-title">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-md ${
                  syncStatus === "success"
                    ? "bg-emerald-950 text-emerald-300"
                    : syncStatus === "error"
                      ? "bg-red-950 text-red-300"
                      : "bg-zinc-900 text-zinc-400"
                }`}
              >
                {syncStatus === "syncing" ? (
                  <RefreshCw className="size-6 animate-spin" aria-hidden="true" />
                ) : syncStatus === "success" ? (
                  <CheckCircle2 className="size-6" aria-hidden="true" />
                ) : syncStatus === "error" ? (
                  <AlertCircle className="size-6" aria-hidden="true" />
                ) : (
                  <Save className="size-6" aria-hidden="true" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold uppercase text-zinc-400">Horarios</p>
                <h2 id="sync-title" className="mt-1 text-xl font-semibold text-white">Sincronización</h2>
                <p className={`mt-1 text-base ${syncStatus === "error" ? "font-medium text-red-400" : "text-zinc-400"}`} aria-live="polite">
                  {syncMessage}
                </p>
                {lastSync ? (
                  <p className="mt-2 text-sm font-medium text-zinc-400">
                    Última sincronización: {lastSync.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => void syncWithDevice()}
              disabled={!isConnected || syncStatus === "syncing"}
              className="h-12 border-zinc-700 px-5 text-base text-zinc-200 focus-visible:ring-4 focus-visible:ring-teal-700/25 disabled:opacity-60"
            >
              <RefreshCw className={`size-5 ${syncStatus === "syncing" ? "animate-spin" : ""}`} aria-hidden="true" />
              Sincronizar ahora
            </Button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-black text-white">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-50 -translate-y-24 rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 font-semibold text-white outline-none focus:translate-y-0 focus:ring-4 focus:ring-teal-300"
      >
        Ir al contenido principal
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-zinc-800 bg-zinc-950 lg:flex">
        <div className="flex h-20 items-center gap-3 border-b border-zinc-800 px-6">
          <div className="flex size-11 items-center justify-center rounded-md bg-teal-800 text-white">
            <Pill className="size-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">OASI</p>
            <p className="text-xs font-semibold uppercase text-zinc-400">Medicación segura</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2 p-4" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                aria-current={view === item.id ? "page" : undefined}
                className={`flex min-h-13 w-full items-center gap-3 rounded-md px-4 text-left text-base font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-teal-700/25 ${
                  view === item.id ? "bg-teal-950/50 text-teal-100" : "text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                <Icon className={`size-5 ${view === item.id ? "text-teal-300" : "text-zinc-400"}`} aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-zinc-800 p-4">
          <ConnectionPill status={connectionStatus} mode={connectionMode} deviceName={deviceName} />
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-18 items-center justify-between border-b border-zinc-800 bg-black/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-md bg-teal-800 text-white">
              <Pill className="size-5" aria-hidden="true" />
            </div>
            <span className="hidden text-xl font-bold min-[380px]:inline">OASI</span>
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-semibold text-zinc-400">Gestión del dispensador</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ConnectionPill status={connectionStatus} mode={connectionMode} deviceName={deviceName} />
            {userMenu}
          </div>
        </header>

        <main id="main-content" className="mx-auto max-w-6xl px-4 py-7 pb-28 sm:px-6 sm:py-9 lg:px-8 lg:pb-12">
          {view === "home" ? renderHome() : view === "schedules" ? renderSchedules() : renderConnection()}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-zinc-700 bg-zinc-950 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_18px_rgba(15,23,42,0.08)] lg:hidden" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-2 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-teal-700/30 ${
                view === item.id ? "bg-teal-950/50 text-teal-100" : "text-zinc-400"
              }`}
            >
              <Icon className="size-5" aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </nav>

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingSchedule(null)
        }}
        schedule={editingSchedule}
        onSave={saveSchedule}
      />

      <AlertDialog open={Boolean(deletingSchedule)} onOpenChange={(open) => !open && setDeletingSchedule(null)}>
        <AlertDialogContent className="rounded-lg border-zinc-800 sm:max-w-lg">
          <AlertDialogHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-md bg-red-950 text-red-300">
              <Trash2 className="size-6" aria-hidden="true" />
            </div>
            <AlertDialogTitle className="text-2xl text-white">Eliminar horario</AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed text-zinc-400">
              {deletingSchedule
                ? `Se eliminará el horario de ${deletingSchedule.medicine} de las ${deletingSchedule.time}. Esta acción no se puede deshacer.`
                : "Este horario se eliminará de la aplicación."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-3">
            <AlertDialogCancel className="h-12 border-zinc-700 px-5 text-base">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="h-12 bg-red-700 px-5 text-base text-white hover:bg-red-800">
              <Trash2 className="size-5" aria-hidden="true" />
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
