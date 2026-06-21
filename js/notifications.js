// notifications.js - إشعارات المتصفح
export function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported');
    return;
  }
  if (Notification.permission === 'granted') return;
  Notification.requestPermission();
}

export function sendNotification(title, body, icon = './assets/icons/icon-192.png') {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon });
  }
}

// إشعار عند المطالبة اليومية
export function notifyClaim(amount) {
  sendNotification('🎉 NileDogs', `حصلت على ${amount} NDOG من المطالبة اليومية!`);
}

// إشعار عند الإحالة
export function notifyReferral(name) {
  sendNotification('👥 إحالة جديدة', `${name} انضم عبر رابطك!`);
}