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

  const restaurant = document.getElementById("restaurant").value || "Restaurant";
  const name = document.getElementById("name").value || "Name";
  const monthIndex = Number(document.getElementById("month").value);
  const year = Number(document.getElementById("year").value);
  const wage = Number(document.getElementById("wage").value) || 0;

  const MAX_SALARY = 100000;
  const WEEKLY_LIMIT = 28;
  const MAX_ROWS = 25;

  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];
  const monthName = monthNames[monthIndex];
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  let totalHours = 0;
  let weeklyHours = 0;
  let rowsPrinted = 0;

  // One OFF day per week
  let offDays = new Set();
  for (let s = 1; s <= daysInMonth; s += 7) {
    const e = Math.min(s + 6, daysInMonth);
    offDays.add(Math.floor(Math.random() * (e - s + 1)) + s);
  }

  // ===== Header =====
  let y = 18;
  doc.setFont("helvetica","bold");
  doc.setFontSize(18);
  doc.text("ARUBAITO REPORT",105,y,{align:"center"});

  y += 8;
  doc.setFontSize(12);
  doc.text("Restaurant Name:",105,y,{align:"right"});
  doc.setFont("helvetica","normal");
  doc.text(` ${restaurant}`,105,y,{align:"left"});

  y += 6;
  doc.setFont("helvetica","bold");
  doc.text("Name:",105,y,{align:"right"});
  doc.setFont("helvetica","normal");
  doc.text(` ${name}`,105,y,{align:"left"});

  y += 6;
  doc.setFontSize(11);
  doc.text(`${monthName} ${year}`,105,y,{align:"center"});
  y += 10;

  // ===== Table =====
  const startX=20, colDate=70, colTime=120, colHours=170, rowH=8;

  doc.setFont("helvetica","bold");
  doc.rect(startX,y,colHours-startX,rowH);
  doc.line(colDate,y,colDate,y+rowH);
  doc.line(colTime,y,colTime,y+rowH);
  doc.text("Date",startX+2,y+6);
  doc.text("Time",colDate+2,y+6);
  doc.text("Hours",colTime+2,y+6);

  doc.setFont("helvetica","normal");
  y += rowH;

  for (let d=1; d<=daysInMonth && rowsPrinted<MAX_ROWS; d++) {
    if ((d-1)%7===0) weeklyHours=0;
    if (totalHours*wage>=MAX_SALARY) break;

    let hours=0, time="OFF";

    if (!offDays.has(d)) {
      const h = Math.random()<0.5?3:4;
      if (weeklyHours+h<=WEEKLY_LIMIT && (totalHours+h)*wage<MAX_SALARY) {
        const sh=9+Math.floor(Math.random()*3);
        time=`${String(sh).padStart(2,"0")}:00-${String(sh+h).padStart(2,"0")}:00`;
        hours=h;
        weeklyHours+=h;
        totalHours+=h;
      }
    }

    doc.rect(startX,y,colHours-startX,rowH);
    doc.line(colDate,y,colDate,y+rowH);
    doc.line(colTime,y,colTime,y+rowH);
    doc.text(`${String(d).padStart(2,"0")} ${monthName} ${year}`,startX+2,y+6);
    doc.text(time,colDate+2,y+6);
    doc.text(String(hours),colTime+10,y+6,{align:"right"});

    y+=rowH;
    rowsPrinted++;
  }

  y+=6;
  doc.text(`Total Hours: ${totalHours}`,20,y);
  y+=6;
  doc.text(`Total Salary: ¥${(totalHours*wage).toLocaleString()}`,20,y);

  pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);

  const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    window.open(url,"_blank");
    document.getElementById("mobileHint").style.display="block";
  } else {
    document.getElementById("pdfPreview").src=url;
  }
}

function printPDF(){
  if(!pdfBlob) return alert("Generate PDF first");
  const w=window.open(URL.createObjectURL(pdfBlob));
  w.onload=()=>w.print();
}

function downloadPDF(){
  if(!pdfBlob) return alert("Generate PDF first");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(pdfBlob);
  a.download="arubaito-report.pdf";
  a.click();
}
