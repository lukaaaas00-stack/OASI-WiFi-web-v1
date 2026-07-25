"use client"

import { useEffect, useRef, useState } from "react"

type DraftSchedule = {
  medicine: string
  dose: string
  time: string
  days: string[]
  active: boolean
}

type ExistingSchedule = DraftSchedule & { id: string }

const DAY_LABELS: Record<string, string> = {
  domingo: "Dom",
  lunes: "Lun",
  martes: "Mar",
  miercoles: "Mié",
  jueves: "Jue",
  viernes: "Vie",
  sabado: "Sáb",
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `horario-${Date.now()}`
}

export default function AgregarPorTextoPage() {
  const [text, setText] = useState("")
  const [analyzing, setAnalyzing] = useState(false)
  const [drafts, setDrafts] = useState<DraftSchedule[]>([])
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState("")
  const [listening, setListening] = useState(false)
  const [micSupported, setMicSupported] = useState(true)

  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionClass) {
      setMicSupported(false)
      return
    }

    const recognition = new SpeechRecognitionClass()
    recognition.lang = "es-ES"
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ""
      setText((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript))
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
  }, [])

  function toggleListening() {
    if (!recognitionRef.current) return
    if (listening) {
      recognitionRef.current.stop()
      setListening(false)
    } else {
      setError("")
      recognitionRef.current.start()
      setListening(true)
    }
  }

  async function handleAnalyze() {
    setError("")
    setSavedMessage("")
    setDrafts([])
    if (!text.trim()) {
      setError("Escribe o dictá primero una descripción del horario.")
      return
    }
    setAnalyzing(true)
    try {
      const res = await fetch("/api/oasi/parse-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No se pudo analizar el texto.")
      if (!data.schedules || data.schedules.length === 0) {
        setError("No se encontró ningún horario en ese texto. Probá ser más específico (medicamento, dosis y hora).")
        return
      }
      setDrafts(data.schedules)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo analizar el texto.")
    } finally {
      setAnalyzing(false)
    }
  }

  function updateDraft(index: number, field: keyof DraftSchedule, value: string) {
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, [field]: value } : draft))
    )
  }

  function removeDraft(index: number) {
    setDrafts((current) => current.filter((_, i) => i !== index))
  }

  async function handleConfirm() {
    setSaving(true)
    setError("")
    try {
      const currentRes = await fetch("/api/oasi/schedules")
      const currentData = await currentRes.json()
      const existing: ExistingSchedule[] = Array.isArray(currentData.schedules) ? currentData.schedules : []

      const newOnes: ExistingSchedule[] = drafts.map((draft) => ({ ...draft, id: makeId() }))
      const merged = [...existing, ...newOnes]

      const saveRes = await fetch("/api/oasi/schedules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedules: merged }),
      })
      if (!saveRes.ok) throw new Error("No se pudieron guardar los horarios.")

      setSavedMessage(`Se ${newOnes.length === 1 ? "agregó 1 horario" : `agregaron ${newOnes.length} horarios`} correctamente.`)
      setDrafts([])
      setText("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los horarios.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Agregar horario por texto o voz</h1>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 20 }}>
        Describí con tus palabras uno o varios horarios, escribiendo o tocando el micrófono. Por ejemplo:
        &quot;una alarma a las 2 de la tarde para tomar Losartán, 1 comprimido&quot;.
      </p>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribí o tocá el micrófono para dictar..."
          rows={4}
          style={{
            width: "100%",
            padding: 12,
            paddingRight: 56,
            borderRadius: 8,
            border: "1px solid #ccc",
            fontSize: 15,
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        {micSupported && (
          <button
            onClick={toggleListening}
            aria-label={listening ? "Detener dictado" : "Dictar por voz"}
            title={listening ? "Detener dictado" : "Dictar por voz"}
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              background: listening ? "#dc2626" : "#0f766e",
              color: "#fff",
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: listening ? "0 0 0 6px rgba(220,38,38,0.2)" : "none",
              transition: "box-shadow 0.2s",
            }}
          >
            {listening ? "⏹" : "🎤"}
          </button>
        )}
      </div>

      {listening && (
        <p style={{ fontSize: 13, color: "#0f766e", marginBottom: 12 }} role="status">
          Escuchando... tocá el botón de nuevo cuando termines.
        </p>
      )}

      {!micSupported && (
        <p style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
          El dictado por voz no está disponible en este navegador — podés escribir en el cuadro de texto igual.
        </p>
      )}

      <button
        onClick={handleAnalyze}
        disabled={analyzing}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 8,
          border: "none",
          background: "#0f766e",
          color: "#fff",
          fontSize: 15,
          cursor: "pointer",
          marginBottom: 16,
        }}
      >
        {analyzing ? "Analizando..." : "Analizar con IA"}
      </button>

      {error && (
        <p style={{ fontSize: 13, color: "#dc2626", marginBottom: 16 }} role="alert">
          {error}
        </p>
      )}

      {savedMessage && (
        <p style={{ fontSize: 13, color: "#059669", marginBottom: 16 }} role="status">
          {savedMessage}
        </p>
      )}

      {drafts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Revisá antes de guardar (podés editar cualquier campo):
          </p>
          {drafts.map((draft, index) => (
            <div
              key={index}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <input
                type="text"
                value={draft.medicine}
                onChange={(e) => updateDraft(index, "medicine", e.target.value)}
                placeholder="Medicamento"
                style={{ width: "100%", padding: 8, marginBottom: 6, borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box" }}
              />
              <input
                type="text"
                value={draft.dose}
                onChange={(e) => updateDraft(index, "dose", e.target.value)}
                placeholder="Dosis"
                style={{ width: "100%", padding: 8, marginBottom: 6, borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box" }}
              />
              <input
                type="time"
                value={draft.time}
                onChange={(e) => updateDraft(index, "time", e.target.value)}
                style={{ width: "100%", padding: 8, marginBottom: 6, borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box" }}
              />
              <p style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                Días: {draft.days.map((d) => DAY_LABELS[d] ?? d).join(", ")}
              </p>
              <button
                onClick={() => removeDraft(index)}
                style={{
                  fontSize: 12,
                  color: "#dc2626",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Quitar este horario
              </button>
            </div>
          ))}

          <button
            onClick={handleConfirm}
            disabled={saving}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "none",
              background: "#111",
              color: "#fff",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            {saving ? "Guardando..." : "Confirmar y guardar"}
          </button>
        </div>
      )}
    </div>
  )
}
