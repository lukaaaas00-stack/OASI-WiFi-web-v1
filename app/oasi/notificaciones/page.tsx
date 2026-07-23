"use client"

import { useEffect, useState } from "react"

export default function NotificacionesPage() {
  const [phone, setPhone] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/oasi/notify-config")
      .then((res) => res.json())
      .then((data) => {
        setPhone(data.phone ?? "")
        setApiKey(data.apiKey ?? "")
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/oasi/notify-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, apiKey }),
      })
      if (!res.ok) throw new Error("No se pudo guardar")
      setMessage("Guardado correctamente. Ya vas a recibir avisos por WhatsApp.")
    } catch {
      setMessage("Hubo un error al guardar. Probá de nuevo.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Cargando...</div>
  }

  return (
    <div style={{ padding: 24, maxWidth: 420, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Notificaciones por WhatsApp</h1>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 20 }}>
        Vas a recibir un mensaje cada vez que OASI dispense una dosis de medicación.
      </p>

      <ol style={{ fontSize: 13, color: "#555", marginBottom: 20, paddingLeft: 18 }}>
        <li>Guarda en tus contactos el número: <b>+34 644 66 30 07</b></li>
        <li>
          Envíale por WhatsApp el mensaje: <br />
          <code>I allow callmebot to send me messages</code>
        </li>
        <li>Te va a responder con tu API key. Copiala y pegala abajo.</li>
      </ol>

      <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Tu número de WhatsApp (con código de país, sin +)</label>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Ej: 595981234567"
        style={{ width: "100%", padding: 10, marginBottom: 16, borderRadius: 8, border: "1px solid #ccc" }}
      />

      <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>API key de CallMeBot</label>
      <input
        type="text"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Ej: 123456"
        style={{ width: "100%", padding: 10, marginBottom: 16, borderRadius: 8, border: "1px solid #ccc" }}
      />

      <button
        onClick={handleSave}
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
        {saving ? "Guardando..." : "Guardar"}
      </button>

      {message && <p style={{ fontSize: 13, marginTop: 12 }}>{message}</p>}
    </div>
  )
}
