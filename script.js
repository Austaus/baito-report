let pdfBlob = null;

function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // ===== INPUTS =====
  const restaurant = document.getElementById("restaurant").value || "Restaurant";
  const name = document.getElementById("name").value || "Name";
  const monthTextRaw = document.getElementById("month").value || "";
  const wage = Number(document.getElementById("wage").value) || 0;

  const MAX_SALARY = 100000;
  const WEEKLY_LIMIT = 28;
  const MAX_ROWS = 25; // one page only

  // ===== SAFE MONTH PARSING =====
  const monthText = monthTextRaw.trim().replace(/\s+/g, " ");
  const parts = monthText.split(" ");

  if (parts.length !== 2) {
    alert("Please enter Month & Year like: January 2025");
    return;
  }

  const monthName = parts[0];
  const year = Number(parts[1]);

  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
  if (isNaN(monthIndex)) {
    alert("Invalid month name. Example: January 2025");
    return;
  }

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  // ===== STATE =====
  let totalHours = 0;
  let weeklyHours = 0;
  let rowsPrinted = 0;

  // ===== ONE OFF DAY PER WEEK =====
  let offDays = new Set();
  for (let start = 1; start <= daysInMonth; start += 7) {
    const end = Math.min(start + 6, daysInMonth);
    offDays.add(Math.floor(Math.random() * (end - start + 1)) + start);
  }

  // ===== HEADER =====
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("ARUBAITO REPORT", 105, y, { align: "center" });

  y += 8;
  doc.setFontSize(12);

  doc.text("Restaurant Name:", 105, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(` ${restaurant}`, 105, y, { align: "left" });

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Name:", 105, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(` ${name}`, 105, y, { align: "left" });

  y += 6;
  doc.setFontSize(11);
  doc.text(monthText, 105, y, { align: "center" });

  y += 10;

  // ===== TABLE =====
  const startX = 20;
  const colDate = 70;
  const colTime = 120;
  const colHours = 170;
  const rowHeight = 8;

  doc.setFont("helvetica", "bold");
  doc.rect(startX, y, colHours - startX, rowHeight);
  doc.line(colDate, y, colDate, y + rowHeight);
  doc.line(colTime, y, colTime, y + rowHeight);
  doc.text("Date", startX + 2, y + 6);
  doc.text("Time", colDate + 2, y + 6);
  doc.text("Hours", colTime + 2, y + 6);

  doc.setFont("helvetica", "normal");
  y += rowHeight;

  // ===== AUTO-GENERATED MONTHLY DATA =====
  for (let day = 1; day <= daysInMonth; day++) {

    if (rowsPrinted >= MAX_ROWS) break;
    if ((day - 1) % 7 === 0) weeklyHours = 0;
    if (totalHours * wage >= MAX_SALARY) break;

    let hours = 0;
    let time = "OFF";

    if (!offDays.has(day)) {
      const proposed = Math.random() < 0.5 ? 3 : 4;

      if (
        weeklyHours + proposed <= WEEKLY_LIMIT &&
        (totalHours + proposed) * wage < MAX_SALARY
      ) {
        const startHour = 9 + Math.floor(Math.random() * 3);
        const start = `${startHour.toString().padStart(2, "0")}:00`;
        const end = `${(startHour + proposed).toString().padStart(2, "0")}:00`;

        time = `${start}-${end}`;
        hours = proposed;
        weeklyHours += hours;
        totalHours += hours;
      }
    }

    doc.rect(startX, y, colHours - startX, rowHeight);
    doc.line(colDate, y, colDate, y + rowHeight);
    doc.line(colTime, y, colTime, y + rowHeight);

    doc.text(
      `${day.toString().padStart(2, "0")} ${monthName} ${year}`,
      startX + 2,
      y + 6
    );
    doc.text(time, colDate + 2, y + 6);
    doc.text(hours.toString(), colTime + 10, y + 6, { align: "right" });

    y += rowHeight;
    rowsPrinted++;
  }

  // ===== TOTALS =====
  y += 6;
  const salary = totalHours * wage;
  doc.text(`Total Hours: ${totalHours}`, 20, y);
  y += 6;
  doc.text(`Total Salary: ¥${salary.toLocaleString()}`, 20, y);

  // ===== PREVIEW =====
  pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    window.open(url, "_blank");
    document.getElementById("mobileHint").style.display = "block";
  } else {
    document.getElementById("pdfPreview").src = url;
  }
}

// ===== PRINT =====
function printPDF() {
  if (!pdfBlob) return alert("Generate the PDF first");
  const url = URL.createObjectURL(pdfBlob);
  const win = window.open(url);
  win.onload = () => win.print();
}

// ===== DOWNLOAD =====
function downloadPDF() {
  if (!pdfBlob) return alert("Generate the PDF first");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(pdfBlob);
  a.download = "arubaito-report.pdf";
  a.click();
}
