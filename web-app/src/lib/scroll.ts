/** In-page anchor for a record's comment thread (post detail). */
export const COMMENTS_SECTION_ID = "comments";

export function scrollToCommentsSection() {
  document.getElementById(COMMENTS_SECTION_ID)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
