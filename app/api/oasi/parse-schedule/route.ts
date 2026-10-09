import { NextResponse } from "next/server"
import { WEEK_DAYS } from "@/lib/medications"

export const dynamic = "force-dynamic"

const DAY_IDS = WEEK_DAYS.map((day) => day.id)
type DayId = (typeof DAY_IDS)[number]

type ParsedSchedule = {
  medicine: string
  dose: string
  time: string
  days: DayId[]
  active: true
}

// Variables de entorno (Vercel → Settings → Environment Variables):
//   GEMINI_API_KEY  (obligatoria; también se aceptan GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY y GOOGLE_AI_API_KEY)
//   GEMINI_MODEL    (opcional; por defecto "gemini-flash-latest")
const DEFAULT_MODEL = "gemini-flash-latest"

const SYSTEM_PROMPT = `Convertís descripciones en español (escritas o dictadas por voz) de horarios de medicación en datos estructurados para un dispensador automático.

Devolvé EXCLUSIVAMENTE un JSON válido, sin texto adicional, sin explicación, sin markdown, con esta forma exacta:
{"schedules":[{"medicine":"string","time":"HH:MM en 24 horas","days":["lunes"|"martes"|"miercoles"|"jueves"|"viernes"|"sabado"|"domingo"],"active":true}]}

Reglas:
- Si el texto describe más de un horario (varias medicaciones o varias horas), devolvé varios elementos en "schedules".
- "time" siempre en formato de 24 horas "HH:MM". Si dice "las dos" sin aclarar, asumí de la tarde (14:00) salvo que el contexto indique claramente la mañana. "mediodía"=12:00, "medianoche"=00:00, "en la mañana"=08:00, "en la tarde"=15:00, "en la noche"=21:00. Interpretá también horas en lenguaje natural ("2 de la tarde"="14:00", "8 y media de la mañana"="08:30").
- "days" es un array con cualquier combinación de estos identificadores, en minúscula y sin tildes: ${DAY_IDS.join(", ")}. Si no especifica días, o dice "todos los días"/"diario", devolvé los 7. Si dice "entre semana"/"días de semana", devolvé lunes a viernes. Si dice "fin de semana", sabado y domingo.
- "medicine" es el nombre del medicamento tal como lo escribió el usuario (corregí errores de tipeo obvios, no inventes nombres).
- "active" siempre debe ser true.
- Si el texto no tiene información suficiente para armar ni un horario (no dice hora ni medicamento), devolvé {"schedules":[]}.`

function daysFromText(text: string): DayId[] {
  const normalized = text.toLocaleLowerCase("es-AR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  if (/todos los dias|diario|cada dia/.test(normalized)) return [...DAY_IDS]
  if (/entre semana|dias de semana/.test(normalized)) return ["lunes", "martes", "miercoles", "jueves", "viernes"]
  if (/fin de semana/.test(normalized)) return ["sabado", "domingo"]

  const named = DAY_IDS.filter((day) => new RegExp(`\\b${day}\\b`).test(normalized))
  if (named.length > 0) return named

  // "Hoy" representa una toma para el dia actual de Argentina.
  if (/\bhoy\b/.test(normalized)) {
    const weekday = new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      weekday: "long",
    })
      .format(new Date())
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") as DayId
    return DAY_IDS.includes(weekday) ? [weekday] : [...DAY_IDS]
  }
  return [...DAY_IDS]
}

function parseTime(text: string): string | null {
  const numeric = text.match(/(?:a\s+las?|a\s+la)?\s*(\d{1,2})\s*[:.]\s*(\d{2})\b/i)
  if (numeric) {
    let hour = Number(numeric[1])
    const minute = Number(numeric[2])
    const normalized = text.toLocaleLowerCase("es-AR")
    if (/de la tarde|de la noche|pm/.test(normalized) && hour < 12) hour += 12
    if (/de la manana|am/.test(normalized) && hour === 12) hour = 0
    if (hour <= 23 && minute <= 59) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  }

  const wholeHour = text.match(/(?:a\s+las?|a\s+la)\s*(\d{1,2})(?:\s*(?:en punto|horas?))?\b/i)
  if (!wholeHour) return null
  let hour = Number(wholeHour[1])
  const normalized = text.toLocaleLowerCase("es-AR")
  if (/de la tarde|de la noche|pm/.test(normalized) && hour < 12) hour += 12
  if (/de la manana|am/.test(normalized) && hour === 12) hour = 0
  return hour <= 23 ? `${String(hour).padStart(2, "0")}:00` : null
}

// Respaldo sin servicio externo. Cubre frases comunes como:
// "Hoy tomar ibuprofeno a las 10:35".
function parseLocally(text: string): ParsedSchedule[] {
  const time = parseTime(text)
  if (!time) return []
  const medicineMatch = text.match(/(?:tomar|tome|medicamento(?:\s+es)?)\s+(.+?)(?=\s+(?:a\s+las?|a\s+la)\s+\d|\s*,|$)/i)
  const fallbackMedicine = text
    .replace(/(?:hoy|manana|todos los dias|diario|recordatorio|alarma|para|tomar|tome|a\s+las?|a\s+la|\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:am|pm)|un(?:a)?\s+(?:comprimido|pastilla|capsula|dosis)|\d+\s+(?:comprimidos?|pastillas?|capsulas?|dosis))/gi, " ")
    .replace(/[,.;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const medicine = (medicineMatch?.[1] ?? fallbackMedicine).trim()
  if (!medicine) return []

  return [{
    medicine: medicine.replace(/\s+/g, " "),
    dose: "",
    time,
    days: daysFromText(text),
    active: true,
  }]
}

function responseFromSchedules(schedules: unknown[]) {
  const valid = schedules
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      medicine: typeof item.medicine === "string" ? item.medicine : "",
      // Campo interno vacío para que los horarios ya guardados sigan siendo compatibles.
      dose: "",
      time: typeof item.time === "string" && /^\d{2}:\d{2}$/.test(item.time) ? item.time : "08:00",
      days: Array.isArray(item.days) ? item.days.filter((day) => DAY_IDS.includes(day as DayId)) : [],
      active: true as const,
    }))
    .map((item) => ({ ...item, days: item.days.length > 0 ? item.days : [...DAY_IDS] }))
    .filter((item) => item.medicine.trim().length > 0)
  return NextResponse.json({ schedules: valid })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 1500) : ""

  if (!text) {
    return NextResponse.json({ error: "Falta el texto a analizar." }, { status: 400 })
  }

  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY
  // La clave es opcional: si no existe, el analizador local permite que la
  // función siga siendo útil en Vercel, incluso sin cuota de Gemini.
  if (!apiKey) return responseFromSchedules(parseLocally(text))
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      }
    )

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      console.error("Gemini error", response.status, detail.slice(0, 500))
      // No bloquear la creación de un horario si Gemini está sin cuota,
      // temporalmente caído o con un modelo no disponible.
      const local = parseLocally(text)
      if (local.length > 0) return responseFromSchedules(local)
      return NextResponse.json({ error: `No se pudo analizar el texto (código ${response.status}). Indicá medicamento y hora, por ejemplo: “Ibuprofeno a las 10:35”.` }, { status: 502 })
    }

    const data = await response.json()
    const rawText = ((data.candidates?.[0]?.content?.parts ?? []) as { text?: string }[])
      .map((part) => part.text ?? "")
      .join("")
      .replace(/```json|```/g, "")
      .trim()

    let parsed: { schedules?: unknown }
    try {
      parsed = JSON.parse(rawText)
    } catch {
      console.error("Gemini devolvió algo que no es JSON:", rawText.slice(0, 300))
      return NextResponse.json({ error: "No se pudo interpretar la respuesta del análisis." }, { status: 502 })
    }

    return responseFromSchedules(Array.isArray(parsed.schedules) ? parsed.schedules : [])
  } catch (error) {
    console.error("parse-schedule falló", error)
    const local = parseLocally(text)
    if (local.length > 0) return responseFromSchedules(local)
    return NextResponse.json({ error: "No se pudo completar el análisis. Indicá medicamento y hora." }, { status: 502 })
  }
}
