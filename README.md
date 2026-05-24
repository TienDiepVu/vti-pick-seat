# 🎬 vti-pick-seat

Hệ thống đặt chỗ ngồi xem phim trực tuyến, được xây dựng phục vụ sự kiện **Ngày Quốc tế Thiếu nhi 1/6** của Tập đoàn VTI.

---

## 📋 Tổng quan

**vti-pick-seat** là ứng dụng web cho phép Cán bộ nhân viên (CBNV) VTI chủ động chọn chỗ ngồi tại 2 phòng chiếu (Rạp 1 & Rạp 2) cho buổi chiếu phim hoạt hình *"Doraemon: Nobita và lâu đài dưới đáy biển"*.

Hệ thống hỗ trợ cập nhật trạng thái ghế **theo thời gian thực (real-time polling)**, cơ chế **giữ chỗ tạm thời (seat locking)** và **kiểm tra danh sách đăng ký** từ Ban tổ chức.

---

## 🏗️ Kiến trúc hệ thống

```
vti-pick-seat/
├── server.js               # HTTP server thuần Node.js, xử lý tất cả API
├── migrate.js              # Script nhập dữ liệu đăng ký ban đầu vào Supabase
├── package.json
├── .env                    # Biến môi trường (không commit)
│
├── public/                 # Static files phục vụ trực tiếp
│   ├── cinema1.html        # Màn hình chọn ghế Rạp 1
│   ├── cinema2.html        # Màn hình chọn ghế Rạp 2
│   ├── view-cinema1.html   # Màn hình chỉ xem Rạp 1 (View Only)
│   ├── view-cinema2.html   # Màn hình chỉ xem Rạp 2 (View Only)
│   ├── monitoring.html     # Màn hình đối soát & quản lý
│   ├── guide.html          # Trang hướng dẫn sử dụng
│   ├── css/
│   │   └── app.css         # Stylesheet toàn bộ ứng dụng
│   ├── js/
│   │   ├── seating.js      # Logic chọn ghế, real-time polling, form đăng ký
│   │   └── monitoring.js   # Logic bảng đối soát, tìm kiếm, xóa ghế
│   └── assets/             # Hình ảnh, logo
│
└── data/
    ├── registrations.local.json  # Dữ liệu đăng ký gốc (dùng cho migrate)
    └── bookings.local.json       # (Dự phòng local)
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

Tạo file `.env` tại thư mục gốc (hoặc sao chép từ `.env.example`):

```env
PORT=3000
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_KEY=<your-service-role-key>
```

> ⚠️ **Bắt buộc dùng `service_role` key** (không phải `anon` key) để server có quyền ghi/xóa dữ liệu, bỏ qua RLS.

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
  cinema      TEXT NOT NULL,         -- 'cinema-1' hoặc 'cinema-2'
  seat        TEXT NOT NULL,
  account     TEXT NOT NULL,
  department  TEXT,
  person_name TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (cinema, seat)
);
```

### 5. Nhập dữ liệu đăng ký ban đầu (nếu cần)

Cập nhật file `data/registrations.local.json` rồi chạy:

```bash
node migrate.js
```

### 6. Khởi động server

```bash
npm start
```

Truy cập tại: `http://localhost:3000`

---

## 🖥️ Các màn hình chính

| URL | Màn hình | Đối tượng |
|---|---|---|
| `/cinema1.html` | Chọn ghế Rạp 1 | CBNV |
| `/cinema2.html` | Chọn ghế Rạp 2 | CBNV |
| `/view-cinema1.html` | Chỉ xem Rạp 1 | Ban tổ chức / Sảnh chờ |
| `/view-cinema2.html` | Chỉ xem Rạp 2 | Ban tổ chức / Sảnh chờ |
| `/monitoring.html` | Đối soát & Quản lý | Ban tổ chức |
| `/guide.html` | Hướng dẫn sử dụng | Tất cả |

---

## 🔌 API Endpoints

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/seats?cinema=cinema-1` | Lấy trạng thái tất cả ghế |
| `POST` | `/api/hold` | Giữ chỗ tạm thời (3 phút) |
| `POST` | `/api/release` | Giải phóng giữ chỗ |
| `POST` | `/api/book` | Xác nhận đặt ghế + lưu DB |
| `POST` | `/api/validate-booking` | Kiểm tra Account & giới hạn số người |
| `GET` | `/api/monitoring` | Lấy dữ liệu bảng đối soát |
| `DELETE` | `/api/booking/:id` | Xóa 1 lượt đặt ghế |

---

## 🔑 Luồng đặt ghế

```
[CBNV chọn ghế] 
    → POST /api/hold         (giữ chỗ 3 phút, kiểm tra xung đột)
    → POST /api/validate-booking  (xác thực account, kiểm tra hạn mức)
    → POST /api/book         (ghi vào Supabase, giải phóng hold)
    → [Real-time polling phản ánh trạng thái mới lên tất cả client]
```

---

## 🛡️ Cơ chế đảm bảo tính nhất quán

- **Seat Locking (In-memory):** `temporaryHolds` object trong `server.js` ngăn chặn race condition. Tự động dọn dẹp sau 3 phút qua `setInterval`.
- **Unique Constraint (DB):** Bảng `bookings` có ràng buộc `UNIQUE(cinema, seat)` đảm bảo không có 2 người đặt cùng 1 ghế.
- **Ghế đôi (Couple Seat):** Hàng M là ghế đôi liền kề — chọn/xóa 1 ghế sẽ áp dụng cho cả cặp.
- **Đăng ký phát sinh:** Account không có trong danh sách gốc được phép đăng ký dưới dạng "phát sinh" (`is_extra = true`), được đánh dấu riêng trong màn hình Monitoring.

---

## 📁 Dữ liệu cấu hình ghế

Sơ đồ ghế (vị trí, loại ghế, hàng mặc định của BTC) được định nghĩa tĩnh bên trong `public/js/seating.js`.

Các hàng đặc biệt:
- **Hàng A, B:** Giữ cho Ban tổ chức, không cho CBNV đặt.
- **Hàng M:** Ghế đôi (couple seat), chọn 1 tự động chọn cặp.

---

## 🌿 Biến môi trường tham khảo

| Biến | Mô tả | Bắt buộc |
|---|---|---|
| `PORT` | Cổng HTTP server (mặc định: 3000) | Không |
| `SUPABASE_URL` | URL project Supabase | Có |
| `SUPABASE_KEY` | Service Role Key của Supabase | Có |

---

## 👤 Tác giả

Phát triển bởi **long.nguyenhoang2** | VTI Group  
Copy by **diep.vutien** | VTI Group  
Mọi yêu cầu chỉnh sửa vui lòng liên hệ `diep.vutien@vti.com.vn` kèm 1 cái quạt cầm tay của các cháu thiếu nhi.
