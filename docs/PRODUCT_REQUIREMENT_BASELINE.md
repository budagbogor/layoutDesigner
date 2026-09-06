# MOBENG CAD DESIGNER — PRODUCT REQUIREMENT BASELINE & FREEZE

**Status**: POST-FIELD-TEST / DEVELOPMENT FREEZE  
**Baseline Version**: MVP 1.0 Production-Ready Baseline  
**Date**: 2026-09-06  
**Build System**: Next.js 15 + React 19 + TypeScript (Next.js Production Build PASS)  
**Test Baseline**: 57 test files, 654 automated tests passing, 0 typecheck errors  
**Field Test Status**: Complete (0 P0, 0 P1, 2 P2 — Overall Verdict: VERY GOOD — READY FOR PRODUCTIZATION)

---

## 1. Executive Summary & Purpose

Dokumen ini adalah **Single Source of Truth** untuk spesifikasi fungsional, batasan arsitektur, standar domain MOBENG, serta kontrak input/output dari **MOBENG CAD Designer MVP**.

Dokumen ini membekukan (*freeze*) baseline produk setelah selesainya M1 (Project Lifecycle), M2 (Export/Import/DXF), M3 (Building & Site Parameter Editor), M4 (Real-World Acceptance Test), dan Field Test Execution. Dokumen ini mendefinisikan secara ketat apa yang dijamin oleh MVP, batasan tanggung jawab AI vs Deterministic Layout Engine, taksonomi resmi MOBENG, serta domain gap yang dialokasikan untuk roadmap masa depan.

---

## 2. Product Definition

**MOBENG CAD Designer** adalah:
> **AI-assisted 2D workshop layout design tool** yang mengubah kebutuhan bisnis bengkel dalam bahasa natural menjadi semantic workshop requirement, kemudian menggunakan **Deterministic Layout Engine** untuk menghasilkan kandidat layout 2D parametrik yang dapat ditinjau, diedit secara presisi pada CAD canvas, divalidasi secara real-time terhadap standar engineering, disimpan, dibuka kembali, dan diekspor ke format JSON, SVG, dan native DXF (AutoCAD R2000).

### Core Philosophy
- **AI is NOT a CAD geometry generator**: AI hanya bertindak sebagai semantic parser dan business intent extractor.
- **Geometry is 100% Deterministic**: Seluruh koordinat ($X, Y$), dimensi ($W, L$), rotasi, clearance safety, dan driveway sirkulasi dihasilkan murni oleh Layout Engine berbasis aturan geometris matematis dan dataset standar resmi MOBENG.

---

## 3. AI Responsibility & Semantic Boundary

AI bertindak secara eksklusif sebagai penerjemah bahasa natural ke kontrak semantik (`WorkshopLayoutRequirement`).

### AI BOLEH (Permitted Capabilities)
1. **Memahami Bahasa Natural**: Mengekstrak maksud pengguna dari teks bebas, transkrip wawancara, atau prompt kebutuhan bengkel.
2. **Mengekstrak Kebutuhan Bisnis**: Mengidentifikasi tipe bengkel, kategori kendaraan utama (misal: MPV, SUV, sedan), prioritas bisnis (kapasitas vs efisiensi), dan program servis yang diminta.
3. **Mengekstrak Kebutuhan Ruang & Fasilitas**: Mengidentifikasi kebutuhan ruang tunggu (*customer lounge*), kasir, toilet, gudang sparepart, ruang kompresor, dan area limbah B3.
4. **Mengekstrak Preferensi Akses Semantik**: Memahami posisi pintu masuk/keluar kendaraan (`front_left`, `front_right`, `front_center`, dsb.) dan preferensi sirkulasi (*drive-through*).
5. **Meminta Klarifikasi**: Mengajukan pertanyaan klarifikasi jika informasi esensial (seperti ukuran lahan/gedung atau jumlah bay minimum) belum disediakan oleh pengguna.
6. **Mempertahankan Nilai Unknown**: Membiarkan field opsional bernilai `undefined` jika pengguna tidak menyebutkannya, tanpa mengarang asumsi sepihak.

### AI TIDAK BOLEH (Strictly Forbidden AI Actions)
AI dilarang keras menghasilkan atau memanipulasi parameter geometri CAD tingkat rendah:
- ❌ **X / Y Coordinates**
- ❌ **Polygon Vertices & Geometry Coordinates**
- ❌ **Rotation Degrees**
- ❌ **Footprint Dimensions ($W \times L$)**
- ❌ **Clearance Buffers & Safety Envelopes**
- ❌ **Wall Thickness & Offset Meters**
- ❌ **Direct Bay / Object Placement Coordinates**

*Enforcement*: Repository mengimplementasikan runtime guard `detectForbiddenCadFields()` yang secara otomatis menggugurkan output AI jika ditemukan field koordinat CAD.

---

## 4. Canonical MOBENG Bay Taxonomy

MOBENG menetapkan tepat **3 (tiga) Canonical Bay Types**. Setiap bay memiliki dimensi standar resmi **$4.0\text{m} \times 9.0\text{m}$**.

```
+-------------------------------------------------------------------------+
|                        CANONICAL MOBENG BAYS                            |
+-------------------------------------------------------------------------+
| 1. SPOORING_BAY         | 4.0m x 9.0m | Default: 4-Post Car Lift        |
|    - Spooring / Wheel Alignment                                         |
+-------------------------------------------------------------------------+
| 2. SERVICE_BAY          | 4.0m x 9.0m | Default: 4-Post Car Lift        |
|    - General Service                                                    |
|    - Quick Lube                                                         |
|    - Service Rasa Mesin Baru                                            |
+-------------------------------------------------------------------------+
| 3. GENERAL_REPAIR_BAY   | 4.0m x 9.0m | Default: 2-Post Car Lift        |
|    - General Repair                                                     |
|    - Kaki-kaki / Suspension & Brake                                     |
+-------------------------------------------------------------------------+
```

---

## 5. Service ≠ Bay Type (Fundamental Domain Rule)

Aturan domain tidak dapat ditawar:
- **Quick Lube BUKAN tipe bay independen.**
- **Service Rasa Mesin Baru BUKAN tipe bay independen.**
- **Kaki-kaki BUKAN tipe bay independen.**

Ketiganya adalah **layanan operasional (services/functions)** yang dialokasikan ke dalam tipe bay kanonikal:
- Quick Lube $\to$ `SERVICE_BAY` (Lift 4-Post)
- Service Rasa Mesin Baru $\to$ `SERVICE_BAY` (Lift 4-Post)
- Kaki-kaki / Suspensi $\to$ `GENERAL_REPAIR_BAY` (Lift 2-Post)
- Wheel Alignment $\to$ `SPOORING_BAY` (Lift 4-Post)

---

## 6. Bay Customization: Standard vs User Override

### Official Standard
- Standar default dimensi bay MOBENG adalah **$4.0\text{m}$ (lebar) $\times 9.0\text{m}$ (panjang)**.
- Nilai ini bersumber dari snapshot konfigurasi standar (`StandardSnapshot` / `data/demo-standard.json`), bukan hardcoded magic number di dalam engine.

### User Override pada CAD Editor
- Pengguna memiliki kebebasan profesional untuk mengubah dimensi bay individual (misal: disesuaikan menjadi $3.8\text{m} \times 8.5\text{m}$) melalui Property Panel CAD.
- **Prinsip Override**:
  1. Override pengguna **tidak mengubah** standar global.
  2. Override pengguna **tidak boleh di-shrink otomatis** oleh sistem.
  3. Override pengguna **harus divalidasi ulang secara real-time** terhadap batas gedung (`BOUNDARY-001`), tabrakan objek (`COLLISION-001`), dan driveway sirkulasi (`CIRCULATION-001`).
  4. Jika override melanggar batasan fisik, validator menandai pelanggaran secara transparan tanpa mengubah koordinat yang ditentukan pengguna.

---

## 7. Site & Building Rules

### MOBENG Site Guideline
- **Preferred Minimum Site**: Lebar $15.0\text{m}$, Panjang $20.0\text{m}$.
- **Status Aturan**: Ini adalah **Design Guideline / Rekomendasi Bisnis**, bukan penolakan hard engineering otomatis, kecuali jika ukuran gedung di dalamnya secara fisik tidak mampu menampung bay minimal yang diminta.
- Lahan di bawah guideline tetap dapat dievaluasi oleh engine, namun sistem akan memberikan warning terkait keterbatasan sirkulasi.

### GSB (Garis Sempadan Bangunan)
- **Prinsip Produk**: Posisi batas depan bangunan (*Front Setback*) harus mempertimbangkan Garis Sempadan Bangunan (GSB).
- **Karakteristik**: Nilai GSB bersifat spesifik terhadap lokasi, lebar jalan (*road width*), dan peraturan tata kota setempat (*RUTR/RDTR*).
- **Batasan MVP**: MVP **TIDAK** menetapkan angka GSB default fiktif. Pengaturan front setback saat ini dimodelkan sebagai parameter jarak depan semantik/geometri bangunan. Validasi otomatis GSB regional masuk sebagai *Domain Gap*.

---

## 8. Workshop Area Program

Status pemodelan program ruang bengkel MOBENG pada baseline saat ini:

| No | Nama Ruang / Program | Status di MVP | Deskripsi Representasi Geometri |
|:---|:---|:---:|:---|
| 1 | **Car Parking / Staging Area** | **IMPLEMENTED** | Zona parkir mobil ($2.5\text{m} \times 5.0\text{m}$) di luar gedung / driveway |
| 2 | **Bay Area (Service/Spooring/GR)** | **IMPLEMENTED** | Parametrik objek CAD ($4.0\text{m} \times 9.0\text{m}$) lengkap dengan lift & vehicle |
| 3 | **Waiting + Reception + Cashier** | **IMPLEMENTED** | Ruang kasir/office ($3.0\text{m} \times 3.0\text{m}$) & Customer Lounge ($3.0\text{m} \times 4.0\text{m}$) |
| 4 | **Toilet / Restroom** | **IMPLEMENTED** | Ruang toilet parametrik ($2.0\text{m} \times 2.0\text{m}$) |
| 5 | **Sparepart Warehouse** | **IMPLEMENTED** | Gudang suku cadang ($4.5\text{m} \times 4.0\text{m}$) |
| 6 | **Compressor Room** | **IMPLEMENTED** | Ruang isolasi kompresor angin ($2.5\text{m} \times 2.5\text{m}$) |
| 7 | **B3 Hazardous Waste Storage** | **IMPLEMENTED** | Ruang penampungan limbah oli & B3 ($2.5\text{m} \times 2.5\text{m}$) |
| 8 | **Staff / Employee Room** | **IMPLEMENTED** | Ruang istirahat karyawan ($3.0\text{m} \times 3.0\text{m}$) |
| 9 | **Mushola + Area Wudhu** | **DOMAIN GAP** | Belum memiliki schema/rule parametrik diskrit (saat ini digabung di area staff/lounge) |
| 10 | **Employee Mess** | **DOMAIN GAP** | Program hunian/mess karyawan di lantai 2 atau modul terpisah |
| 11 | **Employee Motorcycle Parking** | **DOMAIN GAP** | Slot parkir motor terdedikasi ($1.0\text{m} \times 2.0\text{m}$) |

---

## 9. Official MOBENG Equipment Scope

Daftar resmi 8 peralatan operasional bengkel MOBENG:
1. **Mesin Spooring (Wheel Alignment System)**
2. **Mesin Balancing**
3. **Tire Changer**
4. **ATF Flushing Machine**
5. **Nitrogen Tire Inflator**
6. **Oil Drain & Suction Unit**
7. **Air Compressor**
8. **Genset 10 kVA** *(Kapasitas resmi: 10 kVA. Dilarang menggunakan nilai 10,000 kVA).*

---

## 10. Equipment Current Status & Limitations

- **Lift & Compressor Room**: Telah didukung penuh secara spasial dan geometris parametrik di CAD canvas.
- **Equipment Non-Lift (No. 2 s/d 6, 8)**: Saat ini dimodelkan pada level **persyaratan semantik** dan alokasi zona fungsional (gudang sparepart, utility pad, atau area bay).
- **Equipment Catalog Status**: MVP **TIDAK MENGARANG** dimensi footprint, clearance radius putar, atau jalur utilitas MEP untuk peralatan yang belum memiliki katalog resmi dari pabrikan. Pemodelan icon blok CAD diskrit untuk 8 equipment non-lift dialokasikan sebagai **Future Domain Work**.

---

## 11. Deterministic Layout Engine Responsibility & Scoring Breakdown

Deterministic Layout Engine (`LayoutOrchestrator`, `PlacementStrategy`, `StandardAccessor`, `ConcreteStrategyEvaluator`) bertanggung jawab penuh atas:
1. **Topologi & Alokasi Spasial**: Menentukan orientasi bay (paralel/drive-through) berdasarkan bentuk gedung dan akses jalan.
2. **Kalkulasi Geometri**: Menghitung bounding box, letak dinding, kolom struktural, pintu kendaraan, dan pintu pedestrian.
3. **Pembangkitan Multi-Kandidat**: Menghasilkan alternatif tata letak independen.
4. **Validasi Batasan Keras (Hard Constraints)**: Memeriksa perimeter, tabrakan, dan driveway minimum $6.0\text{m}$.
5. **Deterministik Penuh**: Input requirement yang identik dengan versi standar yang sama akan selalu menghasilkan layout yang identik.

### Authoritative Scoring Metric Classification

Berdasarkan implementasi aktual pada Single Source of Truth (`scoringMetricContract.ts`), metrik evaluasi diklasifikasikan secara ketat:

#### A. Implemented Quality Scoring Metric
- **`vehicle_flow` (Aisle Clearance Ratio)**: Mengukur rasio keleluasaan lebar drive aisle di atas lebar minimum standar ($6.0\text{m}$). Mampu membedakan kualitas kandidat dengan jumlah bay yang sama.

#### B. Hard Constraints (Pass / Fail Invariant — Bukan Skor Kualitas)
- **`capacity` & `bay_count`**: Diverifikasi oleh aturan keras `CAPACITY-BAYS-001`. Kandidat yang tidak memenuhi jumlah bay langsung digugurkan (*disqualified*). Tidak digunakan untuk ranking kualitas diferensial.

#### C. Scoring Gaps (Contract Defined / Future Scoring Roadmap)
Metrik berikut telah didefinisikan kontrak matematisnya, namun ditandai sebagai **SCORING_GAP** karena membutuhkan pass-through data geometri lanjutan:
- `flow_continuity`: Kontinuitas alur drive-through tanpa mundur.
- `maneuvers`: Indeks kompleksitas manuver kendaraan per bay.
- `bottlenecks`: Rasio kelonggaran berpapasan dua kendaraan di lorong utama.
- `capacity_throughput`: Rasio luas lantai servis bersih per bay.
- `equipment_support`: Rasio kesesuaian tipe peralatan terhadap program servis bay.

---

## 12. Validation Engine Capability

### Implemented Validation Rules
- `BOUNDARY-001`: Seluruh objek operasional workshop harus berada sepenuhnya di dalam perimeter gedung.
- `BOUNDARY-SITE-001`: Bangunan harus berada sepenuhnya di dalam batas lahan (Site).
- `COLLISION-001`: Tidak boleh terjadi tumpang tindih (*overlap*) antar bay, dinding, atau ruangan struktural.
- `CAPACITY-BAYS-001`: Verifikasi kelayakan kapasitas fisik lebar gedung terhadap jumlah bay yang diminta.
- `CIRCULATION-001`: Verifikasi ketersediaan ruang sirkulasi/drive aisle minimal $6.0\text{m}$.

### Known Validation Gaps
- ⚠️ **Vehicle Swept-Path Simulation**: Simulasi kurva belok dinamis radius putar kendaraan belum diimplementasikan (menggunakan pendekatan drive-aisle buffer statis).
- ⚠️ **Column Grid Clash Analysis**: Analisis struktur bentang kolom baja/beton mendalam belum dimodelkan.
- ⚠️ **Automated GSB Setback Compliance**: Pemeriksaan otomatis garis sempadan jalan regional.

---

## 13. Candidate Generation Contract

1. **Deterministic Multi-Candidate**: Menghasilkan kandidat layout alternatif terurut berdasarkan skor kelayakan.
2. **Status Klasifikasi**:
   - `VALID`: Memenuhi seluruh hard constraint tanpa peringatan.
   - `FEASIBLE_WITH_WARNINGS`: Memenuhi hard constraint, namun memiliki peringatan optimasi (misal: rasio sirkulasi mepet).
   - `DISQUALIFIED`: Melanggar satu atau lebih hard constraint.
3. **Explicit Infeasibility**: Jika dimensi bangunan tidak memungkinkan secara fisik, engine **WAJIB MENOLAK** dengan mencantumkan alasan pelanggaran spesifik (misal: *Building width 12m is insufficient for 6 parallel bays*). Engine dilarang keras memaksakan layout sempit atau menciptakan dimensi palsu.

---

## 14. CAD Editor Capabilities

Fitur CAD 2D interaktif yang terbukti aktif dan teruji pada baseline:
- **Seleksi Objek**: Klik objek pada canvas dengan bounding box dan visual selection highlight.
- **Editing Koordinat & Dimensi**: Property panel interaktif untuk mengubah $X, Y, \text{Width}, \text{Length}, \text{Rotation}$.
- **Site & Building Parameter Editor**: Pengeditan ukuran lahan dan gedung via canvas inspector.
- **Layer Visibility & Styling**: 15 CAD layers terstandarisasi (`00-BUILDING`, `01-WALL`, `06-LIFT`, `08-SERVICE-BAY`, dll.) yang dapat di-toggle.
- **Real-Time Validation**: Recalculation otomatis setiap kali geometri bergeser.
- **Alternative Switching**: Perpindahan antar kandidat layout tanpa reload halaman.

---

## 15. Project Lifecycle & Persistence Contract

- **Operasi Project**: `New Project`, `Save Project`, `Open Project`, `Rename Project`, `Delete Project`.
- **Proteksi Unsaved Changes**: Dialog modal peringatan muncul otomatis jika pengguna mencoba berpindah atau mereset project saat status berstatus `UNSAVED`.
- **Penyimpanan Lokal**: Menggunakan browser `localStorage` dengan skema `WorkshopProject` (sesuai `schemas/layout.schema.json`).
- **Import / Export Project**: File `.json` murni dapat diekspor dan diimpor kembali secara utuh.
- *Batasan*: MVP beroperasi secara client-side murni tanpa sinkronisasi cloud atau database eksternal.

---

## 16. Export Contract & Deliverables

Aplikasi menyediakan 3 format deliverable resmi:

```
+-------------------------------------------------------------------------+
|                         EXPORT DELIVERABLES                             |
+-------------------------------------------------------------------------+
| 1. JSON Export    | Full project document & metadata backup             |
| 2. SVG Export     | Vector graphic visualization for web/presentation   |
| 3. DXF Export     | Native ASCII DXF (AutoCAD R2000 / AC1015 standard) |
+-------------------------------------------------------------------------+
```

### DXF Exporter Implementation Contract
- **DXF Standard Specification**: AutoCAD Release 2000 (Header `$ACADVER = AC1015`), format native 2D ASCII tanpa dependensi library pihak ketiga.
- **Units**: `$INSUNITS = 6` (Meters) / presisi milimeter geometris.
- **Struktur Entitas**: Layer ACI Color Map, closed `LWPOLYLINE` untuk seluruh dinding dan batas bay, serta `TEXT` label terpusat.
- **File Sanitizer**: Nama file output otomatis disanitasi dari karakter path berbahaya.
- **Verification vs External Compatibility**: Struktur dan sintaks DXF terverifikasi 100% secara internal melalui automated tests. Namun, kompatibilitas visual lintas berbagai viewer pihak ketiga komersial (AutoCAD desktop, LibreCAD, Autodesk Viewer) merupakan ranah uji interoperabilitas lapangan berkelanjutan, bukan jaminan universal mutlak terhadap fitur proprietary CAD.

---

## 17. What the MVP Guarantees

1. ✅ **Deterministic Geometry Generation**: Seluruh geometri dihasilkan berbasis formula matematika deterministik.
2. ✅ **Zero AI-Generated CAD Coordinates**: AI tidak pernah menyentuh koordinat gambar CAD.
3. ✅ **Canonical MOBENG Taxonomy**: Kepatuhan mutlak pada 3 tipe bay ($4\text{m} \times 9\text{m}$) dan mapping lift yang benar.
4. ✅ **Explicit Engineering Rejection**: Lahan/gedung yang tidak layak ditolak secara transparan tanpa manipulasi data.
5. ✅ **Interactive CAD Editing**: Kebebasan penuh bagi perencana untuk menggeser dan menyesuaikan tata letak.
6. ✅ **Instant Automated Validation**: Deteksi pelanggaran batas gedung dan tabrakan objek secara langsung.
7. ✅ **Robust Project Lifecycle**: State management tersimpan di local storage dengan proteksi data hilang.
8. ✅ **Valid Format Export**: Deliverable JSON, SVG, dan DXF AC1015 tergenerasi secara struktural valid.

---

## 18. What the MVP Does NOT Guarantee

1. ❌ **Full Structural & Architectural Permit Drawings**: Denah bukan gambar IMB/PBG berstempel arsitek berlisensi.
2. ❌ **Detailed MEP Engineering**: Tidak mencakup diagram instalasi jalur pipa oli, kompresor, kabel listrik 3-phase, atau sistem pemadam kebakaran.
3. ❌ **Dynamic Swept-Path Certification**: Tidak menyertakan simulasi fisik radius belok truk/kendaraan berat.
4. ❌ **Non-Lift Physical Equipment Footprints**: 8 equipment non-lift belum memiliki blok CAD interaktif.
5. ❌ **Automated GSB City Regulation Check**: Belum ada integrasi data peraturan tata ruang daerah.
6. ❌ **3D BIM / Isometric Visualization**: Sistem saat ini murni 2D CAD.
7. ❌ **Direct Binary DWG Export**: DWG memerlukan converter service eksternal terpisah (sesuai spesifikasi PRD).
8. ❌ **Multi-User Cloud Collaboration**: Tidak ada real-time collaborative editing atau sistem login backend.
9. ❌ **Universal Third-Party CAD Rendering Parity**: Tampilan visual di software CAD eksternal proprietary bergantung pada font engine dan display driver CAD masing-masing vendor.

---

## 19. Known Limitations

1. **Storage Mechanism**: Bergantung pada kuota dan persistensi browser `localStorage` perangkat lokal.
2. **2D Representation Only**: Belum memodelkan ketinggian plafon gedung (*clear height*) atau pergerakan vertikal tiang lift.
3. **Input Format**: Input desimal pada property panel mengharuskan karakter titik (`.`).
4. **Inspector Discoverability**: Pengaturan dimensi gedung/site memerlukan deseleksi objek di canvas.

---

## 20. MVP Acceptance Baseline

### Automated Test Verification
- **Test Suite**: Vitest
- **Test Files**: 57 files passed (100%)
- **Total Unit & Integration Tests**: 654 tests passed (100%)
- **TypeScript Typecheck**: 0 errors
- **Production Build**: Next.js Production Build PASS (`next build`)

### Field Test Verification (Persona-Driven)
- **Personas Tested**:
  - Persona A: Workshop Owner / Management
  - Persona B: Workshop Designer / Planner
  - Persona C: Technical & Engineering Reviewer
- **Workflow Tested**:
  1. Create Workshop Layout (AI Requirement Extraction)
  2. Review Alternative Candidates & Ranking
  3. Edit Layout on CAD Canvas
  4. Edit Building & Site Dimensions
  5. Save & Reopen Saved Projects
  6. Unsaved Changes Dialog Flow
  7. Export JSON, SVG, DXF
  8. Engineering Feasibility & Rejection Verification
- **Field Test Result**:
  - P0 Blockers: **0**
  - P1 Serious Issues: **0**
  - P2 Minor UX: **2** (Discoverability inspector & format desimal)
  - Overall Verdict: **VERY GOOD**
  - Status: **READY FOR PRODUCTIZATION**

---

## 21. Product Backlog

### P0 / P1 Backlog
- **NONE** (Zero P0/P1 blockers).

### P2 Backlog (UX Enhancements)
1. **P2-01**: Dedicated "Site & Building Settings" tab pada toolbar atas agar tidak bergantung pada deselect canvas.
2. **P2-02**: Dukungan input desimal format koma (`,`) khas pengguna Indonesia.

### Future Domain Work
1. **Equipment Physical Catalog**: Dimensi fisik $W \times L$, clearance, dan icon 2D untuk Mesin Balancing, Tire Changer, ATF Flushing, Nitrogen, Oil Suction, dan Genset 10 kVA.
2. **Parametric GSB Setback Constraint**: Garis batas sempadan jalan visual dan constraint perimeter depan.
3. **Dedicated Area Schemas**: Ruang Mushola/Wudhu dan Parkir Motor Karyawan.
4. **Dynamic Swept-Path Simulation**: Kalkulasi radius belok kendaraan.
5. **Scoring Gap Closures**: Implementasi data pass-through untuk `flow_continuity`, `maneuvers`, `bottlenecks`, `capacity_throughput`, dan `equipment_support`.

### Future Product Architecture
1. **Cloud Sync & Backend**: PostgreSQL/Supabase persistence & user authentication.
2. **PDF Drawing Sheet Generator**: Export layout lembar A3/A4 dengan kop gambar standar MOBENG.
3. **DWG Converter Service**: Server-side conversion dari native DXF ke binary DWG.
4. **3D Isometric View**: Viewer 3D WebGL untuk presentasi franchisee.

---

## 22. Architectural Non-Negotiables

Sepuluh prinsip permanen yang tidak boleh dilanggar dalam pengembangan selanjutnya:
1. **AI Semantic-Only**: AI hanya mengekstrak maksud bisnis, tidak pernah memproses geometri CAD.
2. **Layout Engine Deterministic**: Seluruh geometri berasal dari algoritma deterministik murni.
3. **Zero AI Coordinates**: AI dilarang keras menghasilkan koordinat $X, Y$, rotasi, atau poligon.
4. **No Magic Numbers**: Seluruh dimensi dan batasan keselamatan harus bersumber dari dataset standar terkonfigurasi.
5. **Missing Standards Remain Explicit**: Parameter yang tidak diketahui tidak boleh diisi dengan tebakan liar tanpa validasi.
6. **AI Provider Agnostic**: Domain engine dan geometry kernel sepenuhnya independen dari library atau provider LLM.
7. **Standards Isolation**: Standar harus di-load sebagai snapshot parameter, bukan hardcoded di dalam logika geometri.
8. **Saved Project Immutability**: Proyek lama yang dibuka kembali tidak boleh mengalami perubahan koordinat otomatis hanya karena ada standar baru yang diperbarui.
9. **User Override Validation**: Setiap penyesuaian manual oleh perencana harus melalui engine validasi keselamatan.
10. **Do Not Build AutoCAD Clone**: Fokus produk adalah otomatisasi tata letak bengkel otomotif parametrik berbasis aturan bisnis MOBENG, bukan software CAD umum yang serba bisa.

---

## 23. Documentation Conflict Audit

Hasil audit perbandingan antara dokumentasi historis awal dan implementasi aktual saat ini:

| Item / Parameter | Dokumentasi Lama (PRD/Spec Awal) | Implementasi Aktual & Baseline Resmi | Source of Truth | Status Dokumentasi |
|:---|:---|:---|:---|:---|
| **Dimensi Bay** | $4.0\text{m} \times 7.0\text{m}$ (Draft awal) | **$4.0\text{m} \times 9.0\text{m}$** | `tests/mobeng-bay-taxonomy-standard.test.ts`, `data/demo-standard.json` | **RESOLVED & FROZEN** pada $4.0\text{m} \times 9.0\text{m}$ |
| **Kapasitas Genset** | Teks ambigu / salah ketik 10,000 kVA | **10 kVA** | Domain Audit & Requirement Baseline | **RESOLVED & FROZEN** pada 10 kVA |
| **Versi DXF Export** | Release 12 (AC1009) | **Release 2000 (AC1015 ASCII)** | `src/domain/export/dxfExporter.ts` | **RESOLVED & FROZEN** pada AC1015 |
| **Quick Lube & Rasa Mesin Baru** | Sering dianggap jenis bay terpisah | **Service/Function di dalam `SERVICE_BAY`** | `src/domain/requirements/requirementTypes.ts` | **RESOLVED & FROZEN** (Service $\neq$ Bay Type) |
| **Kaki-kaki** | Kadang diasumsikan bay khusus | **Service/Function di dalam `GENERAL_REPAIR_BAY`** | `src/domain/requirements/requirementTypes.ts` | **RESOLVED & FROZEN** (Service $\neq$ Bay Type) |
| **Backend Storage** | Supabase / InsForge (PRD Roadmap) | **Browser LocalStorage** | `src/application/services/projectPersistenceService.ts` | **CONFIRMED** sebagai status MVP saat ini |
| **Build Framework** | Vite (asumsi generik) | **Next.js 15 App Router** | `package.json` | **RESOLVED & FROZEN** pada Next.js |

---

## 24. Final Product Baseline Verdict

$$\mathbf{PRODUCT\ REQUIREMENT\ BASELINE\ FROZEN\ \&\ APPROVED}$$

MOBENG Workshop CAD Designer MVP telah memenuhi seluruh kriteria penerimaan fungsional, integritas domain standar MOBENG, stabilitas pengujian otomatis (*654 tests passing*), dan validasi operasional lapangan (*Field Test: VERY GOOD*). Baseline ini resmi dibekukan untuk persiapan komersialisasi dan productization.
