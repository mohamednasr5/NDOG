// security.js - بصمة الجهاز ومكافحة الاحتيال
export async function getDeviceFingerprint() {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    localStorage.getItem('ndog_fp_token') || (() => {
      const token = Math.random().toString(36).substring(2, 12);
      localStorage.setItem('ndog_fp_token', token);
      return token;
    })()
  ];
  // استخدام SubtleCrypto لتوليد هاش آمن (بسيط)
  const str = components.join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function detectMultipleAccounts(currentFp, existingFp) {
  // إذا كانت البصمة موجودة لـ UID مختلف، يتم الإبلاغ
  return existingFp && existingFp !== currentFp;
}

// تسجيل محاولة احتيال في Firebase
export async function logFraud(uid, reason) {
  const { pushData } = await import('./database.js');
  await pushData('fraudLogs', { uid, reason, timestamp: Date.now(), userAgent: navigator.userAgent });
}