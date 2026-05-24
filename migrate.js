require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("your-project-id")) {
  console.error("Vui lòng cấu hình chính xác SUPABASE_URL và SUPABASE_KEY trong file .env trước khi chạy migrate.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const registrationsPath = path.join(__dirname, "data", "registrations.local.json");
const bookingsPath = path.join(__dirname, "data", "bookings.local.json");

async function migrateRegistrations() {
  if (!fs.existsSync(registrationsPath)) {
    console.log("Không tìm thấy file registrations.local.json. Bỏ qua...");
    return;
  }

  console.log("Đang đọc dữ liệu registrations...");
  const rawData = JSON.parse(fs.readFileSync(registrationsPath, "utf8"));
  const records = [];

  for (const [account, info] of Object.entries(rawData)) {
    records.push({
      account: account.trim().toLowerCase(),
      employee_name: info.employeeName,
      unit: info.unit,
      relatives: info.relatives || []
    });
  }

  if (records.length === 0) {
    console.log("Không có bản ghi đăng ký nào để import.");
    return;
  }

  console.log(`Đang tải ${records.length} bản ghi đăng ký lên Supabase...`);
  
  // Thực hiện UPSERT để tránh trùng lặp nếu chạy nhiều lần
  const { data, error } = await supabase
    .from("registrations")
    .upsert(records, { onConflict: "account" });

  if (error) {
    console.error("Lỗi khi import registrations:", error.message);
  } else {
    console.log("Đã import thành công danh sách Registrations!");
  }
}

async function migrateBookings() {
  if (!fs.existsSync(bookingsPath)) {
    console.log("Không tìm thấy file bookings.local.json. Bỏ qua...");
    return;
  }

  console.log("Đang đọc dữ liệu bookings...");
  const rawData = JSON.parse(fs.readFileSync(bookingsPath, "utf8"));
  const records = [];

  // bookings.local.json có cấu trúc: { "cinema-1": { "C3": { seat, name, account, unit, cinema, savedAt } } }
  for (const [cinema, seats] of Object.entries(rawData)) {
    for (const [seatCode, details] of Object.entries(seats || {})) {
      records.push({
        seat: details.seat,
        name: details.name,
        account: details.account.trim().toLowerCase(),
        unit: details.unit,
        cinema: details.cinema || cinema,
        saved_at: details.savedAt || new Date().toISOString()
      });
    }
  }

  if (records.length === 0) {
    console.log("Không có bản ghi booking nào để import.");
    return;
  }

  console.log(`Đang tải ${records.length} bản ghi đặt ghế lên Supabase...`);
  
  const { data, error } = await supabase
    .from("bookings")
    .upsert(records, { onConflict: "cinema,seat" });

  if (error) {
    console.error("Lỗi khi import bookings:", error.message);
  } else {
    console.log("Đã import thành công danh sách Bookings!");
  }
}

async function run() {
  try {
    await migrateRegistrations();
    console.log("-----------------------------------------");
    await migrateBookings();
    console.log("Hoàn tất quá trình đồng bộ dữ liệu!");
  } catch (error) {
    console.error("Có lỗi xảy ra trong quá trình đồng bộ:", error);
  }
}

run();
