/** Capture a DOM node to a multi-page landscape PDF (payroll run register). */
export async function downloadPdfFromElement(
  el: HTMLElement,
  fileName: string,
  options?: { landscape?: boolean },
): Promise<void> {
  const { toPng } = await import("html-to-image");
  const { jsPDF } = await import("jspdf");
  const landscape = options?.landscape !== false;

  const tmpHost = document.createElement("div");
  tmpHost.style.position = "fixed";
  tmpHost.style.left = "-10000px";
  tmpHost.style.top = "0";
  tmpHost.style.width = "0";
  tmpHost.style.height = "0";
  tmpHost.style.overflow = "hidden";
  document.body.appendChild(tmpHost);

  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.overflow = "visible";
  clone.style.backgroundColor = "#ffffff";
  clone.querySelectorAll<HTMLElement>(".overflow-x-auto, .overflow-auto").forEach((n) => {
    n.style.overflow = "visible";
  });
  tmpHost.appendChild(clone);

  const imgData = await toPng(clone, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
  tmpHost.remove();

  const img = new window.Image();
  img.decoding = "async";
  img.src = imgData;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load captured image"));
  });

  const pdf = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 4;
  const printableW = pageW - margin * 2;
  const printableH = pageH - margin * 2;

  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  const ratio = printableW / imgW;
  const scaledH = imgH * ratio;

  let heightLeft = scaledH;
  let position = margin;

  pdf.addImage(imgData, "PNG", margin, position, printableW, scaledH);
  heightLeft -= printableH;

  while (heightLeft > 0) {
    position = margin - (scaledH - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, position, printableW, scaledH);
    heightLeft -= printableH;
  }

  pdf.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}

export function formatCompanyForPayrollExport(c: Record<string, unknown> | null | undefined): {
  name: string;
  address: string;
  logoUrl: string | null;
} | null {
  if (!c) return null;
  const parts = [
    c.address_line1,
    c.address_line2,
    [c.city, c.state].filter((x) => x && String(x).trim()).join(", "),
    c.country,
    c.postal_code,
  ]
    .map((x) => (x != null ? String(x).trim() : ""))
    .filter(Boolean);
  const rawLogo = c.logo_url;
  return {
    name: String(c.name ?? "Company"),
    address: parts.join(", "),
    logoUrl: typeof rawLogo === "string" && rawLogo.trim() ? rawLogo.trim() : null,
  };
}
