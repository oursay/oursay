/** Safe filename stem from a share key (record id or comment key). */
export function shareImageFilename(shareKey: string): string {
  const stem = shareKey.replace(/::/g, "-").replace(/[^\w.-]+/g, "-");
  return `oursay-${stem || "share"}.png`;
}

/**
 * Rasterize a share-card DOM node and trigger a PNG download.
 * Dynamically imports html-to-image so it stays client-only.
 */
export async function downloadShareCardImage(
  element: HTMLElement,
  filename: string,
): Promise<boolean> {
  try {
    const { toPng } = await import("html-to-image");
    const backgroundColor =
      getComputedStyle(element).backgroundColor || "#ffffff";
    const dataUrl = await toPng(element, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor,
    });

    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
    return true;
  } catch {
    return false;
  }
}
