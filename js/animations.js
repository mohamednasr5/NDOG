// animations.js - عدادات وتأثيرات
export function animateNumber(element, target, duration = 1000, suffix = '') {
  if (!element) return;
  const start = performance.now();
  const initial = parseFloat(element.textContent.replace(/[^0-9.]/g, '')) || 0;
  
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = initial + (target - initial) * eased;
    element.textContent = Math.floor(current).toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
    else element.textContent = Math.floor(target).toLocaleString() + suffix;
  }
  requestAnimationFrame(update);
}

export function fadeIn(element, delay = 0) {
  if (!element) return;
  element.style.opacity = '0';
  element.style.transition = `opacity 0.6s ease ${delay}s`;
  requestAnimationFrame(() => {
    element.style.opacity = '1';
  });
}