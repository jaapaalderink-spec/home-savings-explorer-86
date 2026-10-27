// Zet geplakte HTML (Word, Google Docs, websites) om naar de eenvoudige blogopmaak:
// "## kop", "**vet**" en "- opsomming".
export function htmlToBody(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,meta,title,head").forEach((n) => n.remove());

  const isBold = (el: HTMLElement) => {
    const tag = el.tagName;
    if (tag === "B" || tag === "STRONG") {
      // Google Docs wikkelt alles in <b style="font-weight:normal">
      return !/font-weight:\s*(normal|400)/i.test(el.getAttribute("style") || "");
    }
    const fw = (el.style && el.style.fontWeight) || "";
    return fw === "bold" || Number(fw) >= 600;
  };

  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").replace(/\s+/g, " ");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    if (el.tagName === "BR") return "\n";
    const inner = Array.from(el.childNodes).map(inline).join("");
    if (isBold(el) && inner.trim()) {
      const m = inner.match(/^(\s*)(.*?)(\s*)$/s)!;
      return `${m[1]}**${m[2]}**${m[3]}`;
    }
    return inner;
  };

  const blocks: string[] = [];
  const BLOCK = /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|TABLE|TR|SECTION|ARTICLE)$/;

  const walk = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      const t = inline(node).trim();
      if (t) blocks.push(t);
      return;
    }
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) {
      const t = el.textContent?.replace(/\s+/g, " ").trim();
      if (t) blocks.push(`## ${t}`);
    } else if (tag === "UL" || tag === "OL") {
      const items = Array.from(el.querySelectorAll(":scope > li"))
        .map((li) => inline(li).replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .map((t) => `- ${t}`);
      if (items.length) blocks.push(items.join("\n"));
    } else if (tag === "LI") {
      const t = inline(el).trim();
      if (t) blocks.push(`- ${t}`);
    } else if (Array.from(el.children).some((c) => BLOCK.test(c.tagName))) {
      Array.from(el.childNodes).forEach(walk);
    } else {
      const t = inline(el).replace(/[ \t]+\n/g, "\n").trim();
      if (!t) return;
      // Word-lijstjes zonder <ul>: alinea's die met een opsommingsteken beginnen
      if (/^[•·▪◦o§-]\s+/.test(t)) blocks.push(t.replace(/^[•·▪◦o§-]\s+/, "- "));
      else blocks.push(t);
    }
  };

  Array.from(doc.body.childNodes).forEach(walk);
  return blocks
    .join("\n\n")
    .replace(/\*\*\s*\*\*/g, "")
    .replace(/(^|\n)(- .*)\n\n(?=- )/g, "$1$2\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
