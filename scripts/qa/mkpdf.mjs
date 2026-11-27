import fs from "node:fs";
const pages = ["Apex LLM field notes: on-device inference", "Quantisation trades precision for memory: Q4_K_M keeps 4.8 bits per weight.", "Attention cost grows with context length squared."];
let objs = []; const add = s => { objs.push(s); return objs.length; };
const cat = add("<< /Type /Catalog /Pages 2 0 R >>"); add("PAGES"); const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const kids = [];
for (const t of pages) { const c = add(`<< /Length ${("BT /F1 22 Tf 60 700 Td (" + t + ") Tj ET").length} >>\nstream\nBT /F1 22 Tf 60 700 Td (${t}) Tj ET\nendstream`); kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${c} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`)); }
objs[1] = `<< /Type /Pages /Kids [${kids.map(k => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
let out = "%PDF-1.4\n"; const off = [];
objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("") + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
fs.writeFileSync("sample.pdf", out); console.log("pdf ok");
