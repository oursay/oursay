/**
 * Caret + serialize helpers for the compose contenteditable
 * (bold mention tags must live in the same DOM as the typed text so metrics match).
 */

/** Plain text from a compose editor (BR / block boundaries → `\n`). */
export function serializeComposeEditor(root: HTMLElement): string {
  let out = "";

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === "BR") {
      out += "\n";
      return;
    }
    const isBlock = tag === "DIV" || tag === "P" || tag === "LI";
    if (isBlock && out.length > 0 && !out.endsWith("\n") && el.previousSibling) {
      out += "\n";
    }
    for (const child of el.childNodes) walk(child);
  };

  for (const child of root.childNodes) walk(child);
  // Strip a single trailing newline browsers insert after the last line.
  if (out.endsWith("\n") && root.querySelector(":scope > br:last-child")) {
    out = out.slice(0, -1);
  }
  return out;
}

/** Character offset of the caret within {@link serializeComposeEditor} space. */
export function getCaretPlainOffset(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(root);
  range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return rangeToPlainLength(range);
}

/** Move caret to a plain-text character offset inside the editor. */
export function setCaretPlainOffset(root: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const target = Math.max(0, offset);
  let remaining = target;

  const place = (node: Node, at: number) => {
    const range = document.createRange();
    range.setStart(node, at);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        place(node, remaining);
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      if (remaining === 0) {
        // Caret just before this BR.
        const range = document.createRange();
        range.setStartBefore(el);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      remaining -= 1;
      return false;
    }
    for (const child of el.childNodes) {
      if (walk(child)) return true;
    }
    return false;
  };

  for (const child of root.childNodes) {
    if (walk(child)) return;
  }
  // Past end — place at end of root.
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function rangeToPlainLength(range: Range): number {
  const frag = range.cloneContents();
  const wrap = document.createElement("div");
  wrap.appendChild(frag);
  return serializeComposeEditor(wrap).length;
}
