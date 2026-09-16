import { describe, expect, it } from "vitest";
import { MODELS } from "../lib/benchmark-catalog";
import { getLiterature } from "../lib/benchmark-literature";
import { matchesBenchmarkModelQuery } from "../lib/benchmark-model-aliases";

describe("benchmark model search aliases", () => {
  it("finds actual paper labels from catalog model links", () => {
    const { results } = getLiterature();
    const expectedLabels: Record<string, string[]> = {
      "evo-2": ["EVO2"],
      "nt-v2": ["NT-v2"],
      "esm-2": ["ESM2", "ESM2 650M", "CLAPE-SMB with ESM-2"],
      "dnabert-2": ["DNABERT2-Enhancer"],
      "kraken2": ["Kraken 2"],
      "prokbert": ["ProkBERT-mini"],
      "metaphlan": ["MetaPhlAn3"],
      "vina": ["Vina", "AutoDock Vina holo"],
      "geneformer": ["Human-Geneformer", "Mouse-Geneformer"],
    };
    for (const [modelId, labels] of Object.entries(expectedLabels)) {
      const query = MODELS.find((model) => model.id === modelId)!.name;
      for (const label of labels) {
        expect(results.some((result) => result.model === label), label).toBe(true);
        expect(matchesBenchmarkModelQuery(label, query), `${query} → ${label}`).toBe(true);
      }
    }
  });

  it("normalizes spacing, punctuation and alias direction", () => {
    expect(matchesBenchmarkModelQuery("EVO2", "  Evo–2  ")).toBe(true);
    expect(matchesBenchmarkModelQuery("Nucleotide Transformer v2", "NT-v2")).toBe(true);
    expect(matchesBenchmarkModelQuery("RNAFM", "RNA-FM")).toBe(true);
    expect(matchesBenchmarkModelQuery("AutoDock Vina holo", "Vina")).toBe(true);
  });

  it("does not conflate neighbouring model names or versions", () => {
    for (const [label, query] of [
      ["Evo 20", "Evo 2"],
      ["mRNA-FM", "RNA-FM"],
      ["ESMFold", "ESM-2"],
      ["ESM-C", "ESM-2"],
      ["DNABERT", "DNABERT-2"],
      ["NT-v1", "Nucleotide Transformer v2"],
      ["Nucleotide Transformer + NN (middle)", "Nucleotide Transformer v2"],
      ["DiffDock-NMDN", "DiffDock-L"],
      ["Boltz-1", "Boltz-2"],
      ["RNA-FM", ""],
    ]) {
      expect(matchesBenchmarkModelQuery(label, query), `${query} → ${label}`).toBe(false);
    }
  });
});
