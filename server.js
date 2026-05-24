const fs = require("fs");
const http = require("http");
const path = require("path");
const url = require("url");

const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const registrationsPath = path.join(dataDir, "registrations.local.json");
const bookingsPath = path.join(dataDir, "bookings.local.json");

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

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
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

function getBookings(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const cinema = parsedUrl.query.cinema;
  const bookings = readJson(bookingsPath, { "cinema-1": {}, "cinema-2": {} });

  sendJson(res, 200, { seats: Object.keys(bookings[cinema] || {}) });
}

function getMonitoring(req, res) {
  const registrations = readJson(registrationsPath, {});
  const bookings = readJson(bookingsPath, { "cinema-1": {}, "cinema-2": {} });
  const bookedByPerson = {};
  const mappedRows = [];
  const unmappedRows = [];
  const registeredPeople = new Set();
  let mappedStt = 1;
  let unmappedStt = 1;

  Object.keys(bookings).forEach((cinema) => {
    Object.values(bookings[cinema] || {}).forEach((booking) => {
      const key = `${normalizeText(booking.account)}::${normalizeText(booking.name)}`;
      bookedByPerson[key] = {
        seat: booking.seat,
        cinema: booking.cinema
      };
    });
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

  Object.keys(bookings).forEach((cinema) => {
    Object.values(bookings[cinema] || {}).forEach((booking) => {
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
  });

  sendJson(res, 200, { mappedRows, unmappedRows });
}

async function validateBooking(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const registrations = readJson(registrationsPath, {});
    const bookings = readJson(bookingsPath, { "cinema-1": {}, "cinema-2": {} });
    const cinema = payload.cinema === "cinema-2" ? "cinema-2" : "cinema-1";
    const account = normalizeText(payload.account);
    const attendees = Array.isArray(payload.attendees) ? payload.attendees : [];
    const registration = registrations[account];

    if (!registration) {
      sendJson(res, 200, { valid: false, message: "Cán bộ nhân viên chưa đăng ký tham gia chương trình." });
      return;
    }

    const allowedCount = (registration.relatives || []).length + 1;
    const existingCount = Object.values(bookings)
      .flatMap((cinemaBookings) => Object.values(cinemaBookings || {}))
      .filter((booking) => normalizeText(booking.account) === account)
      .length;

    if (existingCount + attendees.length > allowedCount) {
      sendJson(res, 200, {
        valid: false,
        message: `Tài khoản này đã đăng ký ${existingCount} người, thêm ${attendees.length} người sẽ vượt quá số lượng ban đầu (${allowedCount} người).`
      });
      return;
    }

    bookings[cinema] = bookings[cinema] || {};
    const bookedSeat = attendees.find((attendee) => bookings[cinema][attendee.seat]);
    if (bookedSeat) {
      sendJson(res, 200, { valid: false, message: `Ghế ${bookedSeat.seat} đã được đăng ký.` });
      return;
    }

    const savedAt = new Date().toISOString();
    attendees.forEach((attendee) => {
      bookings[cinema][attendee.seat] = {
        seat: attendee.seat,
        name: attendee.name,
        account: payload.account,
        unit: payload.unit,
        cinema,
        savedAt
      };
    });

    writeJson(bookingsPath, bookings);
    sendJson(res, 200, { valid: true, seats: attendees.map((attendee) => attendee.seat) });
  } catch (error) {
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
