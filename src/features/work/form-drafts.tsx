"use client";
import { createContext, useContext, useRef, useState, type ReactNode, type SetStateAction } from "react";

export function createFormDraftStore() {
  const values = new Map<string, unknown>();
  return {
    read<T>(key: string, initial: T): T { return values.has(key) ? values.get(key) as T : initial; },
    write(key: string, value: unknown) { values.set(key, value); },
    clear(prefix: string) { for (const key of values.keys()) if (key.startsWith(`${prefix}:`)) values.delete(key); },
  };
}
const FormDrafts = createContext<ReturnType<typeof createFormDraftStore> | null>(null);

export function FormDraftProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createFormDraftStore);
  return <FormDrafts.Provider value={store}>{children}</FormDrafts.Provider>;
}

// Drafts last only for this signed-in workspace. Secrets never enter this store.
export function useDraftState<T>(key: string, initial: T) {
  const store = useContext(FormDrafts);
  const [value, setValue] = useState<T>(() => { const saved = store ? store.read(key, initial) : initial; store?.write(key, saved); return saved; });
  const current = useRef(value);
  const update = (next: SetStateAction<T>) => {
    const resolved = typeof next === "function" ? (next as (value: T) => T)(current.current) : next;
    current.current = resolved;
    store?.write(key, resolved);
    setValue(resolved);
  };
  return [value, update] as const;
}

export function useClearFormDraft(prefix: string) {
  const store = useContext(FormDrafts);
  return () => store?.clear(prefix);
}
