# Tirta Alami Backend API (PostgreSQL + Prisma)

Backend REST API untuk aplikasi **Tirta Alami** (Desktop & Mobile) menggunakan **Node.js, Express, TypeScript, Prisma ORM, dan PostgreSQL**. Seluruh logika bisnis (perhitungan tarif air progresif, cascade update meter bulanan, pemrosesan pembayaran & kwitansi, serta rekap laporan harian/bulanan) berada di sisi backend.

## 1. Konfigurasi Database (`.env`)

Sesuaikan `DATABASE_URL` pada file [`backend/.env`](./.env) dengan kredensial PostgreSQL lokal Anda:

```env
DATABASE_URL="postgresql://postgres:password_anda@localhost:5432/tirta_alami?schema=public"
PORT=3001
```

## 2. Migrasi Schema & Menjalankan Server

```bash
cd backend

# Sinkronisasi tabel ke PostgreSQL (otomatis membuat database jika belum ada)
npm run prisma:push

# Menjalankan server development
npm run dev
```

## 3. Daftar Endpoint API (Desktop & Mobile)

### A. Pelanggan (`/api/customers`)
- `GET /api/customers?search=...` — Daftar semua pelanggan atau cari berdasarkan ID, nama, dusun, atau alamat.
- `GET /api/customers/:customerId` — Detail pelanggan beserta tagihan belum lunas dan konfigurasi tarif.
- `POST /api/customers` — Tambah pelanggan baru (validasi duplikasi `customerId` & `initialMeter`).
- `PUT /api/customers/:id` — Ubah data pelanggan & sinkronisasi otomatis ke tagihan yang belum dibayar.
- `DELETE /api/customers/:id` — Hapus data pelanggan.

### B. Input Meter & Pemakaian Air (`/api/water-consumption`)
- `GET /api/water-consumption/customer/:customerId` — Ambil data pelanggan, daftar tagihan belum lunas, dan tarif sewa meter.
- `POST /api/water-consumption/calculate` (atau `GET`) — Hitung pemakaian meter (`totalMeter`), biaya sewa meter (`rentFee`), dan tarif progresif (Tier 1: 1–10 m³, Tier 2: 11–30 m³, Tier 3: >30 m³).
- `POST /api/water-consumption` — Simpan pembacaan meter bulan baru & otomatis perbarui `initialMeter` pelanggan dalam satu transaksi database.
- `PUT /api/water-consumption/:receiptId` — Ubah meter air pada kwitansi tertentu & **cascade recalculate** seluruh tagihan bulan-bulan berikutnya secara kronologis.

### C. Pembayaran & Cetak Kwitansi (`/api/payments`)
- `GET /api/payments/customer/:customerId` — Ambil daftar tagihan pelanggan yang belum dibayar beserta totalnya.
- `POST /api/payments/calculate-total` — Hitung total biaya dari beberapa `receiptIds` yang dicentang.
- `POST /api/payments/preview-receipt` — Buat data & teks simulasi cetak kwitansi dot-matrix sebelum pembayaran diproses.
- `POST /api/payments/process` — Proses pelunasan tagihan terpilih (`isPaid = true`, mengisi `reportDate`) dalam transaksi atomik dan kembalikan data kwitansi siap cetak.

### D. Laporan Harian & Bulanan (`/api/reports`)
- `GET /api/reports/daily?date=YYYY-MM-DD` — Laporan transaksi harian beserta ringkasan (`totalTransactions`, `totalMeter`, `totalRevenue`).
- `GET /api/reports/monthly?month=4&year=2025` — Laporan transaksi bulanan beserta ringkasan statistik.

### E. Pengaturan Tarif (`/api/settings`)
- `GET /api/settings` — Ambil seluruh konfigurasi tarif (`meter_rent_price`, `tier1_rate`, `tier2_rate`, `tier3_rate`, dll).
- `PUT /api/settings` — Ubah nilai pengaturan tarif atau header perusahaan.

### F. Autentikasi (`/auth` atau `/api/auth`)
- `POST /auth/login` — Login untuk Admin maupun Pelanggan dengan proteksi batas percobaan PIN (`MAX_LOGIN_ATTEMPTS = 5`).
- `POST /auth/set-pin` — Registrasi / pembuatan PIN awal untuk Admin atau Pelanggan.
