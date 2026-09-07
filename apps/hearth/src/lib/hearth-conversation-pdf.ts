import fontkit from "@pdf-lib/fontkit";
import regularFontUrl from "@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff?url";
import boldFontUrl from "@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff?url";
import { PDFDocument, PDFName, PDFString, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { HearthChatMessage } from "./hearth-chat-api";
import { linkifyHearthText, selectHearthExportMessages } from "./hearth-conversation-export";

function addLink(page: PDFPage, href: string, x: number, y: number, width: number, height: number): void {
  const annotation = page.doc.context.obj({ Type: PDFName.of("Annot"), Subtype: PDFName.of("Link"), Rect: [x, y, x + width, y + height], Border: [0, 0, 0], A: { Type: PDFName.of("Action"), S: PDFName.of("URI"), URI: PDFString.of(href) } });
  page.node.addAnnot(page.doc.context.register(annotation));
}

export async function buildHearthConversationPdf(episodeTitle: string, messages: readonly HearthChatMessage[]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const loadFont = async (url: string): Promise<ArrayBuffer> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("conversation_pdf_font_unavailable");
    return response.arrayBuffer();
  };
  const [regular, bold] = await Promise.all([
    loadFont(regularFontUrl).then((bytes) => document.embedFont(bytes, { subset: true })),
    loadFont(boldFontUrl).then((bytes) => document.embedFont(bytes, { subset: true })),
  ]);
  const width = 612, height = 792, margin = 54, contentWidth = width - margin * 2, lineHeight = 15;
  let page = document.addPage([width, height]);
  let y = height - margin;
  const nextPage = () => { page = document.addPage([width, height]); y = height - margin; };
  const ensure = (space: number) => { if (y - space < margin) nextPage(); };
  const drawWrapped = (text: string, font: PDFFont, size: number, color = rgb(0.09, 0.12, 0.18)) => {
    for (const sourceLine of text.split("\n")) {
      if (!sourceLine) { y -= lineHeight; continue; }
      ensure(lineHeight);
      let x = margin;
      for (const part of linkifyHearthText(sourceLine)) {
        for (const token of part.text.split(/(\s+)/).filter(Boolean)) {
          const tokenWidth = font.widthOfTextAtSize(token, size);
          if (x > margin && x + tokenWidth > margin + contentWidth && token.trim()) { y -= lineHeight; ensure(lineHeight); x = margin; }
          const drawable = x === margin ? token.replace(/^\s+/, "") : token;
          if (!drawable) continue;
          const drawableWidth = font.widthOfTextAtSize(drawable, size);
          page.drawText(drawable, { x, y, size, font, color: part.href ? rgb(0.05, 0.32, 0.68) : color });
          if (part.href) addLink(page, part.href, x, y - 2, drawableWidth, lineHeight);
          x += drawableWidth;
        }
      }
      y -= lineHeight;
    }
  };
  drawWrapped(episodeTitle.trim() || "Untitled Episode", bold, 18);
  y -= 14;
  for (const message of selectHearthExportMessages(messages)) {
    ensure(lineHeight * 3);
    drawWrapped(message.role === "assistant" ? "Hearth" : "You", bold, 11, rgb(0.25, 0.3, 0.38));
    drawWrapped(message.content, regular, 10.5);
    y -= 10;
  }
  const pages = document.getPages();
  pages.forEach((item, index) => {
    const label = `${index + 1} / ${pages.length}`;
    item.drawText(label, { x: width - margin - regular.widthOfTextAtSize(label, 8), y: 26, size: 8, font: regular, color: rgb(0.45, 0.48, 0.54) });
  });
  document.setTitle(episodeTitle.trim() || "Hearth conversation");
  return document.save();
}

export function sanitizeHearthConversationFilename(title: string, date = new Date()): string {
  const safeTitle = (title.trim() || "untitled-episode").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).toLowerCase() || "untitled-episode";
  return `${safeTitle}-hearth-chat-${date.toISOString().slice(0, 10)}.pdf`;
}

export function downloadHearthConversationPdf(bytes: Uint8Array, filename: string): void {
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: "application/pdf" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
