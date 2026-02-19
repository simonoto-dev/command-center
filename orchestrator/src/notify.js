import admin from 'firebase-admin';

let initialized = false;

function initFirebase() {
  if (initialized) return;
  admin.initializeApp({ projectId: 'eeveelution-3a390' });
  initialized = true;
}

export async function sendNotification({ title, body, topic = 'simonoto-brief' }) {
  initFirebase();
  const message = { notification: { title, body }, topic };
  return admin.messaging().send(message);
}
