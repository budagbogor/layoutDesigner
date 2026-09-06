# MOBENG WORKSHOP CAD DESIGNER — PRODUCTION DEPLOYMENT GUIDE

**Milestone**: M1 — Operational Deployment & UX  
**Runtime**: Next.js 15 App Router / Node.js 20 LTS  
**Architecture**: Local-First 2D CAD + Server Proxy  
**Target**: Option B (Docker pada Internal Server / Private Host MOBENG)

---

## 1. Deployment Overview & Topology

MOBENG CAD Designer MVP 1.0 beroperasi sebagai aplikasi web *local-first*:
- Seluruh manipulasi geometri CAD, rendering kanvas, validasi batasan fisik, scoring layout, dan persistensi proyek berjalan langsung di browser pengguna (*client-side*).
- Server bertindak sebagai penyedia aset statis yang efisien dan *server-to-server proxy* untuk request AI (`/api/ai/proxy`).
- **Server murni stateless**: Tidak memerlukan database relasional (PostgreSQL/MySQL), Redis, atau persistent disk volume.

```
+─────────────────────────────────────────────────────────────────────────+
|                    M1 PRODUCTION DEPLOYMENT ARCHITECTURE                |
+─────────────────────────────────────────────────────────────────────────+
|                                                                         |
|   [ MOBENG Internal User Browser (PSD / Expansion Team) ]               |
|      ├── Interactive 2D Canvas & Geometry Engine (React 19)             |
|      ├── Real-Time Constraint Validation & Scoring                      |
|      └── Local Project Persistence (browser localStorage)               |
|                                                                         |
|                                 │                                       |
|                        HTTP/HTTPS (Intranet)                            |
|                        Port 3000 / 80 / 443                             |
|                                 │                                       |
|                                 ▼                                       |
|   +─────────────────────────────────────────────────────────────────+   |
|   │  MOBENG Internal Server / Host VM                               │   |
|   │                                                                 │   |
|   │   ┌─────────────────────────────────────────────────────────┐   │   |
|   │   │  Docker Container (mobeng-workshop-cad:latest)          │   │   |
|   │   │                                                         │   │   |
|   │   │   Next.js Production Server (Node.js 20-alpine)         │   │   |
|   │   │   ├── Static Asset Delivery (HTML/JS/CSS Chunks)        │   │   |
|   │   │   └── Server Route Handler: /api/ai/proxy               │   │   |
|   │   │             │                                           │   │   |
|   │   └─────────────┼───────────────────────────────────────────┘   │   |
|   +─────────────────┼───────────────────────────────────────────────+   |
|                     │                                                   |
|             HTTPS Outbound                                              |
|          (Optional AI Parsing)                                          |
|                     │                                                   |
|                     ▼                                                   |
|           [ SumoPod AI Endpoint ]                                       |
|        (https://ai.sumopod.com/v1)                                      |
|                                                                         |
+─────────────────────────────────────────────────────────────────────────+
```

---

## 2. Environment Variables Configuration

Variabel lingkungan runtime diklasifikasikan secara ketat:

### REQUIRED (Wajib)
| Variable | Value | Deskripsi |
|:---|:---|:---|
| `NODE_ENV` | `production` | Mengaktifkan mode runtime produksi teroptimasi Next.js. |
| `PORT` | `3000` | Port TCP internal kontainer. |

### OPTIONAL (Opsional — Fitur AI Parsing)
| Variable | Default Value | Deskripsi |
|:---|:---|:---|
| `SUMOPOD_API_KEY` | *(empty)* | Bearer API Key SumoPod / OpenAI-compatible endpoint. Jika tidak disetel, AI assistant otomatis beralih ke deterministic rule-based fallback tanpa error. |
| `SUMOPOD_BASE_URL` | `https://ai.sumopod.com/v1` | Base URL endpoint upstream AI. |
| `SUMOPOD_MODEL` | `gpt-4o-mini` | Model LLM default yang digunakan untuk ekstraksi semantik. |

### FUTURE (Milestone Berikutnya)
| Variable | Status | Deskripsi |
|:---|:---|:---|
| `DATABASE_URL` | *Not used in M1* | Koneksi database PostgreSQL/Supabase untuk cloud persistence (Roadmap P3). |

---

## 3. Docker Deployment Instructions (Recommended)

### Langkah 1: Build Docker Image
Jalankan di root folder repository:
```bash
docker build -t mobeng-workshop-cad:latest .
```

### Langkah 2: Jalankan Container
```bash
docker run -d \
  --name mobeng-cad \
  -p 3000:3000 \
  -e SUMOPOD_API_KEY="your_sumopod_api_key_here" \
  -e SUMOPOD_MODEL="gpt-4o-mini" \
  --restart unless-stopped \
  mobeng-workshop-cad:latest
```

### Opsi: Menggunakan Docker Compose (`docker-compose.yml`)
```yaml
version: '3.8'
services:
  mobeng-cad:
    image: mobeng-workshop-cad:latest
    build:
      context: .
      dockerfile: Dockerfile
    container_name: mobeng-cad-app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - SUMOPOD_API_KEY=${SUMOPOD_API_KEY:-}
      - SUMOPOD_BASE_URL=${SUMOPOD_BASE_URL:-https://ai.sumopod.com/v1}
      - SUMOPOD_MODEL=${SUMOPOD_MODEL:-gpt-4o-mini}
    restart: unless-stopped
```
Jalankan dengan:
```bash
docker compose up -d
```

---

## 4. Standalone Host / Node.js Deployment (Alternative)

Jika Docker tidak tersedia di server host:
```bash
# 1. Install dependensi
npm ci

# 2. Build aplikasi
npm run build

# 3. Jalankan via PM2 (Process Manager)
pm2 start npm --name "mobeng-cad" -- start -- -p 3000
```

---

## 5. Security & AI Secret Isolation Limitation

> [!IMPORTANT]
> **Catatan Keamanan Arsitektur M1**:
> Pada baseline saat ini, `SUMOPOD_API_KEY` yang disetel pada environment server diteruskan ke memori React client melalui props halaman awal dan dikirim ke endpoint `/api/ai/proxy` saat melakukan request AI.
> 
> **Implikasi**: Pengguna yang membuka browser DevTools (Network tab) dapat melihat API key tersebut.
> 
> **Mitigasi Operasional M1**:
> - Deploy aplikasi **hanya di jaringan intranet / private host MOBENG** atau melalui VPN internal.
> - Jangan membuka port server ke internet publik tanpa layer reverse proxy / autentikasi SSO tambahan.
> - Isolasi penuh secret server-side murni (tanpa client-pass) direncanakan pada roadmap arsitektur berikutnya.

---

## 6. Production Smoke-Test Checklist

Setelah container aktif di `http://<server-ip>:3000`, jalankan pengujian berikut:

- [ ] **1. Shell Load**: Aplikasi terbuka lancar di browser tanpa error console.
- [ ] **2. Site & Building Discoverability**: Tab `Site/Bldg` pada sidebar dan tombol `🏢 Site/Building` di header dapat langsung diklik dan membuka parameter gedung.
- [ ] **3. Decimal Comma Input**: Masukkan dimensi gedung menggunakan koma (misal: `24,5` $\times$ `30,5`), verifikasi input diterima dan luas terhitung akurat.
- [ ] **4. Layout Generation**: Form requirement menghasilkan kandidat layout 2D.
- [ ] **5. CAD Editing**: Objek bay dapat diklik dan dipindahkan posisinya di kanvas.
- [ ] **6. Persistence**: Tombol `Save` menyimpan status proyek; reload halaman mempertahankan denah.
- [ ] **7. Deliverables Export**:
  - `Export JSON` mengunduh berkas `.json` valid.
  - `Export SVG` mengunduh gambar vektor.
  - `Export DXF` mengunduh berkas CAD AutoCAD AC1015 yang valid.
- [ ] **8. AI Resilience**: Sistem tetap berfungsi 100% menghasilkan denah jika API key tidak disetel (mode fallback deterministik).
