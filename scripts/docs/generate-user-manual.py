"""Genera el manual PDF desde Markdown. Requiere Python y reportlab; no usa red ni .env."""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[2]
WIDTH, HEIGHT = A4
MARGIN = 44
CONTENT_WIDTH = WIDTH - MARGIN * 2
INK = colors.HexColor("#111827")
MUTED = colors.HexColor("#4B5563")
LINE = colors.HexColor("#E5E7EB")
BRAND = colors.HexColor("#E11D48")


def register_fonts() -> None:
    locations = [Path("C:/Windows/Fonts"), Path("/usr/share/fonts/truetype/dejavu")]
    for location in locations:
        regular = location / ("arial.ttf" if location.name == "Fonts" else "DejaVuSans.ttf")
        bold = location / ("arialbd.ttf" if location.name == "Fonts" else "DejaVuSans-Bold.ttf")
        mono = location / ("consola.ttf" if location.name == "Fonts" else "DejaVuSansMono.ttf")
        if regular.exists() and bold.exists() and mono.exists():
            for name, path in [("Manual", regular), ("Manual-Bold", bold), ("Manual-Code", mono)]:
                pdfmetrics.registerFont(TTFont(name, str(path)))
            pdfmetrics.registerFontFamily("Manual", normal="Manual", bold="Manual-Bold", italic="Manual", boldItalic="Manual-Bold")
            return
    raise RuntimeError("No se encontraron Arial/Consolas ni DejaVu. Instala una de esas familias.")


def inline(text: str) -> str:
    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r'<font name="Manual-Code" size="8.5">\1</font>', text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2" color="#111827"><u>\1</u></a>', text)
    return text


class ManualDocument(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "Chapter":
            text = flowable.getPlainText()
            if text == "Contenido":
                return
            bookmark = "chapter-" + text.split(".", 1)[0]
            self.canv.bookmarkPage(bookmark)
            self.canv.addOutlineEntry(text, bookmark, level=0)
            self.notify("TOCEntry", (0, text, self.page, bookmark))


def decorate(canvas, doc):
    canvas.saveState()
    if doc.page == 1:
        canvas.setFillColor(INK)
        canvas.rect(0, HEIGHT - 170, WIDTH, 170, fill=1, stroke=0)
        canvas.setFillColor(BRAND)
        canvas.rect(MARGIN, HEIGHT - 58, 30, 5, fill=1, stroke=0)
        canvas.setFont("Manual-Bold", 31)
        canvas.setFillColor(colors.white)
        canvas.drawString(MARGIN, HEIGHT - 110, "GAMER PERÚ")
        canvas.setFont("Manual", 10)
        canvas.setFillColor(colors.HexColor("#D1D5DB"))
        canvas.drawString(MARGIN, HEIGHT - 139, "CATÁLOGO / OPERACIÓN / ATENCIÓN AL CLIENTE")
    else:
        canvas.setFont("Manual-Bold", 8)
        canvas.setFillColor(INK)
        canvas.drawString(MARGIN, HEIGHT - 30, "GAMER PERÚ")
        canvas.setFont("Manual", 8)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(WIDTH - MARGIN, HEIGHT - 30, f"Manual de uso / Edición {doc.manual_version}")
        canvas.setStrokeColor(LINE)
        canvas.line(MARGIN, HEIGHT - 40, WIDTH - MARGIN, HEIGHT - 40)
    canvas.setStrokeColor(LINE)
    canvas.line(MARGIN, 42, WIDTH - MARGIN, 42)
    canvas.setFillColor(MUTED)
    canvas.setFont("Manual", 8)
    canvas.drawString(MARGIN, 27, f"{doc.manual_date} / Base funcional {doc.manual_base}")
    canvas.drawRightString(WIDTH - MARGIN, 27, str(doc.page))
    canvas.restoreState()


def build(source: Path, destination: Path) -> None:
    register_fonts()
    markdown = source.read_text(encoding="utf-8-sig")
    edition = re.search(r"^Edición ([\d.]+) - (.+)$", markdown, re.M)
    revision = re.search(r"commit `([a-f0-9]{7,40})`", markdown)
    if not edition or not revision:
        raise ValueError("El Markdown necesita edición, fecha y commit base para generar metadatos coherentes.")
    base = getSampleStyleSheet()
    styles = {
        "body": ParagraphStyle("Body", parent=base["Normal"], fontName="Manual", fontSize=10, leading=14.2, textColor=INK, spaceAfter=8, splitLongWords=True),
        "cover": ParagraphStyle("CoverTitle", fontName="Manual-Bold", fontSize=29, leading=35, textColor=INK, spaceAfter=24),
        "chapter": ParagraphStyle("Chapter", fontName="Manual-Bold", fontSize=21, leading=26, textColor=INK, spaceAfter=17, keepWithNext=True),
        "sub": ParagraphStyle("Subheading", fontName="Manual-Bold", fontSize=11.5, leading=15, textColor=INK, spaceBefore=9, spaceAfter=7, keepWithNext=True),
        "bullet": ParagraphStyle("Bullet", fontName="Manual", fontSize=10, leading=14.2, textColor=INK, leftIndent=16, firstLineIndent=-12, spaceAfter=6),
        "callout": ParagraphStyle("Callout", fontName="Manual", fontSize=9.4, leading=13.5, textColor=INK, spaceBefore=8, spaceAfter=10, borderColor=LINE, borderWidth=0.6, borderPadding=10, backColor=colors.HexColor("#F3F4F6")),
        "cell": ParagraphStyle("Cell", fontName="Manual", fontSize=9.1, leading=12.5, textColor=INK, alignment=TA_LEFT, splitLongWords=True),
        "head": ParagraphStyle("HeadCell", fontName="Manual-Bold", fontSize=9.1, leading=12.5, textColor=INK, splitLongWords=True),
    }
    doc = ManualDocument(str(destination), pagesize=A4, title="Gamer Perú - Manual de uso y operación", author="Gamer Perú", subject="Operación del admin y recorrido del cliente", leftMargin=MARGIN, rightMargin=MARGIN, topMargin=58, bottomMargin=54)
    doc.manual_version, doc.manual_date = edition.groups()
    doc.manual_base = revision.group(1)
    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[Frame(MARGIN, 54, CONTENT_WIDTH, HEIGHT - 280, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=decorate),
        PageTemplate(id="Body", frames=[Frame(MARGIN, 54, CONTENT_WIDTH, HEIGHT - 112, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=decorate),
    ])
    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle("ContentsEntry", fontName="Manual", fontSize=10.5, leading=16, textColor=INK, spaceBefore=7, leftIndent=0, firstLineIndent=0)]
    lines = markdown.splitlines()
    story = []
    index = 0
    chapters = 0
    cover_title = True
    while index < len(lines):
        line = lines[index].strip()
        index += 1
        if not line or line.startswith("# "):
            continue
        if line.startswith("## "):
            if chapters == 0:
                story.extend([NextPageTemplate("Body"), PageBreak(), Paragraph("Contenido", styles["chapter"]), toc, PageBreak()])
            else:
                story.append(PageBreak())
            story.append(Paragraph(inline(line[3:]), styles["chapter"]))
            chapters += 1
            continue
        if line.startswith("### "):
            story.append(Paragraph(inline(line[4:]), styles["sub"]))
            continue
        if line.startswith("|"):
            rows = [line]
            while index < len(lines) and lines[index].strip().startswith("|"):
                rows.append(lines[index].strip())
                index += 1
            cells = [[cell.strip() for cell in row.strip("|").split("|")] for row in rows if not re.fullmatch(r"[|\s:\-]+", row)]
            columns = len(cells[0])
            proportions = {2: [0.30, 0.70], 3: [0.27, 0.36, 0.37]}.get(columns, [1 / columns] * columns)
            table = Table([[Paragraph(inline(cell), styles["head"] if row_index == 0 else styles["cell"]) for cell in row] for row_index, row in enumerate(cells)], colWidths=[CONTENT_WIDTH * part for part in proportions], repeatRows=1, hAlign="LEFT")
            table.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F4F6")),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ]))
            story.extend([table, Spacer(1, 10)])
            continue
        if line.startswith("> "):
            story.append(Paragraph(inline(line[2:]), styles["callout"]))
            continue
        numbered = re.match(r"^(\d+)\.\s+(.+)", line)
        if numbered or line.startswith("- "):
            prefix = f"{numbered.group(1)}." if numbered else "•"
            text = numbered.group(2) if numbered else line[2:]
            story.append(Paragraph(f"{prefix} {inline(text)}", styles["bullet"]))
            continue
        paragraph = [line]
        while index < len(lines) and lines[index].strip() and not re.match(r"^(#{1,3} |\| |> |- |\d+\. )", lines[index].strip()):
            paragraph.append(lines[index].strip())
            index += 1
        style = styles["cover"] if cover_title else styles["body"]
        story.append(Paragraph(inline(" ".join(paragraph)), style))
        cover_title = False
    destination.parent.mkdir(parents=True, exist_ok=True)
    doc.multiBuild(story)
    print(f"PDF generado: {destination} ({chapters} capítulos)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "docs/manuals/manual-de-uso-gamer-peru.md")
    parser.add_argument("--output", type=Path, default=ROOT / "output/pdf/manual-de-uso-gamer-peru.pdf")
    options = parser.parse_args()
    build(options.source.resolve(), options.output.resolve())
