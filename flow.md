# Sơ đồ luồng hoạt động dự án vti-pick-seat

Dưới đây là sơ đồ chi tiết mô tả luồng hoạt động của hệ thống đặt ghế và quá trình quản lý đối soát của Ban Tổ Chức (BTC).

## 1. Sơ đồ tuần tự (Sequence Diagram) - Luồng đặt ghế của Cán bộ nhân viên (CBNV)

Sơ đồ này thể hiện chi tiết quá trình từ lúc người dùng xem trạng thái ghế, chọn ghế, đến khi hoàn tất lưu dữ liệu xuống Database.

```mermaid
sequenceDiagram
    autonumber
    participant Client as 🖥️ Client (CBNV)
    participant Server as ⚙️ Server (Node.js)
    participant RAM as 🧠 In-Memory (Seat Lock)
    participant DB as 🗄️ Supabase (Database)

    Note over Client, DB: 🔄 Bước 1: Polling cập nhật trạng thái
    loop Mỗi vài giây
        Client->>Server: GET /api/seats
        Server-->>Client: Trả về trạng thái ghế hiện tại
    end
    
    Note over Client, DB: 🖱️ Bước 2: Chọn & Giữ ghế
    Client->>Server: POST /api/hold (Gửi ID ghế)
    Server->>RAM: Kiểm tra ghế đã bị giữ chưa?
    
    alt Ghế đã có người khác giữ / đặt
        RAM-->>Server: Xung đột (Conflict)
        Server-->>Client: ❌ Lỗi: Ghế đang được giữ
    else Ghế trống
        RAM-->>Server: Tạo Lock (Timeout 3 phút)
        Server-->>Client: ✅ Hold thành công
        Note over Client: Hiển thị Form nhập thông tin Account
    end

    Note over Client, DB: 📋 Bước 3: Xác thực thông tin
    Client->>Server: POST /api/validate-booking (Gửi Account)
    Server->>DB: Query bảng registrations
    DB-->>Server: Trả về thông tin Account
    
    alt Không hợp lệ (Vượt quá số lượng)
        Server-->>Client: ❌ Báo lỗi hạn mức
    else Hợp lệ (Hoặc phát sinh)
        Server-->>Client: ✅ Thông tin hợp lệ
    end
    
    Note over Client, DB: 💾 Bước 4: Chốt đặt ghế
    Client->>Server: POST /api/book
    Server->>DB: Insert vào bảng bookings
    
    alt Bị lỗi Unique Constraint (Trùng ghế)
        DB-->>Server: ❌ Lỗi
        Server-->>Client: ❌ Báo lỗi thất bại
    else Insert thành công
        DB-->>Server: ✅ Thành công
        Server->>RAM: Xóa bỏ Seat Lock (Release Hold)
        Server-->>Client: 🎉 Đặt ghế thành công!
    end
```

## 2. Sơ đồ khối (Flowchart) - Luồng Quản lý và Đối soát của Ban Tổ Chức

Sơ đồ này thể hiện cách BTC theo dõi trạng thái, đối soát tài khoản và xử lý các sự cố (hủy ghế).

```mermaid
flowchart TD
    %% Định nghĩa các Actor và Component
    BTC((Ban Tổ Chức))
    MonitorUI[💻 Màn hình Monitoring\n(/monitoring.html)]
    ViewUI[📺 Màn hình sảnh chờ\n(/view-cinema.html)]
    Server[⚙️ Server API\n(Node.js)]
    DB[(🗄️ Supabase DB)]

    %% Luồng xem rạp ngoài sảnh
    BTC -. Trình chiếu .-> ViewUI
    ViewUI -- "GET /api/seats\n(Real-time polling)" --> Server

    %% Luồng quản lý
    BTC ==>|Truy cập bảng điều khiển| MonitorUI
    MonitorUI == "GET /api/monitoring" ==> Server
    Server == "Query dữ liệu\n(Registrations + Bookings)" ==> DB
    DB == "Trả về danh sách" ==> Server
    Server == "Hiển thị dữ liệu\n- Danh sách đặt\n- Tài khoản phát sinh" ==> MonitorUI

    %% Luồng xử lý sự cố (Hủy ghế)
    BTC -- "Yêu cầu xóa lượt đặt\n(sai sót, đổi ý)" --> MonitorUI
    MonitorUI -- "DELETE /api/booking/:id" --> Server
    Server -- "Xóa Record trong bảng bookings" --> DB
    Server -. "Cập nhật lại trạng thái" .-> MonitorUI
```
