// Private document library in the browser (IndexedDB). Nothing leaves the
// device; images are stored inside the documents, which is why IndexedDB is
// used instead of localStorage (a few MB quota).
//
// Stores: docs        { id, title, updated, doc }
//         collections { id, title, docIds, created, updated }
//         thumbs      { id (doc or template id), updated, src (small image data URL) }
//         templates   { id, title, updated, doc }  own templates (Vorlagen), next to the built-in ones

const DB_NAME = 'lineatur';
let dbPromise = null;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const name of ['docs', 'collections', 'thumbs', 'templates']) {
        if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// ---- documents ----
export const listDocs = () => tx('docs', 'readonly', (s) => s.getAll());
export const getDoc = (id) => tx('docs', 'readonly', (s) => s.get(id));
export const putDoc = (doc) =>
  tx('docs', 'readwrite', (s) => s.put({ id: doc.id, title: doc.title || '', updated: Date.now(), doc }));
/** Delete documents, their thumbnails, and remove them from every collection. */
export async function deleteDocs(ids) {
  const gone = new Set(ids);
  await tx('docs', 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); });
  await tx('thumbs', 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); });
  for (const c of await listCollections()) {
    if (c.docIds.some((id) => gone.has(id))) await putCollection({ ...c, docIds: c.docIds.filter((id) => !gone.has(id)) });
  }
}

// ---- collections ----
export const listCollections = () => tx('collections', 'readonly', (s) => s.getAll());
export const getCollection = (id) => tx('collections', 'readonly', (s) => s.get(id));
export const putCollection = (c) => tx('collections', 'readwrite', (s) => s.put({ ...c, updated: Date.now() }));
export const deleteCollection = (id) => tx('collections', 'readwrite', (s) => s.delete(id));

// ---- own templates ----
export const listTemplates = () => tx('templates', 'readonly', (s) => s.getAll());
export const putTemplate = (doc) =>
  tx('templates', 'readwrite', (s) => s.put({ id: doc.id, title: doc.title || '', updated: Date.now(), doc }));
export async function deleteTemplate(id) {
  await tx('templates', 'readwrite', (s) => s.delete(id));
  await tx('thumbs', 'readwrite', (s) => s.delete(id));
}

// ---- thumbnails ----
export const listThumbs = () => tx('thumbs', 'readonly', (s) => s.getAll());
export const putThumb = (id, src) => tx('thumbs', 'readwrite', (s) => s.put({ id, updated: Date.now(), src }));

const LAST = 'lineatur-last-doc';
export const lastDocId = () => { try { return localStorage.getItem(LAST); } catch { return null; } };
export const setLastDocId = (id) => { try { localStorage.setItem(LAST, id); } catch { /* storage may be unavailable */ } };
