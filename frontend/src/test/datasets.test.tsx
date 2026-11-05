import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceProvider } from "../hooks/workspace";
import { DatasetLibrary } from "../components/DatasetLibrary";

describe("evaluation datasets", () => {
  it("creates reference cases and selects the stored dataset", async () => {
    const onSelect = vi.fn();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: 7, name: "Account regression", records: [] }),
          { status: 201 },
        ),
      );
    render(
      <WorkspaceProvider>
        <DatasetLibrary datasets={[]} selectedId={0} onSelect={onSelect} />
      </WorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "New dataset" }));
    fireEvent.change(screen.getByLabelText("Dataset name"), {
      target: { value: "Account regression" },
    });
    fireEvent.change(screen.getByLabelText("Question 1"), {
      target: { value: "How do I reset my password?" },
    });
    fireEvent.change(screen.getByLabelText("Reference answer 1 (optional)"), {
      target: { value: "Select Forgot password." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add case" }));
    fireEvent.change(screen.getByLabelText("Question 2"), {
      target: { value: "Where do I store API keys?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save dataset" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(7));
    expect(fetch).toHaveBeenCalledWith(
      "/api/datasets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Account regression",
          records: [
            {
              question: "How do I reset my password?",
              reference: "Select Forgot password.",
            },
            { question: "Where do I store API keys?", reference: "" },
          ],
        }),
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the form open and explains backend validation errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [
            {
              loc: ["body", "records"],
              msg: "Each dataset question must be distinct",
            },
          ],
        }),
        { status: 422 },
      ),
    );
    render(
      <WorkspaceProvider>
        <DatasetLibrary datasets={[]} selectedId={0} onSelect={vi.fn()} />
      </WorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "New dataset" }));
    fireEvent.change(screen.getByLabelText("Dataset name"), {
      target: { value: "Duplicates" },
    });
    fireEvent.change(screen.getByLabelText("Question 1"), {
      target: { value: "Reset password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save dataset" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "records: Each dataset question must be distinct",
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
