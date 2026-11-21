import { showToast } from "~/utils/toast";

const CSS_VAR_RE = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)/g;

function resolveCssVars(value: string, rootStyle: CSSStyleDeclaration): string {
  return value.replace(CSS_VAR_RE, (_match, name: string, fallback?: string) => {
    const resolved = rootStyle.getPropertyValue(name).trim();
    return resolved || fallback?.trim() || "";
  });
}

function inlineSvgStyles(source: SVGSVGElement, clone: SVGSVGElement, rootStyle: CSSStyleDeclaration) {
  const sourceEls = [source, ...Array.from(source.querySelectorAll("*"))];
  const cloneEls = [clone, ...Array.from(clone.querySelectorAll("*"))];

  const visualProps = [
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-dasharray",
    "stroke-linecap",
    "stroke-linejoin",
    "paint-order",
    "opacity",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "text-anchor",
    "dominant-baseline",
    "visibility",
    "display",
  ];

  for (let i = 0; i < sourceEls.length && i < cloneEls.length; i++) {
    const src = sourceEls[i];
    const dst = cloneEls[i];
    if (!(src instanceof Element) || !(dst instanceof Element)) continue;

    // Resolve any var(...) in inline attributes.
    for (const attr of Array.from(dst.attributes)) {
      if (attr.value.includes("var(")) {
        dst.setAttribute(attr.name, resolveCssVars(attr.value, rootStyle));
      }
    }

    if (src === source) continue;
    const cs = getComputedStyle(src);
    const parts: string[] = [];
    for (const prop of visualProps) {
      const val = cs.getPropertyValue(prop);
      if (val) parts.push(`${prop}:${val}`);
    }
    if (parts.length) {
      dst.setAttribute("style", parts.join(";"));
    }
  }
}

function buildStandaloneSvg(svg: SVGSVGElement): { markup: string; width: number; height: number } {
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || svg.clientWidth || 800));
  const height = Math.max(1, Math.round(rect.height || svg.clientHeight || 400));

  const rootStyle = getComputedStyle(document.documentElement);
  const bg = rootStyle.getPropertyValue("--surface").trim() || "#ffffff";

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  inlineSvgStyles(svg, clone, rootStyle);

  // Prepend solid background rect so exported SVG/PNG is readable on any viewer.
  const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bgRect.setAttribute("x", "0");
  bgRect.setAttribute("y", "0");
  bgRect.setAttribute("width", String(width));
  bgRect.setAttribute("height", String(height));
  bgRect.setAttribute("fill", bg);
  clone.insertBefore(bgRect, clone.firstChild);

  const serializer = new XMLSerializer();
  const markup = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(clone)}`;
  return { markup, width, height };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugifyFilename(name: string): string {
  return (name || "chart")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "chart";
}

export function exportSvgAsSvg(svg: SVGSVGElement | null, baseName = "chart") {
  if (!svg) return;
  const { markup } = buildStandaloneSvg(svg);
  const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(blob, `${slugifyFilename(baseName)}.svg`);
  showToast({ message: "Exported SVG", type: "is-compact", duration: 1800 });
}

export async function exportSvgAsPng(svg: SVGSVGElement | null, baseName = "chart", scale = 2) {
  if (!svg) return;
  const { markup, width, height } = buildStandaloneSvg(svg);
  const svgBlob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (pngBlob) {
      triggerDownload(pngBlob, `${slugifyFilename(baseName)}.png`);
      showToast({ message: "Exported PNG", type: "is-compact", duration: 1800 });
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

function escapeCsvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportRowsAsCsv(
  headers: string[],
  rows: Array<Array<unknown>>,
  baseName = "data",
) {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((r) => r.map(escapeCsvCell).join(",")),
  ];
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `${slugifyFilename(baseName)}.csv`);
  showToast({ message: "Exported CSV", type: "is-compact", duration: 1800 });
}
