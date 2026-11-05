import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { Source } from "../types";
import { api } from "../services/api";

const Context = createContext<{
  source: Source;
  setSource: (s: Source) => void;
  epoch: number;
  refresh: () => void;
  notify: (s: string) => void;
} | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<Source>("demo"),
    [epoch, setEpoch] = useState(0),
    [toast, setToast] = useState("");
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  return (
    <Context.Provider
      value={{
        source,
        setSource,
        epoch,
        refresh: () => setEpoch((v) => v + 1),
        notify: setToast,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider required");
  return value;
}
export function useData<T>(path: string) {
  const { source, epoch } = useWorkspace(),
    [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    api<T>(`${path}${path.includes("?") ? "&" : "?"}source=${source}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, source, epoch]);
  return { data, error, loading };
}
