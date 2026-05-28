# 🎬 vti-pick-seat

Hệ thống đặt chỗ ngồi xem phim trực tuyến, được xây dựng phục vụ sự kiện **Ngày Quốc tế Thiếu nhi 1/6** của Tập đoàn VTI.

---

## 📋 Tổng quan

**vti-pick-seat** là ứng dụng web cho phép Cán bộ nhân viên (CBNV) VTI chủ động chọn chỗ ngồi cho sự kiện xem phim hoạt hình.

Hệ thống hỗ trợ cập nhật trạng thái ghế **theo thời gian thực (real-time polling)**, cơ chế **giữ chỗ tạm thời (seat locking)**, **kiểm tra danh sách đăng ký** từ Ban tổ chức, và đặc biệt là hỗ trợ **linh hoạt cấu hình 1 rạp lớn hoặc 2 rạp dự phòng** (Single/Dual Mode) thông qua biến môi trường.

---

## 🏗️ Kiến trúc hệ thống

```
vti-pick-seat/
├── server.js               # HTTP server thuần Node.js, xử lý tất cả API & logic đổi mode
├── package.json
├── .env                    # Biến môi trường (không commit)
│
├── public/                 # Static files phục vụ trực tiếp
│   ├── index.html          # Trang Dành cho Quản lý & CBNV Đặt ghế
│   ├── cinema.html         # Trang Xem trước sơ đồ rạp (View Only)
│   ├── guide.html          # Trang hướng dẫn sử dụng
│   ├── css/
│   │   └── app.css         # Stylesheet toàn bộ ứng dụng
│   ├── js/
│   │   ├── seating.js      # Core logic vẽ sơ đồ ghế động, polling, couple seats
│   │   └── index.js        # Logic luồng quản lý đặt ghế, đối soát
│   └── assets/             # Hình ảnh, logo
│
└── data/                   # Thư mục lưu cấu hình tạm local
```

---

## 🔧 Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Runtime | Node.js (không dùng framework) |
| HTTP Server | `http` module built-in |
| Database | [Supabase](https://supabase.com) (PostgreSQL) |
| Supabase Client | `@supabase/supabase-js` v2 |
| Frontend | HTML5 + Vanilla CSS + Vanilla JS |
| Config | `dotenv` |

---

## ⚙️ Cài đặt và chạy

### 1. Yêu cầu
- Node.js >= 18
- Tài khoản Supabase với project đã tạo sẵn

### 2. Cài dependencies

```bash
npm install
```

### 3. Cấu hình biến môi trường

Tạo file `.env` tại thư mục gốc:

```env
PORT=3000
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_KEY=<your-service-role-key>
CINEMA_MODE=single # Hoặc "dual"
```

> ⚠️ **Bắt buộc dùng `service_role` key** (không phải `anon` key) để server có quyền ghi/xóa dữ liệu, bỏ qua RLS.
> ⚠️ Khi thay đổi giá trị `CINEMA_MODE` và khởi động lại, server sẽ **tự động xóa toàn bộ dữ liệu ghế đã đặt** để tránh xung đột cấu hình.

### 4. Khởi tạo database

Tạo 2 bảng sau trong Supabase:

#### Bảng `registrations`
```sql
CREATE TABLE registrations (
  id          BIGSERIAL PRIMARY KEY,
  account     TEXT NOT NULL UNIQUE,
  full_name   TEXT,
  department  TEXT,
  allowed_count INT DEFAULT 1,
  is_extra    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

#### Bảng `bookings`
```sql
CREATE TABLE bookings (
  id          BIGSERIAL PRIMARY KEY,
  cinema      TEXT NOT NULL,         -- Ví dụ: 'cinema', 'cinema-1', 'cinema-2'
  seat        TEXT NOT NULL,
  account     TEXT NOT NULL,
  department  TEXT,
  person_name TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (cinema, seat)
);
```

### 5. Khởi động server

```bash
npm run dev
```

Truy cập tại: `http://localhost:3000`

---

## 🖥️ Các màn hình chính

| URL | Màn hình | Đối tượng |
|---|---|---|
| `/` hoặc `/index.html` | Trang Đặt ghế & Quản lý danh sách (tích hợp) | Cán bộ / BTC |
| `/cinema.html` | Xem sơ đồ rạp hiện tại | Màn hình sảnh chờ |
| `/guide.html` | Hướng dẫn sử dụng | Tất cả |

---

## 🔌 API Endpoints

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/cinema-config` | Lấy cấu hình rạp theo mode hiện hành |
| `GET` | `/api/bookings` | Lấy trạng thái tất cả ghế (book & hold) |
| `GET` | `/api/registrations-list` | Lấy danh sách đăng ký và trạng thái vé |
| `POST` | `/api/hold-seats` | Giữ chỗ tạm thời (3 phút) |
| `POST` | `/api/release-seats` | Giải phóng giữ chỗ |
| `POST` | `/api/validate-booking` | Xác nhận đặt ghế + lưu DB |
| `POST` | `/api/cancel-by-account` | Hủy tất cả vé của một account |

---

## 🛡️ Cơ chế đảm bảo tính nhất quán

- **Cấu hình động (Dynamic Cinema Config):** Sơ đồ ghế (số lượng rạp, các hàng, ghế đôi, lối đi...) hoàn toàn được sinh tự động từ `server.js` trả về cho Frontend, giúp chuyển đổi qua lại dễ dàng giữa Single Mode và Dual Mode.
- **Seat Locking (In-memory):** `temporaryHolds` object trong `server.js` ngăn chặn race condition. Tự động dọn dẹp sau 3 phút qua `setInterval`.
- **Unique Constraint (DB):** Bảng `bookings` có ràng buộc `UNIQUE(cinema, seat)` đảm bảo không có 2 người đặt cùng 1 ghế.
- **Tự động Clear Data:** Khi phát hiện đổi `CINEMA_MODE` trong quá trình khởi động, hệ thống sẽ reset lại toàn bộ DB `bookings` cũ.

---

## 👤 Tác giả

Phát triển bởi **long.nguyenhoang2** | VTI Group  
Copy & Refactor by **diep.vutien** | VTI Group  
Mọi yêu cầu chỉnh sửa vui lòng liên hệ `diep.vutien@vti.com.vn` kèm 1 cái quạt cầm tay của các cháu thiếu nhi.
