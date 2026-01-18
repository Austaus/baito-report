let pdfBlob = null;

// ===== Populate Month & Year dropdowns =====
(function initSelectors() {
  const monthSelect = document.getElementById("month");
  const yearSelect = document.getElementById("year");

  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  const now = new Date();

  months.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = m;
    if (i === now.getMonth()) opt.selected = true;
    monthSelect.appendChild(opt);
  });

  const currentYear = now.getFullYear();
  for (let y = currentYear - 2; y <= currentYear + 2; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }
})();

function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // ===== INPUTS =====
  const restaurant = document.getElementById("restaurant").value || "Restaurant";
  const name = document.getElementById("name").value || "Name";
  const monthIndex = Number(document.getElementById("month").value);
  const year = Number(document.getElementById("year").value);
  const wage = Number(document.getElementById("wage").value) || 0;

  const MAX_SALARY = 100000;
  const WEEKLY_LIMIT = 28;

  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  const monthName = monthNames[monthIndex];
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  let totalHours = 0;
  let weeklyHours = 0;

  // ===== One OFF day per week =====
  let offDays = new Set();
  for (let s = 1; s <= daysInMonth; s += 7) {
    const e = Math.min(s + 6, daysInMonth);
    offDays.add(Math.floor(Math.random() * (e - s + 1)) + s);
  }

  // ===== HEADER =====
  let y = 16;

  doc.setFont("helvetica","bold");
  doc.setFontSize(16);
  doc.text("ARUBAITO REPORT",105,y,{align:"center"});

  y += 7;
  doc.setFontSize(11);
  doc.text("Restaurant Name:",105,y,{align:"right"});
  doc.setFont("helvetica","normal");
  doc.text(` ${restaurant}`,105,y,{align:"left"});

  y += 5;
  doc.setFont("helvetica","bold");
  doc.text("Name:",105,y,{align:"right"});
  doc.setFont("helvetica","normal");
  doc.text(` ${name}`,105,y,{align:"left"});

  y += 5;
  doc.setFontSize(10);
  doc.text(`${monthName} ${year}`,105,y,{align:"center"});

  y += 7;

  // ===== TABLE =====
  const startX = 15;
  const colDate = 65;
  const colTime = 115;
  const colHours = 170;
  const rowH = 6;

  doc.setFont("helvetica","bold");
  doc.rect(startX,y,colHours-startX,rowH);
  doc.line(colDate,y,colDate,y+rowH);
  doc.line(colTime,y,colTime,y+rowH);
  doc.text("Date",startX+2,y+4.5);
  doc.text("Time",colDate+2,y+4.5);
  doc.text("Hours",colTime+2,y+4.5);

  doc.setFont("helvetica","normal");
  doc.setFontSize(9);
  y += rowH;

  // ===== FULL MONTH ROWS =====
  for (let d = 1; d <= daysInMonth; d++) {

    if ((d - 1) % 7 === 0) weeklyHours = 0;
    if (totalHours * wage >= MAX_SALARY) break;

    let hours = 0;
    let time = "OFF";

    if (!offDays.has(d)) {
      const h = Math.random() < 0.5 ? 3 : 4;
      if (
        weeklyHours + h <= WEEKLY_LIMIT &&
        (totalHours + h) * wage < MAX_SALARY
      ) {
        const sh = 9 + Math.floor(Math.random() * 3);
        time = `${String(sh).padStart(2,"0")}:00-${String(sh+h).padStart(2,"0")}:00`;
        hours = h;
        weeklyHours += h;
        totalHours += h;
      }
    }

    doc.rect(startX,y,colHours-startX,rowH);
    doc.line(colDate,y,colDate,y+rowH);
    doc.line(colTime,y,colTime,y+rowH);

    doc.text(
      `${String(d).padStart(2,"0")} ${monthName} ${year}`,
      startX+2,y+4.5
    );
    doc.text(time,colDate+2,y+4.5);
    doc.text(String(hours),colTime+8,y+4.5,{align:"right"});

    y += rowH;
  }

  // ===== TOTALS =====
  y += 4;
  doc.setFontSize(10);
  doc.text(`Total Hours: ${totalHours}`,15,y);
  y += 5;
  doc.text(`Total Salary: ¥${(totalHours*wage).toLocaleString()}`,15,y);

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
  if (!pdfBlob) return alert("Generate PDF first");
  const w = window.open(URL.createObjectURL(pdfBlob));
  w.onload = () => w.print();
}

// ===== DOWNLOAD =====
function downloadPDF() {
  if (!pdfBlob) return alert("Generate PDF first");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(pdfBlob);
  a.download = "arubaito-report.pdf";
  a.click();
}
