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

const temporaryHolds = {
  "cinema": {}
};

// Quét dọn các ghế giữ chỗ tạm thời hết hạn (quá 3 phút) mỗi 10 giây
setInterval(() => {
  const now = Date.now();
  const timeout = 180000;
  Object.keys(temporaryHolds).forEach((cinema) => {
    const holds = temporaryHolds[cinema];
    Object.keys(holds).forEach((seat) => {
      if (now - holds[seat].heldAt > timeout) {
        delete holds[seat];
      }
    });
  });
}, 10000);

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
        relatives: reg.relatives || [],
        is_extra: reg.is_extra || false
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
          cinema: booked.cinema || "",
          isExtra: registration.is_extra || false
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

async function getRegistrationsList(req, res) {
  try {
    const [regResult, bookResult] = await Promise.all([
      supabase.from("registrations").select("*"),
      supabase.from("bookings").select("*")
    ]);

    if (regResult.error) throw regResult.error;
    if (bookResult.error) throw bookResult.error;

    const bookingsByAccount = {};
    (bookResult.data || []).forEach(b => {
      const acc = normalizeText(b.account);
      if (!bookingsByAccount[acc]) {
        bookingsByAccount[acc] = [];
      }
      bookingsByAccount[acc].push(b.seat);
    });

    const result = (regResult.data || []).map(reg => {
      const acc = normalizeText(reg.account);
      const bookedSeats = bookingsByAccount[acc] || [];
      return {
        account: reg.account,
        employeeName: reg.employee_name,
        unit: reg.unit,
        relatives: reg.relatives || [],
        allowedCount: (reg.relatives || []).length,
        isExtra: reg.is_extra || false,
        bookedSeats: bookedSeats,
        hasBooking: bookedSeats.length > 0
      };
    });

    sendJson(res, 200, result);
  } catch (error) {
    console.error("Failed to load registrations list:", error);
    sendJson(res, 500, { error: "Không tải được danh sách đăng ký." });
  }
}

async function validateBooking(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const cinema = payload.cinema || "cinema";
    const account = normalizeText(payload.account);
    const attendees = Array.isArray(payload.attendees) ? payload.attendees : [];
    const allowUnregistered = !!payload.allowUnregistered;

    let { data: registration, error: regError } = await supabase
      .from("registrations")
      .select("*")
      .eq("account", account)
      .maybeSingle();

    if (regError) throw regError;

    if (!registration) {
      if (allowUnregistered) {
        // Tự động chèn bản ghi mới vào bảng registrations
        const newReg = {
          account: account,
          employee_name: account,
          unit: payload.unit || "",
          relatives: attendees.map((att) => att.name),
          is_extra: true
        };

        const { error: insertRegError } = await supabase
          .from("registrations")
          .insert(newReg);

        if (insertRegError) throw insertRegError;

        registration = newReg;
      } else {
        sendJson(res, 200, {
          valid: false,
          needsConfirm: true,
          message: "Tài khoản này chưa đăng ký tham gia chương trình."
        });
        return;
      }
    }

    const allowedCount = (registration.relatives || []).length;
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

    // Giải phóng giữ chỗ tạm thời của phiên này
    const holds = temporaryHolds[cinema];
    attendees.forEach((attendee) => {
      if (holds[attendee.seat] && holds[attendee.seat].sessionId === payload.sessionId) {
        delete holds[attendee.seat];
      }
    });

    sendJson(res, 200, { valid: true, seats: attendees.map((attendee) => attendee.seat) });
  } catch (error) {
    console.error("Validation error:", error);
    sendJson(res, 500, { valid: false, message: "Không kiểm tra được thông tin đăng ký." });
  }
}

async function holdSeats(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const cinema = payload.cinema || "cinema";
    const seats = Array.isArray(payload.seats) ? payload.seats : [];
    const sessionId = payload.sessionId;

    if (!sessionId) {
      sendJson(res, 400, { valid: false, message: "Thiếu sessionId." });
      return;
    }

    // 1. Kiểm tra xem các ghế định chọn đã bị người khác đặt chính thức trên Supabase chưa
    const { data: booked, error } = await supabase
      .from("bookings")
      .select("seat")
      .eq("cinema", cinema)
      .in("seat", seats);

    if (error) throw error;

    if (booked && booked.length > 0) {
      const bookedSeat = booked[0].seat;
      res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ valid: false, message: `Ghế ${bookedSeat} đã được đặt chính thức, vui lòng chọn ghế khác.` }));
      return;
    }

    // 2. Kiểm tra xem các ghế định chọn có đang bị người khác giữ tạm thời không
    const holds = temporaryHolds[cinema];
    const now = Date.now();
    const timeout = 180000; // 3 phút

    for (const seat of seats) {
      const hold = holds[seat];
      if (hold && hold.sessionId !== sessionId && (now - hold.heldAt < timeout)) {
        res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ valid: false, message: `Ghế ${seat} đang được người khác chọn, vui lòng chọn ghế khác.` }));
        return;
      }
    }

    // 3. Nếu hợp lệ, lưu giữ chỗ tạm thời
    seats.forEach((seat) => {
      holds[seat] = {
        sessionId,
        heldAt: now
      };
    });

    sendJson(res, 200, { valid: true });
  } catch (error) {
    console.error("Hold seats error:", error);
    sendJson(res, 500, { valid: false, message: "Không thể giữ ghế tạm thời." });
  }
}

async function releaseSeats(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const cinema = payload.cinema || "cinema";
    const seats = Array.isArray(payload.seats) ? payload.seats : [];
    const sessionId = payload.sessionId;

    if (!sessionId) {
      sendJson(res, 400, { valid: false, message: "Thiếu sessionId." });
      return;
    }

    const holds = temporaryHolds[cinema];
    seats.forEach((seat) => {
      if (holds[seat] && holds[seat].sessionId === sessionId) {
        delete holds[seat];
      }
    });

    sendJson(res, 200, { valid: true });
  } catch (error) {
    console.error("Release seats error:", error);
    sendJson(res, 500, { valid: false, message: "Không thể giải phóng ghế." });
  }
}

async function deleteBooking(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const cinema = payload.cinema;
    const seat = payload.seat;

    if (!cinema || !seat) {
      sendJson(res, 400, { success: false, message: "Thiếu thông tin rạp hoặc ghế." });
      return;
    }

    // Xác định danh sách ghế cần xóa (nếu là ghế đôi thì xóa cả cặp)
    const seatsToDelete = [seat];
    const coupleMatch = seat.match(/^M(\d+)$/);
    if (coupleMatch) {
      const num = parseInt(coupleMatch[1], 10);
      const partnerNum = num % 2 === 1 ? num + 1 : num - 1;
      seatsToDelete.push(`M${partnerNum}`);
    }

    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("cinema", cinema)
      .in("seat", seatsToDelete);

    if (error) throw error;

    sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("Delete booking error:", error);
    sendJson(res, 500, { success: false, message: "Không thể xóa ghế đã đặt." });
  }
}

async function createRegistration(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const { employeeName, account, unit, relatives } = payload;

    if (!employeeName || !account || !unit) {
      sendJson(res, 400, { success: false, message: "Thiếu họ tên, account hoặc đơn vị." });
      return;
    }

    // Kiểm tra trùng account
    const { data: existing } = await supabase
      .from("registrations")
      .select("account")
      .eq("account", account.trim())
      .maybeSingle();

    if (existing) {
      sendJson(res, 200, { success: false, message: `Account "${account}" đã tồn tại trong danh sách.` });
      return;
    }

    const filteredRelatives = (relatives || []).filter(r => r && r.trim() !== "");

    if (filteredRelatives.length === 0) {
      sendJson(res, 400, { success: false, message: "Vui lòng nhập tối thiểu 1 người xem." });
      return;
    }

    const { error } = await supabase.from("registrations").insert({
      employee_name: employeeName.trim(),
      account: account.trim(),
      unit: (unit || "").trim(),
      relatives: filteredRelatives,
      is_extra: false
    });

    if (error) throw error;

    sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("Create registration error:", error);
    sendJson(res, 500, { success: false, message: "Không thể tạo đăng ký." });
  }
}

async function cancelByAccount(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const account = payload.account;
    const cinema = payload.cinema || "cinema";

    if (!account) {
      sendJson(res, 400, { success: false, message: "Thiếu thông tin account." });
      return;
    }

    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("cinema", cinema)
      .eq("account", account);

    if (error) throw error;

    sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("Cancel by account error:", error);
    sendJson(res, 500, { success: false, message: "Không thể xóa lượt đặt ghế của tài khoản." });
  }
}

function serveStatic(req, res) {
  const parsedUrl = url.parse(req.url);
  const requestPath = decodeURIComponent(parsedUrl.pathname === "/" ? "/index.html" : parsedUrl.pathname);
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

  if (req.method === "GET" && req.url === "/api/registrations") {
    getRegistrationsList(req, res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/bookings")) {
    getBookings(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/hold-seats") {
    holdSeats(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/release-seats") {
    releaseSeats(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/delete-booking") {
    deleteBooking(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/validate-booking") {
    validateBooking(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/cancel-by-account") {
    cancelByAccount(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/create-registration") {
    createRegistration(req, res);
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
