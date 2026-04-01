# GCS Telemetry Stack

Bu repo, harita tabanli frontend ile ROS Bridge uzerinden telemetri alan TypeScript backend'i ayni proje icinde tutar.

## Folder Structure

```text
.
├── public/
├── src/                          # Vite + React harita arayuzu
├── server/
│   ├── src/
│   │   ├── bootstrap/            # HTTP server bootstrap
│   │   ├── config/               # Ortam degiskeni ve runtime config
│   │   ├── shared/logging/       # Ortak logger
│   │   └── modules/telemetry/
│   │       ├── domain/
│   │       │   ├── constants/    # Topic sabitleri, limitler, mod haritalari
│   │       │   ├── dto/          # Telemetry patch/event DTO'lari
│   │       │   ├── ports/        # Publisher gibi soyut portlar
│   │       │   └── types/        # Connection state ve topic tipleri
│   │       ├── application/
│   │       │   └── services/     # Orchestration ve throttled publish servisi
│   │       └── infrastructure/
│   │           ├── ros/          # ROS connection, subscriber, parser, sanitizer
│   │           └── websocket/    # Socket.io gateway
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── package.json
└── vite.config.js
```

## Backend Responsibilities

- `RosConnectionManager`: ROS Bridge baglanti yasam dongusu, reconnect ve state publish
- `RosTopicSubscriber`: Leader ve follower UAV topic subscription yonetimi
- `RosTelemetryParser`: `NavSatFix`, `Imu`, `PoseStamped`, `Status`, `Airspeed` gibi mesajlari normalize etme
- `RosTelemetrySanitizer`: stale message, rate-limit, angle normalization ve sinir kontrolu
- `TelemetryStreamService`: patch birlestirme ve sabit frekansta Socket.io yayini
- `TelemetryGateway`: istemcilere `telemetry:snapshot`, `telemetry:batch` ve `telemetry:connection-state` event'leri gonderme

## Commands

Frontend:

```bash
npm run dev
```

Backend:

```bash
npm run server:dev
npm run server:check
npm run server:build
```

Frontend, varsayilan olarak backend'e `http://<ayni-host>:4000` adresinden baglanir.
Gerekirse `VITE_GCS_BACKEND_URL` ile override edebilirsiniz.

## Backend Runtime Defaults

- ROS Bridge: `ws://localhost:9090`
- Socket/HTTP portu: `4000`
- Broadcast interval: `100 ms`
- Health endpoint: `GET /api/gcs/health`
- Snapshot endpoint: `GET /api/gcs/telemetry`

`.env.example` icindeki degiskenleri kullanarak topic adlari, follower araligi, reconnect suresi ve CORS davranisini ozellestirebilirsiniz.
