let pdfBlob = null;

function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // ===== Inputs =====
  const name = document.getElementById("name").value;
  const restaurant = document.getElementById("restaurant").value;
  const monthText = document.getElementById("month").value;
  const wage = Number(document.getElementById("wage").value);

  const MAX_SALARY = 100000;
  const WEEKLY_LIMIT = 28;
  const MAX_ROWS = 25; // one page only

  // ===== Parse month =====
  const [monthName, year] = monthText.split(" ");
  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  let totalHours = 0;
  let weeklyHours = 0;
  let rowsPrinted = 0;

  // ===== Decide exactly 1 OFF per week =====
  let offDays = new Set();
  for (let weekStart = 1; weekStart <= daysInMonth; weekStart += 7) {
    const weekEnd = Math.min(weekStart + 6, daysInMonth);
    const offDay =
      Math.floor(Math.random() * (weekEnd - weekStart + 1)) + weekStart;
    offDays.add(offDay);
  }

  // ===== HEADER =====
  let y = 18;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("ARUBAITO REPORT", 105, y, { align: "center" });

  y += 8;

  // Restaurant (label bold)
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Restaurant Name:", 105, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(` ${restaurant}`, 105, y, { align: "left" });

  y += 6;

  // Name (label bold)
  doc.setFont("helvetica", "bold");
  doc.text("Name:", 105, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(` ${name}`, 105, y, { align: "left" });

  y += 6;

  // Month
  doc.setFontSize(11);
  doc.text(monthText, 105, y, { align: "center" });

  y += 10;

  // ===== Table setup =====
  const startX = 20;
  const colDate = 70;
  const colTime = 120;
  const colHours = 170;
  const rowHeight = 8;

  // Table header
  doc.setFont("helvetica", "bold");
  doc.rect(startX, y, colHours - startX, rowHeight);
  doc.line(colDate, y, colDate, y + rowHeight);
  doc.line(colTime, y, colTime, y + rowHeight);
  doc.text("Date", startX + 2, y + 6);
  doc.text("Time", colDate + 2, y + 6);
  doc.text("Hours", colTime + 2, y + 6);

  doc.setFont("helvetica", "normal");
  y += rowHeight;

  // ===== Rows =====
  for (let day = 1; day <= daysInMonth; day++) {

    if (rowsPrinted >= MAX_ROWS) break;

    if ((day - 1) % 7 === 0) weeklyHours = 0;
    if (totalHours * wage >= MAX_SALARY) break;

    let hours = 0;
    let time = "OFF";

    if (!offDays.has(day)) {
      const proposedHours = Math.random() < 0.5 ? 3 : 4;

      if (
        weeklyHours + proposedHours <= WEEKLY_LIMIT &&
        (totalHours + proposedHours) * wage < MAX_SALARY
      ) {
        const startHour = 9 + Math.floor(Math.random() * 3);
        const start = `${startHour.toString().padStart(2, "0")}:00`;
        const end = `${(startHour + proposedHours)
          .toString()
          .padStart(2, "0")}:00`;

        time = `${start}-${end}`;
        hours = proposedHours;
        weeklyHours += hours;
        totalHours += hours;
      }
    }

    // Draw row
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

  // ===== Totals =====
  y += 6;
  const salary = totalHours * wage;
  doc.text(`Total Hours: ${totalHours}`, 20, y);
  y += 6;
  doc.text(`Total Salary: ¥${salary.toLocaleString()}`, 20, y);

  // ===== Preview =====
  pdfBlob = doc.output("blob");
  document.getElementById("pdfPreview").src =
    URL.createObjectURL(pdfBlob);
}

// ===== Print =====
function printPDF() {
  if (!pdfBlob) return alert("Generate the PDF first");
  const url = URL.createObjectURL(pdfBlob);
  const win = window.open(url);
  win.onload = () => win.print();
}

// ===== Download =====
function downloadPDF() {
  if (!pdfBlob) return alert("Generate the PDF first");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(pdfBlob);
  link.download = "baito-report.pdf";
  link.click();
}
