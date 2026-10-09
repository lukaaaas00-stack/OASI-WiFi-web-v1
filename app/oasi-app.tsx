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
  Mic,
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
import { AddByVoice } from "@/components/oasi/add-by-voice"
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

type View = "home" | "schedules" | "add-voice" | "connection"
type ConnectionMode = "real" | "demo"
type ConnectionStatus = "disconnected" | "searching" | "connecting" | "connected" | "error"
type SyncStatus = "idle" | "syncing" | "success" | "error"
type ScheduleDraft = Omit<MedicationSchedule, "id">

const NAV_ITEMS: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "schedules", label: "Horarios", icon: CalendarClock },
  { id: "add-voice", label: "Por voz", icon: Mic },
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
      <Badge className="gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent hover:bg-accent/10">
        <ShieldCheck className="size-4" aria-hidden="true" />
        Modo demo activo
      </Badge>
    )
  }

  if (status === "connected") {
    return (
      <Badge className="gap-2 rounded-full border border-[#C4D2AE] bg-[#E4EAD9] px-3 py-2 text-sm font-semibold text-[#33502F] hover:bg-[#E4EAD9]">
        <Wifi className="size-4" aria-hidden="true" />
        {deviceName || "Conectado"}
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="gap-2 rounded-full border-border bg-secondary px-3 py-2 text-sm font-semibold text-muted-foreground">
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
    <article className={`rounded-xl border bg-card p-4 shadow-sm sm:p-5 ${schedule.active ? "border-border" : "border-dashed border-border opacity-70"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-24 items-center gap-3 sm:block">
          <div
            className={`flex size-16 shrink-0 flex-col items-center justify-center rounded-full border-2 ${
              schedule.active ? "border-primary/30 bg-primary/5 text-primary" : "border-dashed border-border bg-secondary text-muted-foreground"
            }`}
            aria-hidden="true"
          >
            <span className="font-mono text-base font-semibold tabular-nums">{schedule.time}</span>
          </div>
          <Badge
            variant="outline"
            className={`mt-0 rounded-full px-2 py-1 text-xs sm:mt-2 ${
              schedule.active
                ? "border-[#C4D2AE] bg-[#E4EAD9] text-[#33502F]"
                : "border-border bg-secondary text-muted-foreground"
            }`}
          >
            {schedule.active ? "Activo" : "Pausado"}
          </Badge>
        </div>

        <div className="min-w-0 flex-1 border-border sm:border-l sm:pl-5">
          <h3 className="break-words text-lg font-semibold text-foreground">{schedule.medicine}</h3>
          <p className="mt-1 break-words text-base text-muted-foreground">{schedule.dose}</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
            {formatDays(schedule.days)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 sm:border-0 sm:pt-0">
          <div className="mr-auto flex min-h-11 items-center gap-3 sm:mr-2">
            <Switch
              checked={schedule.active}
              onCheckedChange={onToggle}
              aria-label={`${schedule.active ? "Pausar" : "Activar"} ${schedule.medicine}`}
              className="data-[state=checked]:bg-primary"
            />
            <span className="text-sm font-medium text-muted-foreground sm:hidden">
              {schedule.active ? "Activo" : "Pausado"}
            </span>
          </div>
          <Button
            variant="outline"
            onClick={onEdit}
            className="h-11 border-border px-3 text-foreground focus-visible:ring-4 focus-visible:ring-primary/25"
          >
            <Pencil className="size-4" aria-hidden="true" />
            Editar
          </Button>
          <Button
            variant="outline"
            onClick={onDelete}
            className="h-11 border-destructive/40 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-4 focus-visible:ring-destructive/25"
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
    <article className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/5 font-mono text-lg font-semibold tabular-nums text-primary">
        {schedule.time}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-lg font-semibold text-foreground">{schedule.medicine}</h3>
        <p className="break-words text-base text-muted-foreground">{schedule.dose}</p>
      </div>
      <CheckCircle2 className="hidden size-6 shrink-0 text-[#4A6E44] sm:block" aria-label="Horario activo" />
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
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">Panel principal</p>
          <div className="mt-1 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 id="home-title" className="text-3xl font-bold text-foreground sm:text-4xl">Inicio</h1>
              <p className="mt-2 text-base text-muted-foreground">
                {now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
            <Button
              onClick={openNewSchedule}
              className="h-12 justify-center bg-primary px-5 text-base text-primary-foreground hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              <Plus className="size-5" aria-hidden="true" />
              Agregar horario
            </Button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-5" aria-label="Resumen del día">
          <article className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dispensador</p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">{connectionLabel}</h2>
                <p className="mt-2 text-base text-muted-foreground">
                  {connectionStatus === "connected"
                    ? connectionMode === "demo"
                      ? "Prueba sin hardware real"
                      : deviceName
                    : "Conecta el ESP32 para enviar los horarios"}
                </p>
              </div>
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-full ${
                  connectionStatus === "connected"
                    ? connectionMode === "demo"
                      ? "bg-accent/10 text-accent"
                      : "bg-[#E4EAD9] text-[#33502F]"
                    : "bg-secondary text-muted-foreground"
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
              className="mt-6 h-11 w-full border-border text-base text-foreground focus-visible:ring-4 focus-visible:ring-primary/25"
            >
              <Wifi className="size-5" aria-hidden="true" />
              {connectionStatus === "connected" ? "Ver conexión" : "Conectar dispensador"}
            </Button>
          </article>

          <article className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary p-5 text-primary-foreground shadow-sm lg:col-span-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-primary-foreground/70">Próxima toma</p>
                {nextDose ? (
                  <>
                    <p className="mt-3 text-2xl font-bold sm:text-3xl">{nextDose.schedule.medicine}</p>
                    <p className="mt-2 text-lg text-primary-foreground/85">{nextDose.schedule.dose}</p>
                    <p className="mt-5 flex items-center gap-2 font-mono text-xl font-semibold tabular-nums">
                      <Clock3 className="size-6" aria-hidden="true" />
                      {formatNextDate(nextDose.date, now)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-2xl font-bold">No hay próximas tomas</p>
                    <p className="mt-2 text-base text-primary-foreground/80">Agrega o activa un horario para verlo aquí.</p>
                  </>
                )}
              </div>
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-foreground/10">
                <Pill className="size-7" aria-hidden="true" />
              </div>
            </div>
          </article>
        </section>

        <section aria-labelledby="today-title">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 id="today-title" className="text-2xl font-bold text-foreground">Tomas de hoy</h2>
              <p className="mt-1 text-base text-muted-foreground">
                {todaySchedules.length === 1 ? "1 horario activo" : `${todaySchedules.length} horarios activos`}
              </p>
            </div>
            <Button variant="ghost" onClick={() => setView("schedules")} className="h-11 text-base font-semibold text-primary hover:bg-primary/10 hover:text-primary">
              Ver horarios
            </Button>
          </div>

          {storageReady && todaySchedules.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {todaySchedules.map((schedule) => <TodayItem key={schedule.id} schedule={schedule} />)}
            </div>
          ) : storageReady ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
              <CalendarClock className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
              <h3 className="mt-3 text-lg font-semibold text-foreground">No hay tomas para hoy</h3>
              <p className="mt-1 text-base text-muted-foreground">Puedes revisar los horarios o agregar uno nuevo.</p>
            </div>
          ) : (
            <div className="h-28 animate-pulse rounded-xl bg-secondary" aria-label="Cargando horarios" />
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
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">Medicación</p>
            <h1 id="schedules-title" className="mt-1 text-3xl font-bold text-foreground sm:text-4xl">Horarios</h1>
            <p className="mt-2 text-base text-muted-foreground">
              {schedules.length === 1 ? "1 horario guardado" : `${schedules.length} horarios guardados`}
            </p>
          </div>
          <Button
            onClick={openNewSchedule}
            className="h-12 bg-primary px-5 text-base text-primary-foreground hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/30"
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
          <section className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center" aria-label="Sin horarios">
            <CalendarClock className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold text-foreground">Todavía no hay horarios</h2>
            <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">
              Agrega la primera medicación para preparar el dispensador.
            </p>
            <Button onClick={openNewSchedule} className="mt-6 h-12 bg-primary px-5 text-base text-primary-foreground hover:bg-primary/90">
              <Plus className="size-5" aria-hidden="true" />
              Agregar primer horario
            </Button>
          </section>
        ) : (
          <div className="space-y-3" aria-label="Cargando horarios">
            <div className="h-32 animate-pulse rounded-xl bg-secondary" />
            <div className="h-32 animate-pulse rounded-xl bg-secondary" />
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
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">Dispositivo</p>
          <h1 id="connection-title" className="mt-1 text-3xl font-bold text-foreground sm:text-4xl">Conexión</h1>
          <p className="mt-2 text-base text-muted-foreground">Gestiona el vínculo entre OASI y el dispensador ESP32.</p>
        </section>

        <section aria-labelledby="mode-title">
          <h2 id="mode-title" className="text-lg font-semibold text-foreground">Tipo de conexión</h2>
          <div className="mt-3 inline-flex w-full rounded-full border border-border bg-card p-1 sm:w-auto" role="radiogroup" aria-label="Tipo de conexión">
            <button
              type="button"
              role="radio"
              aria-checked={connectionMode === "real"}
              onClick={() => changeConnectionMode("real")}
              className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-5 text-base font-semibold outline-none focus-visible:ring-4 focus-visible:ring-primary/30 sm:min-w-48 ${
                connectionMode === "real" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
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
              className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-5 text-base font-semibold outline-none focus-visible:ring-4 focus-visible:ring-accent/30 sm:min-w-48 ${
                connectionMode === "demo" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <ShieldCheck className="size-5" aria-hidden="true" />
              Modo demo
            </button>
          </div>
        </section>

        {connectionMode === "demo" ? (
          <section className="flex gap-4 rounded-xl border border-accent/30 bg-accent/10 p-5" aria-label="Aviso de modo demostración">
            <ShieldCheck className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold text-accent">Estás en modo demostración</h2>
              <p className="mt-1 text-base text-accent/90">Las acciones son simuladas. No hay ningún ESP32 conectado y no se envían datos por Wi-Fi.</p>
            </div>
          </section>
        ) : null}

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="device-status-title">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-full ${
                  isConnected
                    ? connectionMode === "demo"
                      ? "bg-accent/10 text-accent"
                      : "bg-[#E4EAD9] text-[#33502F]"
                    : connectionStatus === "error"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-secondary text-muted-foreground"
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
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Estado</p>
                <h2 id="device-status-title" className="mt-1 text-xl font-semibold text-foreground" aria-live="polite">{connectionLabel}</h2>
                <p className="mt-1 text-base text-muted-foreground">
                  {deviceName || (connectionMode === "real" ? "Ningún dispositivo seleccionado" : "Simulador detenido")}
                </p>
              </div>
            </div>

            {isConnected ? (
              <Button
                variant="outline"
                onClick={disconnectDevice}
                className="h-12 border-border px-5 text-base text-foreground focus-visible:ring-4 focus-visible:ring-destructive/20"
              >
                <WifiOff className="size-5" aria-hidden="true" />
                {connectionMode === "demo" ? "Detener demo" : "Desconectar"}
              </Button>
            ) : connectionMode === "real" ? (
              <Button
                onClick={connectRealDevice}
                disabled={isBusy}
                className="h-12 bg-primary px-5 text-base text-primary-foreground hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-60"
              >
                {isBusy ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Wifi className="size-5" aria-hidden="true" />}
                {connectionStatus === "connecting" ? "Comprobando…" : "Comprobar ESP32"}
              </Button>
            ) : (
              <Button
                onClick={startDemo}
                disabled={isBusy}
                className="h-12 bg-accent px-5 text-base font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:ring-4 focus-visible:ring-accent/30"
              >
                {isBusy ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-5" aria-hidden="true" />}
                {isBusy ? "Iniciando…" : "Iniciar demostración"}
              </Button>
            )}
          </div>

          {connectionError ? (
            <div className="mt-5 flex gap-3 border-t border-destructive/30 pt-4 text-destructive" role="alert">
              <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p className="text-base font-medium">{connectionError}</p>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="sync-title">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-full ${
                  syncStatus === "success"
                    ? "bg-[#E4EAD9] text-[#33502F]"
                    : syncStatus === "error"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-secondary text-muted-foreground"
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
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Horarios</p>
                <h2 id="sync-title" className="mt-1 text-xl font-semibold text-foreground">Sincronización</h2>
                <p className={`mt-1 text-base ${syncStatus === "error" ? "font-medium text-destructive" : "text-muted-foreground"}`} aria-live="polite">
                  {syncMessage}
                </p>
                {lastSync ? (
                  <p className="mt-2 text-sm font-medium text-muted-foreground">
                    Última sincronización: {lastSync.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => void syncWithDevice()}
              disabled={!isConnected || syncStatus === "syncing"}
              className="h-12 border-border px-5 text-base text-foreground focus-visible:ring-4 focus-visible:ring-primary/25 disabled:opacity-60"
            >
              <RefreshCw className={`size-5 ${syncStatus === "syncing" ? "animate-spin" : ""}`} aria-hidden="true" />
              Sincronizar ahora
            </Button>
          </div>
        </section>
      </div>
    )
  }

  function renderAddVoice() {
    return (
      <AddByVoice
        onAdd={(drafts) => {
          if (drafts.length === 0) return
          const newSchedules = drafts.map((draft) => ({ ...draft, id: makeId() }))
          updateSchedules(
            [...schedules, ...newSchedules],
            newSchedules.length === 1 ? "Horario agregado" : `${newSchedules.length} horarios agregados`
          )
          setView("schedules")
        }}
      />
    )
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-50 -translate-y-24 rounded-md border border-border bg-card px-4 py-3 font-semibold text-foreground outline-none focus:translate-y-0 focus:ring-4 focus:ring-primary/30"
      >
        Ir al contenido principal
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Pill className="size-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-bold text-sidebar-foreground">OASI</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Medicación segura</p>
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
                className={`flex min-h-13 w-full items-center gap-3 rounded-lg px-4 text-left text-base font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-primary/25 ${
                  view === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <Icon className={`size-5 ${view === item.id ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <ConnectionPill status={connectionStatus} mode={connectionMode} deviceName={deviceName} />
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-18 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Pill className="size-5" aria-hidden="true" />
            </div>
            <span className="hidden text-xl font-bold min-[380px]:inline">OASI</span>
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-semibold text-muted-foreground">Gestión del dispensador</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ConnectionPill status={connectionStatus} mode={connectionMode} deviceName={deviceName} />
            {userMenu}
          </div>
        </header>

        <main id="main-content" className="mx-auto max-w-6xl px-4 py-7 pb-28 sm:px-6 sm:py-9 lg:px-8 lg:pb-12">
          {view === "home"
            ? renderHome()
            : view === "schedules"
              ? renderSchedules()
              : view === "add-voice"
                ? renderAddVoice()
                : renderConnection()}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_18px_rgba(29,38,36,0.08)] lg:hidden" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
                view === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground"
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
        <AlertDialogContent className="rounded-xl border-border sm:max-w-lg">
          <AlertDialogHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="size-6" aria-hidden="true" />
            </div>
            <AlertDialogTitle className="text-2xl text-foreground">Eliminar horario</AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed text-muted-foreground">
              {deletingSchedule
                ? `Se eliminará el horario de ${deletingSchedule.medicine} de las ${deletingSchedule.time}. Esta acción no se puede deshacer.`
                : "Este horario se eliminará de la aplicación."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-3">
            <AlertDialogCancel className="h-12 border-border px-5 text-base">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="h-12 bg-destructive px-5 text-base text-destructive-foreground hover:bg-destructive/90">
              <Trash2 className="size-5" aria-hidden="true" />
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
