/**
 * Motion Graphics Database
 * IndexedDB wrapper for storing and retrieving generated motion graphics
 */

export const DB_NAME = 'motionGraphicsDB';
export const STORE_NAME = 'graphics';
export const DB_VERSION = 1;

let dbInstance = null;

/**
 * Open the IndexedDB database
 */
async function openDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open database'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create object store for graphics
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('prompt', 'prompt', { unique: false });
      }
    };
  });
}

/**
 * Save a generated motion graphic
 */
export async function saveGraphic(data) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const record = {
      prompt: data.prompt,
      html: data.html,
      cssPreset: data.cssPreset,
      customCss: data.customCss,
      layout: data.layout || 'landscape',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const request = store.add(record);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(new Error('Failed to save graphic'));
    };
  });
}

/**
 * Get all saved graphics, sorted by creation date (newest first)
 */
export async function getAllGraphics() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('createdAt');

    const request = index.openCursor(null, 'prev');
    const results = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => {
      reject(new Error('Failed to retrieve graphics'));
    };
  });
}

/**
 * Get a single graphic by ID
 */
export async function getGraphic(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(new Error('Failed to retrieve graphic'));
    };
  });
}

/**
 * Update an existing graphic
 */
export async function updateGraphic(id, data) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const record = {
      id,
      prompt: data.prompt,
      html: data.html,
      cssPreset: data.cssPreset,
      customCss: data.customCss,
      layout: data.layout || 'landscape',
      updatedAt: Date.now()
    };

    const request = store.put(record);

    request.onsuccess = () => {
      resolve(id);
    };

    request.onerror = () => {
      reject(new Error('Failed to update graphic'));
    };
  });
}

/**
 * Delete a graphic by ID
 */
export async function deleteGraphic(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(new Error('Failed to delete graphic'));
    };
  });
}

/**
 * Clear all saved graphics
 */
export async function clearAllGraphics() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(new Error('Failed to clear graphics'));
    };
  });
}

/**
 * Search graphics by prompt text
 */
export async function searchGraphics(query) {
  const all = await getAllGraphics();
  const lowerQuery = query.toLowerCase();
  return all.filter(g => g.prompt?.toLowerCase()?.includes(lowerQuery));
}
