# OASI por Wi-Fi

La web mantiene el diseño original y ahora guarda los horarios en `data/oasi-store.json` mediante estas rutas:

- `GET /api/oasi/schedules`: el ESP32 lee los horarios.
- `PUT /api/oasi/schedules`: la web guarda la lista completa.
- `POST /api/oasi/status`: el ESP32 informa que sigue conectado.
- `GET /api/oasi/status`: la web consulta el estado del dispensador.

## Prueba local

1. Instala dependencias con `pnpm install`.
2. Ejecuta `pnpm dev`.
3. Abre la web y modifica un horario: se guardará en `data/oasi-store.json`.

Para que el ESP32 alcance el servidor durante una prueba local, el ordenador y el ESP32 deben estar conectados a la misma red Wi-Fi y el servidor debe escucharse en la red local. La URL para el ESP32 será `http://IP-DEL-ORDENADOR:3000`.

## Antes de publicar

Este almacenamiento por archivo sirve para el prototipo local. Para publicar OASI y usarlo desde fuera de la casa, hay que sustituirlo por una base de datos persistente (Teable, Supabase o Firebase) y exigir una clave secreta al ESP32 en cada petición. Nunca se debe publicar una ruta que permita modificar horarios sin autenticación.
