"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Mic, Sparkles, Square, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WEEK_DAYS, type WeekDayId, type MedicationSchedule } from "@/lib/medications"

type ScheduleDraft = Omit<MedicationSchedule, "id">

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))

export function AddByVoice({ onAdd }: { onAdd: (drafts: ScheduleDraft[]) => void }) {
  const [text, setText] = useState("")
  const [analyzing, setAnalyzing] = useState(false)
  const [drafts, setDrafts] = useState<ScheduleDraft[]>([])
  const [error, setError] = useState("")
  const [listening, setListening] = useState(false)
  const [micSupported, setMicSupported] = useState(true)

  // any: la Web Speech API todavía no tiene tipos oficiales estables en TypeScript
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionClass) {
      setMicSupported(false)
      return
    }
    const recognition = new SpeechRecognitionClass()
    recognition.lang = "es-AR"
    recognition.continuous = true
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ""
      setText((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript))
    }
    recognition.onerror = (event: any) => {
      setListening(false)
      const messages: Record<string, string> = {
        "not-allowed": "El navegador bloqueó el micrófono. Permití el micrófono para este sitio e intentá de nuevo.",
        "no-speech": "No se detectó voz. Acercate al micrófono e intentá de nuevo.",
        "audio-capture": "No se encontró un micrófono disponible en este dispositivo.",
        network: "El reconocimiento de voz necesita conexión a Internet.",
      }
      setError(messages[event.error] ?? "No se pudo iniciar el dictado por voz. Podés escribir el horario.")
    }
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

  function updateDraft(index: number, field: "medicine" | "time", value: string) {
    setDrafts((current) => current.map((draft, i) => (i === index ? { ...draft, [field]: value } : draft)))
  }

  function toggleDraftDay(index: number, day: WeekDayId, checked: boolean) {
    setDrafts((current) =>
      current.map((draft, i) =>
        i === index
          ? { ...draft, days: checked ? [...draft.days, day] : draft.days.filter((d) => d !== day) }
          : draft
      )
    )
  }

  function removeDraft(index: number) {
    setDrafts((current) => current.filter((_, i) => i !== index))
  }

  function handleConfirm() {
    onAdd(drafts)
    setDrafts([])
    setText("")
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="add-voice-title">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Medicación</p>
        <h1 id="add-voice-title" className="mt-1 text-3xl font-bold text-foreground sm:text-4xl">Agregar por voz o texto</h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Describí con tus palabras uno o varios horarios, escribiendo o dictando por voz. Por ejemplo:
          «una alarma a las 2 de la tarde para tomar Losartán».
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="relative">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Escribí o tocá el micrófono para dictar…"
            rows={4}
            className="w-full resize-y rounded-lg border border-border bg-background px-4 py-3 pr-16 text-base text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
          />
          {micSupported ? (
            <button
              type="button"
              onClick={toggleListening}
              aria-label={listening ? "Detener dictado" : "Dictar por voz"}
              title={listening ? "Detener dictado" : "Dictar por voz"}
              className={`absolute bottom-3 right-3 flex size-11 items-center justify-center rounded-full text-white outline-none transition-shadow focus-visible:ring-4 ${
                listening ? "bg-destructive shadow-[0_0_0_6px_rgba(166,64,44,0.18)] focus-visible:ring-destructive/30" : "bg-primary focus-visible:ring-primary/30"
              }`}
            >
              {listening ? <Square className="size-4" aria-hidden="true" /> : <Mic className="size-5" aria-hidden="true" />}
            </button>
          ) : null}
        </div>

        {listening ? (
          <p className="mt-2 text-sm font-medium text-primary" role="status">
            Escuchando… tocá el botón de nuevo cuando termines.
          </p>
        ) : null}

        {!micSupported ? (
          <p className="mt-2 text-sm text-muted-foreground">
            El dictado por voz no está disponible en este navegador — podés escribir en el cuadro de texto igual.
          </p>
        ) : null}

        <Button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="mt-4 h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-60"
        >
          <Sparkles className="size-5" aria-hidden="true" />
          {analyzing ? "Analizando…" : "Analizar con IA"}
        </Button>

        {error ? (
          <div className="mt-4 flex gap-2 text-destructive" role="alert">
            <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        ) : null}
      </section>

      {drafts.length > 0 ? (
        <section className="space-y-3" aria-label="Horarios detectados, pendientes de confirmar">
          <p className="text-base font-semibold text-foreground">Revisá antes de guardar (podés editar cualquier campo):</p>

          {drafts.map((draft, index) => (
            <article key={index} className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="max-w-md">
                <div className="space-y-1.5">
                  <Label htmlFor={`draft-medicine-${index}`} className="text-sm font-semibold text-foreground">Medicamento</Label>
                  <Input
                    id={`draft-medicine-${index}`}
                    value={draft.medicine}
                    onChange={(event) => updateDraft(index, "medicine", event.target.value)}
                    className="h-11 border-border bg-background px-3 text-base focus-visible:ring-4 focus-visible:ring-primary/25"
                  />
                </div>
              </div>

              <div className="mt-3 max-w-48 space-y-1.5">
                <Label htmlFor={`draft-hour-${index}`} className="text-sm font-semibold text-foreground">Hora</Label>
                <div className="flex items-center gap-2">
                  <select
                    id={`draft-hour-${index}`}
                    aria-label="Hora"
                    value={draft.time.split(":")[0] ?? "08"}
                    onChange={(event) => updateDraft(index, "time", `${event.target.value}:${draft.time.split(":")[1] ?? "00"}`)}
                    className="h-11 flex-1 rounded-md border border-border bg-background px-3 font-mono text-base focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
                  >
                    {HOURS.map((hour) => (
                      <option key={hour} value={hour}>{hour}</option>
                    ))}
                  </select>
                  <span className="text-base font-semibold text-muted-foreground">:</span>
                  <select
                    id={`draft-minute-${index}`}
                    aria-label="Minuto"
                    value={draft.time.split(":")[1] ?? "00"}
                    onChange={(event) => updateDraft(index, "time", `${draft.time.split(":")[0] ?? "08"}:${event.target.value}`)}
                    className="h-11 flex-1 rounded-md border border-border bg-background px-3 font-mono text-base focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
                  >
                    {MINUTES.map((minute) => (
                      <option key={minute} value={minute}>{minute}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                <p className="text-sm font-semibold text-foreground">Días</p>
                <div className="flex flex-wrap gap-2">
                  {WEEK_DAYS.map((day) => {
                    const checked = draft.days.includes(day.id)
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => toggleDraftDay(index, day.id, !checked)}
                        aria-pressed={checked}
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-4 focus-visible:ring-primary/25 ${
                          checked ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {day.short}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={() => removeDraft(index)}
                className="mt-3 h-9 px-2 text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Quitar este horario
              </Button>
            </article>
          ))}

          <Button
            onClick={handleConfirm}
            className="h-12 w-full bg-accent text-base font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:ring-4 focus-visible:ring-accent/30"
          >
            <CheckCircle2 className="size-5" aria-hidden="true" />
            Confirmar y guardar {drafts.length === 1 ? "1 horario" : `${drafts.length} horarios`}
          </Button>
        </section>
      ) : null}
    </div>
  )
}
