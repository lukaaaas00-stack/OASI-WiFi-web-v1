"use client"

import { useState } from "react"

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

  async function handleAnalyze() {
    setError("")
    setSavedMessage("")
    setDrafts([])
    if (!text.trim()) {
      setError("Escribe primero una descripción del horario.")
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
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Agregar horario por texto</h1>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 20 }}>
        Describí con tus palabras uno o varios horarios. Por ejemplo: &quot;una alarma a las 2 de la tarde para
        tomar Losartán, 1 comprimido&quot;, o &quot;dos alarmas: a las 8 de la mañana y a las 9 de la noche, para
        Metformina 500mg&quot;.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribí acá tu horario..."
        rows={4}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 8,
          border: "1px solid #ccc",
          fontSize: 15,
          marginBottom: 12,
          resize: "vertical",
        }}
      />

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
                style={{ width: "100%", padding: 8, marginBottom: 6, borderRadius: 6, border: "1px solid #ccc" }}
              />
              <input
                type="text"
                value={draft.dose}
                onChange={(e) => updateDraft(index, "dose", e.target.value)}
                placeholder="Dosis"
                style={{ width: "100%", padding: 8, marginBottom: 6, borderRadius: 6, border: "1px solid #ccc" }}
              />
              <input
                type="time"
                value={draft.time}
                onChange={(e) => updateDraft(index, "time", e.target.value)}
                style={{ width: "100%", padding: 8, marginBottom: 6, borderRadius: 6, border: "1px solid #ccc" }}
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
