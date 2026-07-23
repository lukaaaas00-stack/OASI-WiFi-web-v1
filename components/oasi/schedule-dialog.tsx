"use client"

import { useEffect, useState, type FormEvent } from "react"
import { CalendarDays, Check, Clock3, Pill, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { WEEK_DAYS, type MedicationSchedule, type WeekDayId } from "@/lib/medications"

type ScheduleDraft = Omit<MedicationSchedule, "id">

const EMPTY_DRAFT: ScheduleDraft = {
  medicine: "",
  dose: "",
  time: "08:00",
  days: [],
  active: true,
}

export function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule: MedicationSchedule | null
  onSave: (draft: ScheduleDraft) => void
}) {
  const [draft, setDraft] = useState<ScheduleDraft>(EMPTY_DRAFT)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    setDraft(
      schedule
        ? {
            medicine: schedule.medicine,
            dose: schedule.dose,
            time: schedule.time,
            days: schedule.days,
            active: schedule.active,
          }
        : EMPTY_DRAFT
    )
    setError("")
  }, [open, schedule])

  function toggleDay(day: WeekDayId, checked: boolean) {
    setDraft((current) => ({
      ...current,
      days: checked
        ? [...current.days, day]
        : current.days.filter((selectedDay) => selectedDay !== day),
    }))
    setError("")
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.medicine.trim() || !draft.dose.trim() || !draft.time) {
      setError("Completa el medicamento, la dosis y la hora.")
      return
    }
    if (draft.days.length === 0) {
      setError("Selecciona al menos un día de la semana.")
      return
    }
    onSave({
      ...draft,
      medicine: draft.medicine.trim(),
      dose: draft.dose.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-lg border-zinc-800 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-zinc-800 px-5 py-5 text-left sm:px-7">
          <DialogTitle className="text-2xl font-semibold text-white">
            {schedule ? "Editar horario" : "Agregar horario"}
          </DialogTitle>
          <DialogDescription className="text-base text-zinc-400">
            Indica cuándo debe preparar el dispensador esta medicación.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 px-5 py-6 sm:px-7">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="medicine" className="flex items-center gap-2 text-base font-semibold text-zinc-200">
                  <Pill className="size-5 text-teal-300" aria-hidden="true" />
                  Medicamento
                </Label>
                <Input
                  id="medicine"
                  value={draft.medicine}
                  onChange={(event) => setDraft((current) => ({ ...current, medicine: event.target.value }))}
                  placeholder="Ej.: Losartán"
                  autoComplete="off"
                  required
                  className="h-12 border-zinc-700 bg-zinc-950 px-4 text-base focus-visible:ring-4 focus-visible:ring-teal-700/25"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dose" className="flex items-center gap-2 text-base font-semibold text-zinc-200">
                  <Check className="size-5 text-teal-300" aria-hidden="true" />
                  Dosis
                </Label>
                <Input
                  id="dose"
                  value={draft.dose}
                  onChange={(event) => setDraft((current) => ({ ...current, dose: event.target.value }))}
                  placeholder="Ej.: 1 comprimido de 50 mg"
                  autoComplete="off"
                  required
                  className="h-12 border-zinc-700 bg-zinc-950 px-4 text-base focus-visible:ring-4 focus-visible:ring-teal-700/25"
                />
              </div>
            </div>

            <div className="max-w-xs space-y-2">
              <Label htmlFor="time" className="flex items-center gap-2 text-base font-semibold text-zinc-200">
                <Clock3 className="size-5 text-teal-300" aria-hidden="true" />
                Hora
              </Label>
              <Input
                id="time"
                type="time"
                value={draft.time}
                onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))}
                required
                className="h-12 border-zinc-700 bg-zinc-950 px-4 text-lg focus-visible:ring-4 focus-visible:ring-teal-700/25"
              />
            </div>

            <fieldset>
              <legend className="mb-3 flex items-center gap-2 text-base font-semibold text-zinc-200">
                <CalendarDays className="size-5 text-teal-300" aria-hidden="true" />
                Días de la semana
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {WEEK_DAYS.map((day) => {
                  const checked = draft.days.includes(day.id)
                  return (
                    <Label
                      key={day.id}
                      htmlFor={`day-${day.id}`}
                      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-base font-medium text-zinc-200 has-[[data-state=checked]]:border-teal-700 has-[[data-state=checked]]:bg-teal-950/50"
                    >
                      <Checkbox
                        id={`day-${day.id}`}
                        checked={checked}
                        onCheckedChange={(value) => toggleDay(day.id, value === true)}
                        className="size-6 border-2 border-zinc-500 data-[state=checked]:border-teal-700 data-[state=checked]:bg-teal-700 focus-visible:ring-4 focus-visible:ring-teal-700/25"
                      />
                      {day.label}
                    </Label>
                  )
                })}
              </div>
            </fieldset>

            <div className="flex min-h-16 items-center justify-between gap-4 border-y border-zinc-800 py-3">
              <div>
                <Label htmlFor="active" className="text-base font-semibold text-zinc-100">
                  Horario activo
                </Label>
                <p className="mt-0.5 text-sm text-zinc-400">
                  {draft.active ? "El dispensador tendrá en cuenta este horario." : "Este horario quedará pausado."}
                </p>
              </div>
              <Switch
                id="active"
                checked={draft.active}
                onCheckedChange={(active) => setDraft((current) => ({ ...current, active }))}
                className="scale-125 data-[state=checked]:bg-teal-700"
              />
            </div>

            <p className="min-h-6 text-base font-medium text-red-400" role="alert" aria-live="polite">
              {error}
            </p>
          </div>

          <DialogFooter className="border-t border-zinc-800 bg-black px-5 py-4 sm:px-7">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-12 border-zinc-700 px-5 text-base"
            >
              Cancelar
            </Button>
            <Button type="submit" className="h-12 bg-teal-800 px-5 text-base text-white hover:bg-teal-900">
              <Save className="size-5" aria-hidden="true" />
              Guardar horario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
