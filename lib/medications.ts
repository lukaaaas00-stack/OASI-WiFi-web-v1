export const WEEK_DAYS = [
  { id: "lunes", short: "L", label: "Lunes", jsDay: 1 },
  { id: "martes", short: "M", label: "Martes", jsDay: 2 },
  { id: "miercoles", short: "X", label: "Miércoles", jsDay: 3 },
  { id: "jueves", short: "J", label: "Jueves", jsDay: 4 },
  { id: "viernes", short: "V", label: "Viernes", jsDay: 5 },
  { id: "sabado", short: "S", label: "Sábado", jsDay: 6 },
  { id: "domingo", short: "D", label: "Domingo", jsDay: 0 },
] as const

export type WeekDayId = (typeof WEEK_DAYS)[number]["id"]

export type MedicationSchedule = {
  id: string
  medicine: string
  dose: string
  time: string
  days: WeekDayId[]
  active: boolean
}

export const EXAMPLE_SCHEDULES: MedicationSchedule[] = [
  {
    id: "ejemplo-losartan",
    medicine: "Losartán",
    dose: "1 comprimido de 50 mg",
    time: "08:00",
    days: WEEK_DAYS.map((day) => day.id),
    active: true,
  },
  {
    id: "ejemplo-metformina",
    medicine: "Metformina",
    dose: "1 comprimido de 850 mg",
    time: "14:00",
    days: WEEK_DAYS.map((day) => day.id),
    active: true,
  },
  {
    id: "ejemplo-atorvastatina",
    medicine: "Atorvastatina",
    dose: "1 comprimido de 20 mg",
    time: "21:30",
    days: ["lunes", "martes", "miercoles", "jueves", "viernes"],
    active: true,
  },
]

export function sortSchedules(schedules: MedicationSchedule[]) {
  return [...schedules].sort((a, b) => a.time.localeCompare(b.time))
}

export function formatDays(days: WeekDayId[]) {
  if (days.length === 7) return "Todos los días"

  const workDays = ["lunes", "martes", "miercoles", "jueves", "viernes"]
  if (days.length === 5 && workDays.every((day) => days.includes(day as WeekDayId))) {
    return "De lunes a viernes"
  }

  return WEEK_DAYS.filter((day) => days.includes(day.id))
    .map((day) => day.short)
    .join(" · ")
}

export function getTodaySchedules(schedules: MedicationSchedule[], now = new Date()) {
  const today = WEEK_DAYS.find((day) => day.jsDay === now.getDay())?.id
  return sortSchedules(schedules.filter((schedule) => schedule.active && schedule.days.includes(today!)))
}

export function getNextDose(schedules: MedicationSchedule[], now = new Date()) {
  const active = schedules.filter((schedule) => schedule.active)

  for (let offset = 0; offset < 8; offset += 1) {
    const date = new Date(now)
    date.setDate(now.getDate() + offset)
    const day = WEEK_DAYS.find((item) => item.jsDay === date.getDay())?.id

    const candidates = active
      .filter((schedule) => schedule.days.includes(day!))
      .map((schedule) => {
        const [hours, minutes] = schedule.time.split(":").map(Number)
        const doseDate = new Date(date)
        doseDate.setHours(hours, minutes, 0, 0)
        return { schedule, date: doseDate }
      })
      .filter((candidate) => candidate.date.getTime() > now.getTime())
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    if (candidates[0]) return candidates[0]
  }

  return null
}
