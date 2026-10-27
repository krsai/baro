// Render a detached clone so dialog scrolling/transforms cannot clip the image.
// Only the clone is adjusted; interactive status chips on screen stay intact.
export async function captureReportImage(element) {
  const { default: html2canvas } = await import('html2canvas');
  await element.ownerDocument.fonts?.ready;
  const computed = element.ownerDocument.defaultView.getComputedStyle(element);
  const width = Math.ceil(Math.max(element.scrollWidth, element.getBoundingClientRect().width));
  return html2canvas(element, {
    backgroundColor: '#ffffff', scale: 2, logging: false, scrollX: 0, scrollY: 0,
    width,
    onclone: async (document, root) => {
      document.body.appendChild(root);
      Object.assign(root.style, {
        position: 'absolute', left: '0', top: '0', margin: '0',
        width: `${width}px`, height: 'auto', maxHeight: 'none',
        overflow: 'visible', transform: 'none', boxSizing: 'border-box',
        fontFamily: computed.fontFamily, fontSize: computed.fontSize,
        lineHeight: computed.lineHeight, color: computed.color,
      });
      root.querySelectorAll('*').forEach(node => {
        node.style.animation = 'none';
        node.style.transition = 'none';
      });
      root.querySelectorAll('[data-report-status-label]').forEach(chip => {
        // html2canvas can lose nested flex/ellipsis text in fixed-height chips.
        // Plain text in a normal inline box also allows long translations to wrap.
        const label = chip.querySelector('.MuiChip-label')?.textContent ?? chip.textContent;
        chip.textContent = label;
        Object.assign(chip.style, {
          display: 'inline-block', height: 'auto', minHeight: '0',
          maxWidth: '100%', padding: '2px 8px', lineHeight: '1.5',
          overflow: 'visible', textOverflow: 'clip', whiteSpace: 'normal',
          overflowWrap: 'anywhere', verticalAlign: 'middle', boxSizing: 'border-box',
        });
      });
      await document.fonts?.ready;
    },
  });
}
