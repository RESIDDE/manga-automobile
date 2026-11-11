import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeps a half-filled document form in localStorage so a refresh (or an accidental
 * navigation) does not lose the work. The draft is keyed per record while editing, so
 * an edit never leaks its values into the next new document.
 *
 * Returns [form, setForm, clearDraft, startNew].
 */
export function useFormPersistence<T extends Record<string, any>>(
  key: string,
  emptyForm: T,
  isEdit = false,
  id?: string | null
): [T, React.Dispatch<React.SetStateAction<T>>, () => void, () => void] {
  const storageKey = isEdit && id ? `${key}:${id}` : key;
  const storageKeyRef = useRef(storageKey);

  /** Stored draft for a key, or null when there is none. */
  const readRaw = useCallback((k: string): T | null => {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return null;
      return { ...emptyForm, ...JSON.parse(raw) } as T;
    } catch {
      return null;
    }
  }, [emptyForm]);

  const read = useCallback((k: string): T => {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return emptyForm;
      const parsed = JSON.parse(raw);
      // Merge so a form that gained new fields still loads an older draft
      return { ...emptyForm, ...parsed } as T;
    } catch {
      return emptyForm;
    }
  }, [emptyForm]);

  const [form, setForm] = useState<T>(() => read(storageKey));

  /**
   * Swap drafts when the keyed record changes (new → edit, or edit → another
   * record). A stored draft for the new key wins, so an interrupted edit resumes;
   * with no stored draft the current form is left alone, because the caller has
   * usually just loaded the record into it in the same update.
   */
  useEffect(() => {
    if (storageKeyRef.current === storageKey) return;
    storageKeyRef.current = storageKey;
    const stored = readRaw(storageKey);
    if (stored) setForm(stored);
  }, [storageKey, readRaw]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(form));
    } catch {
      // storage full or blocked — the form still works, it just won't survive a refresh
    }
  }, [storageKey, form]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKeyRef.current);
      // Also drop the "new document" draft so leaving an edit cannot leak into it
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [key]);

  /**
   * Call this from an "Add record" button: it restores the unsaved new-record
   * draft when there is one, and otherwise starts from a blank form (so the record
   * edited a moment ago cannot bleed into the new one).
   */
  const startNew = useCallback(() => {
    setForm(readRaw(key) ?? emptyForm);
  }, [key, readRaw, emptyForm]);

  return [form, setForm, clearDraft, startNew];
}
