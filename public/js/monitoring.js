(function () {
  const mappedBody = document.querySelector("[data-monitoring-body]");
  const unmappedBody = document.querySelector("[data-monitoring-unmapped-body]");
  const searchInput = document.querySelector("[data-monitoring-search]");
  const backButton = document.querySelector("[data-monitoring-back]");
  let allMappedRows = [];
  let allUnmappedRows = [];

  function normalizeText(value) {
    return String(value || "").toLowerCase();
  }

  function renderMappedRows(rows) {
    if (rows.length === 0) {
      mappedBody.innerHTML = '<tr><td colspan="8">Không có dữ liệu phù hợp.</td></tr>';
      return;
    }

    mappedBody.innerHTML = rows.map((row) => `
      <tr>
        <td>${row.stt}</td>
        <td>${row.participantName || ""}</td>
        <td>${row.employeeName || ""}</td>
        <td>${row.account || ""} ${row.isExtra ? '<span class="extra-badge tnr-font">Phát sinh</span>' : ""}</td>
        <td>${row.unit || ""}</td>
        <td>${row.seat || ""}</td>
        <td>${row.cinema || ""}</td>
        <td>
          ${row.seat ? `<button class="monitoring-delete-btn tnr-font" data-cinema="${row.cinema}" data-seat="${row.seat}">Xóa</button>` : "-"}
        </td>
      </tr>
    `).join("");
  }

  function renderUnmappedRows(rows) {
    if (rows.length === 0) {
      unmappedBody.innerHTML = '<tr><td colspan="8">Không có booking không map được.</td></tr>';
      return;
    }

    unmappedBody.innerHTML = rows.map((row) => `
      <tr>
        <td>${row.stt}</td>
        <td>${row.participantName || ""}</td>
        <td>${row.account || ""}</td>
        <td>${row.unit || ""}</td>
        <td>${row.seat || ""}</td>
        <td>${row.cinema || ""}</td>
        <td>${row.note || ""}</td>
        <td>
          ${row.seat ? `<button class="monitoring-delete-btn tnr-font" data-cinema="${row.cinema}" data-seat="${row.seat}">Xóa</button>` : "-"}
        </td>
      </tr>
    `).join("");
  }

  function filterRows() {
    const keyword = normalizeText(searchInput.value).trim();

    if (!keyword) {
      renderMappedRows(allMappedRows);
      renderUnmappedRows(allUnmappedRows);
      return;
    }

    const filteredMappedRows = allMappedRows.filter((row) => {
      const haystack = [
        row.stt,
        row.participantName,
        row.employeeName,
        row.account,
        row.unit,
        row.seat,
        row.cinema
      ].map(normalizeText).join(" ");

      return haystack.includes(keyword);
    });

    const filteredUnmappedRows = allUnmappedRows.filter((row) => {
      const haystack = [
        row.stt,
        row.participantName,
        row.account,
        row.unit,
        row.seat,
        row.cinema,
        row.note
      ].map(normalizeText).join(" ");

      return haystack.includes(keyword);
    });

    renderMappedRows(filteredMappedRows);
    renderUnmappedRows(filteredUnmappedRows);
  }

  async function loadMonitoring() {
    try {
      const response = await fetch("/api/monitoring");
      const data = await response.json();
      allMappedRows = data.mappedRows || [];
      allUnmappedRows = data.unmappedRows || [];
      renderMappedRows(allMappedRows);
      renderUnmappedRows(allUnmappedRows);
    } catch (error) {
      mappedBody.innerHTML = '<tr><td colspan="8">Không tải được dữ liệu monitoring.</td></tr>';
      unmappedBody.innerHTML = '<tr><td colspan="8">Không tải được dữ liệu monitoring.</td></tr>';
    }
  }

  document.addEventListener("click", async (event) => {
    const btn = event.target.closest(".monitoring-delete-btn");
    if (!btn) return;

    const cinema = btn.dataset.cinema;
    const seat = btn.dataset.seat;

    if (!window.confirm(`Bạn có chắc chắn muốn xóa lượt đặt ghế ${seat} của rạp ${cinema} không?`)) {
      return;
    }

    try {
      const response = await fetch("/api/delete-booking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ cinema, seat })
      });

      const result = await response.json();
      if (result.success) {
        // Tải lại dữ liệu sau khi xóa
        loadMonitoring();
      } else {
        window.alert(result.message || "Không thể xóa ghế đã chọn.");
      }
    } catch (error) {
      window.alert("Lỗi kết nối đến server để xóa ghế.");
    }
  });

  searchInput.addEventListener("input", filterRows);
  backButton.addEventListener("click", () => {
    window.location.href = "./cinema1.html";
  });
  loadMonitoring();
})();
