// Use the rendered width, so zoom, resizing and sidebar changes need no breakpoint.
let overflowTitle;
document.addEventListener('mouseover', event => {
  const text = event.target.closest?.('td, [data-truncate-text]');
  if (overflowTitle === text) return;
  overflowTitle?.removeAttribute('title');
  overflowTitle = undefined;
  if (!text || text.hasAttribute('title') || text.scrollWidth <= text.clientWidth ||
      getComputedStyle(text).textOverflow !== 'ellipsis') return;
  const fullText = text.textContent.trim();
  if (fullText) {
    text.title = fullText;
    overflowTitle = text;
  }
});
