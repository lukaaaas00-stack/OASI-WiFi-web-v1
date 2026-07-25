import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const VALID_DAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"]

const SYSTEM_PROMPT = `Convertís texto libre en español, escrito por el usuario de una app de recordatorios de medicación, en una lista de horarios estructurados.

Reglas:
- Si el usuario describe más de una alarma en el mismo texto, devolvé varios objetos.
- "time" siempre en formato de 24 horas "HH:MM". Si dice "las dos" sin aclarar, asumí de la tarde (14:00) salvo que el contexto indique claramente la mañana. "mediodía"=12:00, "medianoche"=00:00, "en la mañana"=08:00, "en la tarde"=15:00, "en la noche"=21:00.
- "days" es un array con cualquier combinación de: domingo, lunes, martes, miercoles, jueves, viernes, sabado (sin tildes). Si no especifica días, o dice "todos los días"/"diario", devolvé los 7. Si dice "entre semana"/"días de semana", devolvé lunes a viernes. Si dice "fin de semana", sabado y domingo.
- "medicine" es el nombre del medicamento tal como lo escribió el usuario (corregí errores de tipeo obvios, no inventes nombres).
- "dose" es la dosis/cantidad como la describió el usuario (ej: "1 comprimido de 50mg"). Si no la menciona, poné "1 dosis".
- "active" siempre true.
- Si el texto no tiene información suficiente para armar ni un horario (no dice hora, ni medicamento), devolvé una lista vacía.

Respondé SOLO con JSON válido, con esta forma exacta:
{"schedules":[{"medicine":"...","dose":"...","time":"HH:MM","days":["..."],"active":true}]}`

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const text = typeof body?.text === "string" ? body.text.trim() : ""
  if (!text) {
    return NextResponse.json({ error: "Escribe una descripción del horario." }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Falta configurar GEMINI_API_KEY en el servidor." }, { status: 500 })
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    )

    if (!response.ok) {
      const detail = await response.text()
      console.error("Error de la API de Gemini:", detail)
      return NextResponse.json({ error: "No se pudo analizar el texto en este momento." }, { status: 502 })
    }

    const data = await response.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"

    let parsed: { schedules?: unknown[] }
    try {
      parsed = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: "No se entendió el texto. Probá describirlo de otra forma." }, { status: 422 })
    }

    const schedules = Array.isArray(parsed.schedules)
      ? parsed.schedules
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item) => ({
            medicine: typeof item.medicine === "string" ? item.medicine : "",
            dose: typeof item.dose === "string" ? item.dose : "1 dosis",
            time: typeof item.time === "string" && /^\d{2}:\d{2}$/.test(item.time) ? item.time : "08:00",
            days: Array.isArray(item.days) ? item.days.filter((day) => VALID_DAYS.includes(day)) : [],
            active: true,
          }))
          .filter((item) => item.medicine.length > 0)
          .map((item) => ({ ...item, days: item.days.length > 0 ? item.days : VALID_DAYS }))
      : []

    return NextResponse.json({ schedules })
  } catch (error) {
    console.error("Error al llamar a la API de Gemini:", error)
    return NextResponse.json({ error: "No se pudo analizar el texto en este momento." }, { status: 502 })
  }
}
