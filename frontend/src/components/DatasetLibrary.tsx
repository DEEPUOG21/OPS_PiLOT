import { useState } from "react";
import { Plus, Trash2, LoaderCircle, Database } from "lucide-react";
import type { Dataset } from "../types";
import { post } from "../services/api";
import { useWorkspace } from "../hooks/workspace";
import { Panel, Modal, Badge, Empty } from "./ui";

type Case = { question: string; reference: string };
export function DatasetLibrary({
  datasets,
  selectedId,
  onSelect,
}: {
  datasets: Dataset[];
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [records, setRecords] = useState<Case[]>([{ question: "", reference: "" }]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { refresh, notify } = useWorkspace();
  function update(index: number, key: keyof Case, value: string) {
    setRecords((rows) =>
      rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    );
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const dataset = await post<Dataset>("/datasets", { name, records });
      onSelect(dataset.id);
      setOpen(false);
      setName("");
      setRecords([{ question: "", reference: "" }]);
      refresh();
      notify("Dataset saved and selected for your next comparison.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Panel
        title="Evaluation datasets"
        subtitle="Use the same questions and references for every prompt version."
        action={
          <button
            className="button small"
            onClick={() => {
              setOpen(true);
              setError("");
            }}
          >
            <Plus size={13} />
            New dataset
          </button>
        }
      >
        {datasets.length ? (
          <div className="dataset-library">
            {datasets.map((dataset) => (
              <article
                key={dataset.id}
                className={`dataset-card ${selectedId === dataset.id ? "active" : ""}`}
              >
                <button
                  type="button"
                  className="dataset-select"
                  aria-pressed={selectedId === dataset.id}
                  onClick={() => onSelect(dataset.id)}
                >
                  <Database size={17} />
                  <span>
                    <strong>{dataset.name}</strong>
                    <small>
                      {dataset.records.length} cases ·{" "}
                      {dataset.records.filter((r) => r.reference).length}{" "}
                      reference answers
                    </small>
                  </span>
                  <Badge
                    tone={selectedId === dataset.id ? "violet" : "neutral"}
                  >
                    {selectedId === dataset.id ? "Selected" : "Select"}
                  </Badge>
                </button>
                <details>
                  <summary>Inspect questions and references</summary>
                  <ol>
                    {dataset.records.map((record) => (
                      <li key={record.id}>
                        <strong>{record.question}</strong>
                        <p>
                          {record.reference ||
                            "No reference answer. Correctness will be unavailable for this case."}
                        </p>
                      </li>
                    ))}
                  </ol>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="No evaluation datasets"
            description="Create a dataset of questions and optional reference answers to compare your prompts."
          />
        )}
        <p className="dataset-note">
          Datasets are immutable. Save revised cases as a new dataset to keep
          previous comparisons reproducible.
        </p>
      </Panel>
      {open && (
        <Modal
          title="Create an evaluation dataset"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p className="muted">
            Add up to 25 distinct questions. Reference answers enable
            correctness scoring.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              Dataset name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Account support regression cases"
              />
            </label>
            <div className="dataset-cases">
              {records.map((record, index) => (
                <fieldset key={index}>
                  <legend>Case {index + 1}</legend>
                  {records.length > 1 && (
                    <button
                      type="button"
                      className="icon-button remove-case"
                      aria-label={`Remove case ${index + 1}`}
                      disabled={busy}
                      onClick={() =>
                        setRecords((rows) => rows.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <label>
                    Question {index + 1}
                    <textarea
                      required
                      minLength={3}
                      maxLength={4000}
                      value={record.question}
                      onChange={(e) =>
                        update(index, "question", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Reference answer {index + 1} (optional)
                    <textarea
                      maxLength={10000}
                      value={record.reference}
                      onChange={(e) =>
                        update(index, "reference", e.target.value)
                      }
                    />
                  </label>
                </fieldset>
              ))}
            </div>
            <button
              className="button small"
              type="button"
              disabled={busy || records.length >= 25}
              onClick={() =>
                setRecords((rows) => [...rows, { question: "", reference: "" }])
              }
            >
              <Plus size={13} />
              Add case
            </button>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy && <LoaderCircle className="spin" size={15} />}{" "}
              {busy ? "Saving dataset…" : "Save dataset"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
