import { NextResponse } from "next/server"
import { WEEK_DAYS } from "@/lib/medications"

export const dynamic = "force-dynamic"

const DAY_IDS = WEEK_DAYS.map((day) => day.id)

// Variables de entorno (Vercel → Settings → Environment Variables):
//   GEMINI_API_KEY  (obligatoria; también se aceptan GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY y GOOGLE_AI_API_KEY)
//   GEMINI_MODEL    (opcional; por defecto "gemini-flash-latest")
const DEFAULT_MODEL = "gemini-flash-latest"

const SYSTEM_PROMPT = `Convertís descripciones en español (escritas o dictadas por voz) de horarios de medicación en datos estructurados para un dispensador automático.

Devolvé EXCLUSIVAMENTE un JSON válido, sin texto adicional, sin explicación, sin markdown, con esta forma exacta:
{"schedules":[{"medicine":"string","dose":"string","time":"HH:MM en 24 horas","days":["lunes"|"martes"|"miercoles"|"jueves"|"viernes"|"sabado"|"domingo"],"active":true}]}

Reglas:
- Si el texto describe más de un horario (varias medicaciones o varias horas), devolvé varios elementos en "schedules".
- "time" siempre en formato de 24 horas "HH:MM". Si dice "las dos" sin aclarar, asumí de la tarde (14:00) salvo que el contexto indique claramente la mañana. "mediodía"=12:00, "medianoche"=00:00, "en la mañana"=08:00, "en la tarde"=15:00, "en la noche"=21:00. Interpretá también horas en lenguaje natural ("2 de la tarde"="14:00", "8 y media de la mañana"="08:30").
- "days" es un array con cualquier combinación de estos identificadores, en minúscula y sin tildes: ${DAY_IDS.join(", ")}. Si no especifica días, o dice "todos los días"/"diario", devolvé los 7. Si dice "entre semana"/"días de semana", devolvé lunes a viernes. Si dice "fin de semana", sabado y domingo.
- "medicine" es el nombre del medicamento tal como lo escribió el usuario (corregí errores de tipeo obvios, no inventes nombres).
- "dose" es la dosis o cantidad como la describió el usuario (ej: "1 comprimido de 50 mg"). Si no la menciona, usá "1 dosis".
- "active" siempre debe ser true.
- Si el texto no tiene información suficiente para armar ni un horario (no dice hora ni medicamento), devolvé {"schedules":[]}.`

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
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta configurar GEMINI_API_KEY en las variables de entorno del proyecto." },
      { status: 500 }
    )
  }
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
      const hint =
        response.status === 400 || response.status === 403
          ? "Revisá que la clave GEMINI_API_KEY sea válida."
          : response.status === 404
            ? "El modelo no existe: probá definir GEMINI_MODEL (por ejemplo gemini-2.5-flash)."
            : "Probá de nuevo en un momento."
      return NextResponse.json({ error: `No se pudo analizar el texto (código ${response.status}). ${hint}` }, { status: 502 })
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

    const schedules = Array.isArray(parsed.schedules)
      ? parsed.schedules
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item) => ({
            medicine: typeof item.medicine === "string" ? item.medicine : "",
            dose: typeof item.dose === "string" && item.dose.trim() ? item.dose : "1 dosis",
            time: typeof item.time === "string" && /^\d{2}:\d{2}$/.test(item.time) ? item.time : "08:00",
            days: Array.isArray(item.days) ? item.days.filter((d) => DAY_IDS.includes(d as string)) : [],
            active: true,
          }))
          .map((item) => ({ ...item, days: item.days.length > 0 ? item.days : DAY_IDS }))
          .filter((item) => item.medicine.trim().length > 0)
      : []

    return NextResponse.json({ schedules })
  } catch (error) {
    console.error("parse-schedule falló", error)
    return NextResponse.json({ error: "No se pudo completar el análisis. Probá de nuevo." }, { status: 502 })
  }
}
