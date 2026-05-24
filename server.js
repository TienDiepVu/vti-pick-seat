require("dotenv").config();
const fs = require("fs");
const http = require("http");
const path = require("path");
const url = require("url");
const { createClient } = require("@supabase/supabase-js");

const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ttf": "font/ttf"
};

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20000) {
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function getBookings(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const cinema = parsedUrl.query.cinema;

  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("seat")
      .eq("cinema", cinema);

    if (error) throw error;

    const seats = (data || []).map((b) => b.seat);
    sendJson(res, 200, { seats });
  } catch (error) {
    console.error("Failed to load bookings from Supabase:", error);
    sendJson(res, 500, { seats: [], message: "Lỗi tải dữ liệu ghế." });
  }
}

async function getMonitoring(req, res) {
  try {
    const [regResult, bookResult] = await Promise.all([
      supabase.from("registrations").select("*"),
      supabase.from("bookings").select("*")
    ]);

    if (regResult.error) throw regResult.error;
    if (bookResult.error) throw bookResult.error;

    const registrations = {};
    (regResult.data || []).forEach((reg) => {
      registrations[reg.account] = {
        employeeName: reg.employee_name,
        account: reg.account,
        unit: reg.unit,
        relatives: reg.relatives || []
      };
    });

    const bookings = (bookResult.data || []).map((book) => ({
      seat: book.seat,
      name: book.name,
      account: book.account,
      unit: book.unit,
      cinema: book.cinema
    }));

    const bookedByPerson = {};
    const mappedRows = [];
    const unmappedRows = [];
    const registeredPeople = new Set();
    let mappedStt = 1;
    let unmappedStt = 1;

    bookings.forEach((booking) => {
      const key = `${normalizeText(booking.account)}::${normalizeText(booking.name)}`;
      bookedByPerson[key] = {
        seat: booking.seat,
        cinema: booking.cinema
      };
    });

    Object.values(registrations).forEach((registration) => {
      const participants = [registration.employeeName].concat(registration.relatives || []);

      participants.forEach((participantName) => {
        const key = `${normalizeText(registration.account)}::${normalizeText(participantName)}`;
        registeredPeople.add(key);
        const booked = bookedByPerson[key] || {};

        mappedRows.push({
          stt: mappedStt,
          participantName,
          employeeName: registration.employeeName,
          account: registration.account,
          unit: registration.unit,
          seat: booked.seat || "",
          cinema: booked.cinema || ""
        });
        mappedStt += 1;
      });
    });

    bookings.forEach((booking) => {
      const key = `${normalizeText(booking.account)}::${normalizeText(booking.name)}`;
      if (registeredPeople.has(key)) return;

      unmappedRows.push({
        stt: unmappedStt,
        participantName: booking.name,
        employeeName: "",
        account: booking.account,
        unit: booking.unit,
        seat: booking.seat,
        cinema: booking.cinema,
        note: "Không có trong danh sách đăng ký ban đầu"
      });
      unmappedStt += 1;
    });

    sendJson(res, 200, { mappedRows, unmappedRows });
  } catch (error) {
    console.error("Failed to generate monitoring from Supabase:", error);
    sendJson(res, 500, { error: "Không tải được dữ liệu đối soát." });
  }
}

async function validateBooking(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const cinema = payload.cinema === "cinema-2" ? "cinema-2" : "cinema-1";
    const account = normalizeText(payload.account);
    const attendees = Array.isArray(payload.attendees) ? payload.attendees : [];

    const { data: registration, error: regError } = await supabase
      .from("registrations")
      .select("*")
      .eq("account", account)
      .maybeSingle();

    if (regError) throw regError;

    if (!registration) {
      sendJson(res, 200, { valid: false, message: "Cán bộ nhân viên chưa đăng ký tham gia chương trình." });
      return;
    }

    const allowedCount = (registration.relatives || []).length + 1;
    const { count: existingCount, error: countError } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("account", account);

    if (countError) throw countError;

    if (existingCount + attendees.length > allowedCount) {
      sendJson(res, 200, {
        valid: false,
        message: `Tài khoản này đã đăng ký ${existingCount} người, thêm ${attendees.length} người sẽ vượt quá số lượng ban đầu (${allowedCount} người).`
      });
      return;
    }

    const seatCodes = attendees.map((att) => att.seat);
    const { data: duplicateSeats, error: dupError } = await supabase
      .from("bookings")
      .select("seat")
      .eq("cinema", cinema)
      .in("seat", seatCodes);

    if (dupError) throw dupError;

    if (duplicateSeats && duplicateSeats.length > 0) {
      const bookedSeat = duplicateSeats[0].seat;
      sendJson(res, 200, { valid: false, message: `Ghế ${bookedSeat} đã được đăng ký.` });
      return;
    }

    const savedAt = new Date().toISOString();
    const bookingsToInsert = attendees.map((attendee) => ({
      seat: attendee.seat,
      name: attendee.name,
      account: payload.account,
      unit: payload.unit,
      cinema,
      saved_at: savedAt
    }));

    const { error: insertError } = await supabase
      .from("bookings")
      .insert(bookingsToInsert);

    if (insertError) {
      if (insertError.code === "23505") {
        sendJson(res, 200, { valid: false, message: "Một trong các ghế bạn chọn đã bị người khác đặt trước." });
        return;
      }
      throw insertError;
    }

    sendJson(res, 200, { valid: true, seats: attendees.map((attendee) => attendee.seat) });
  } catch (error) {
    console.error("Validation error:", error);
    sendJson(res, 500, { valid: false, message: "Không kiểm tra được thông tin đăng ký." });
  }
}

function serveStatic(req, res) {
  const parsedUrl = url.parse(req.url);
  const requestPath = decodeURIComponent(parsedUrl.pathname === "/" ? "/cinema1.html" : parsedUrl.pathname);
  const filePath = path.normalize(path.join(publicDir, requestPath));

  if (!filePath.startsWith(publicDir) || filePath.endsWith(".local.json")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/monitoring") {
    getMonitoring(req, res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/bookings")) {
    getBookings(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/validate-booking") {
    validateBooking(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`PickSeatVti running at http://localhost:${port}`);
});
