import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import {
  UnifiedLeaderboard,
  type BiologicalModelRankingRow,
} from "../../components/catalogue/UnifiedLeaderboard";
import { CATEGORY_PROTOCOL_BASELINES } from "../../lib/use-case-leaderboard";

// Mock next/link for ReactTestRenderer / static markup in Node environment
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

export const MOCK_LEADERBOARD_ROWS: BiologicalModelRankingRow[] = [
  {
    model_id: "poet-2",
    model_name: "PoET-2",
    creator: "OpenProt",
    category: "variant_effect",
    primary_metric_name: "Spearman Rho",
    raw_metric_value: 0.612,
    use_case_index_score: 94.1,
    margin_over_conventional: 42.1,
    fraction_of_biological_ceiling: 82.7,
    baselines: CATEGORY_PROTOCOL_BASELINES.variant_effect,
    telemetry: {
      inference_latency_ms: 42,
      throughput_items_per_sec: 23.8,
      min_vram_gb: 16,
      parameter_count_millions: 650,
      estimated_cost_per_1k_evals_usd: 0.012,
      open_weights: true,
      license: "Apache-2.0",
      context_window_length: 2048,
    },
    pareto_optimal: true,
    reviewed_status: "reproduced",
    source_record_id: "src-poet2",
    study_citations: [
      {
        study_id: "citation-1",
        title: "Deep Generative Models for Variant Effect",
        journal: "Nature",
        year: 2024,
        doi: "10.1038/s41586-024-07487-w",
      },
    ],
  },
  {
    model_id: "esm-2-3b",
    model_name: "ESM-2 (3B)",
    creator: "Meta AI",
    category: "variant_effect",
    primary_metric_name: "Spearman Rho",
    raw_metric_value: 0.584,
    use_case_index_score: 91.5,
    margin_over_conventional: 35.6,
    fraction_of_biological_ceiling: 78.9,
    baselines: CATEGORY_PROTOCOL_BASELINES.variant_effect,
    telemetry: {
      inference_latency_ms: 110,
      throughput_items_per_sec: 9.1,
      min_vram_gb: 24,
      parameter_count_millions: 3000,
      estimated_cost_per_1k_evals_usd: 0.045,
      open_weights: true,
      license: "MIT",
      context_window_length: 1024,
    },
    pareto_optimal: true,
    reviewed_status: "source_checked",
    source_record_id: "src-esm2-3b",
  },
  {
    model_id: "esm-2-650m",
    model_name: "ESM-2 (650M)",
    creator: "Meta AI",
    category: "variant_effect",
    primary_metric_name: "Spearman Rho",
    raw_metric_value: 0.541,
    use_case_index_score: 86.2,
    margin_over_conventional: 25.8,
    fraction_of_biological_ceiling: 73.1,
    baselines: CATEGORY_PROTOCOL_BASELINES.variant_effect,
    telemetry: {
      inference_latency_ms: 28,
      throughput_items_per_sec: 35.7,
      min_vram_gb: 8,
      parameter_count_millions: 650,
      estimated_cost_per_1k_evals_usd: 0.008,
      open_weights: true,
      license: "MIT",
      context_window_length: 1024,
    },
    pareto_optimal: false,
    reviewed_status: "community_verified",
    source_record_id: "src-esm2-650m",
  },
  {
    model_id: "closed-api-model",
    model_name: "Proprietary-BioLM",
    creator: "ClosedCorp",
    category: "variant_effect",
    primary_metric_name: "Spearman Rho",
    raw_metric_value: 0.59,
    use_case_index_score: 92.0,
    margin_over_conventional: 37.2,
    baselines: {
      null_baseline: { name: "Uniform Random", value: 0.0, description: "Random" },
      conventional_baseline: {
        name: "BLOSUM62",
        method_id: "blosum62",
        value: 0.43,
        description: "BLOSUM",
      },
    },
    telemetry: {
      inference_latency_ms: null,
      throughput_items_per_sec: null,
      min_vram_gb: null,
      parameter_count_millions: null,
      estimated_cost_per_1k_evals_usd: null,
      open_weights: false,
      license: "Proprietary",
      context_window_length: null,
    },
    pareto_optimal: false,
    reviewed_status: "source_checked",
    source_record_id: "src-closed",
  },
  {
    model_id: "blosum62-baseline",
    model_name: "BLOSUM62",
    creator: "Baseline",
    category: "variant_effect",
    primary_metric_name: "Spearman Rho",
    raw_metric_value: 0.43,
    use_case_index_score: 50.0,
    margin_over_conventional: 0.0,
    baselines: CATEGORY_PROTOCOL_BASELINES.variant_effect,
    telemetry: {
      inference_latency_ms: 0.1,
      throughput_items_per_sec: 10000,
      min_vram_gb: 0,
      parameter_count_millions: 0,
      estimated_cost_per_1k_evals_usd: 0,
      open_weights: true,
      license: "Public Domain",
      context_window_length: 2048,
    },
    pareto_optimal: false,
    reviewed_status: "source_checked",
    source_record_id: "src-blosum",
    is_baseline: true,
  },
  {
    model_id: "random-baseline",
    model_name: "Random Baseline",
    creator: "Baseline",
    category: "variant_effect",
    primary_metric_name: "Spearman Rho",
    raw_metric_value: 0.0,
    use_case_index_score: 0.0,
    margin_over_conventional: -100.0,
    baselines: CATEGORY_PROTOCOL_BASELINES.variant_effect,
    telemetry: {
      inference_latency_ms: 0.0,
      throughput_items_per_sec: 50000,
      min_vram_gb: 0,
      parameter_count_millions: 0,
      estimated_cost_per_1k_evals_usd: 0,
      open_weights: true,
      license: "Public Domain",
      context_window_length: null,
    },
    pareto_optimal: false,
    reviewed_status: "source_checked",
    source_record_id: "src-random",
    is_baseline: true,
  },
  // Structure prediction model
  {
    model_id: "alphafold-3",
    model_name: "AlphaFold 3",
    creator: "Google DeepMind",
    category: "structure_prediction",
    primary_metric_name: "lDDT",
    raw_metric_value: 89.5,
    use_case_index_score: 96.0,
    margin_over_conventional: 46.7,
    fraction_of_biological_ceiling: 96.5,
    baselines: CATEGORY_PROTOCOL_BASELINES.structure_prediction,
    telemetry: {
      inference_latency_ms: 14200,
      throughput_items_per_sec: 0.07,
      min_vram_gb: 80,
      parameter_count_millions: 650,
      estimated_cost_per_1k_evals_usd: 12.5,
      open_weights: false,
      license: "Non-commercial Research",
      context_window_length: 5120,
    },
    pareto_optimal: true,
    reviewed_status: "source_checked",
    source_record_id: "src-af3",
  },
  // Protein design model
  {
    model_id: "chroma",
    model_name: "Chroma",
    creator: "Generate Biomedicines",
    category: "protein_design",
    primary_metric_name: "scRMSD",
    raw_metric_value: 1.2,
    use_case_index_score: 97.1,
    margin_over_conventional: 73.3,
    fraction_of_biological_ceiling: 98.2,
    baselines: CATEGORY_PROTOCOL_BASELINES.protein_design,
    telemetry: {
      inference_latency_ms: 4500,
      throughput_items_per_sec: 0.22,
      min_vram_gb: 24,
      parameter_count_millions: 1200,
      estimated_cost_per_1k_evals_usd: 2.5,
      open_weights: false,
      license: "Proprietary",
      context_window_length: 1024,
    },
    pareto_optimal: true,
    reviewed_status: "source_checked",
    source_record_id: "src-chroma",
  },
  // Transcriptomics model
  {
    model_id: "gears",
    model_name: "GEARS",
    creator: "Stanford / SNAP",
    category: "transcriptomics",
    primary_metric_name: "Pearson r",
    raw_metric_value: 0.79,
    use_case_index_score: 96.3,
    margin_over_conventional: 88.1,
    fraction_of_biological_ceiling: 96.1,
    baselines: CATEGORY_PROTOCOL_BASELINES.transcriptomics,
    telemetry: {
      inference_latency_ms: 60,
      throughput_items_per_sec: 16.7,
      min_vram_gb: 8,
      parameter_count_millions: 15,
      estimated_cost_per_1k_evals_usd: 0.025,
      open_weights: true,
      license: "MIT",
      context_window_length: null,
    },
    pareto_optimal: true,
    reviewed_status: "reproduced",
    source_record_id: "src-gears",
  },
  // Genomic grammar model
  {
    model_id: "enformer",
    model_name: "Enformer",
    creator: "Google DeepMind",
    category: "genomic_grammar",
    primary_metric_name: "AUROC",
    raw_metric_value: 0.89,
    use_case_index_score: 89.6,
    margin_over_conventional: 27.1,
    fraction_of_biological_ceiling: 88.6,
    baselines: CATEGORY_PROTOCOL_BASELINES.genomic_grammar,
    telemetry: {
      inference_latency_ms: 350,
      throughput_items_per_sec: 2.8,
      min_vram_gb: 32,
      parameter_count_millions: 250,
      estimated_cost_per_1k_evals_usd: 0.2,
      open_weights: true,
      license: "Apache-2.0",
      context_window_length: 196608,
    },
    pareto_optimal: true,
    reviewed_status: "source_checked",
    source_record_id: "src-enformer",
  },
];

describe("UnifiedLeaderboard UI Component", () => {
  it("renders table header and primary columns via static markup", () => {
    const html = renderToStaticMarkup(
      <UnifiedLeaderboard rows={MOCK_LEADERBOARD_ROWS} initialCategory="variant_effect" />
    );

    expect(html).toContain("<table");
    expect(html).toContain("Rank");
    expect(html).toContain("Model");
    expect(html).toContain("Creator");
    expect(html).toContain("Capability Index");
    expect(html).toContain("Margin vs Pre-ML");
    expect(html).toContain("Spearman Rho");
    expect(html).toContain("Latency");
    expect(html).toContain("VRAM");
    expect(html).toContain("License");
    expect(html).toContain("PoET-2");
    expect(html).toContain("ESM-2 (3B)");
  });

  it("renders category switcher tabs with accessible attributes", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UnifiedLeaderboard rows={MOCK_LEADERBOARD_ROWS} initialCategory="variant_effect" />
      );
    });

    const buttons = renderer!.root.findAllByType("button");
    const tabButtons = buttons.filter((b) => b.props.role === "tab");
    expect(tabButtons.length).toBe(5);

    // Initial selected tab
    const variantTab = tabButtons.find((b) => b.props["data-use-case"] === "variant-effect");
    expect(variantTab?.props["aria-selected"]).toBe(true);

    // Click structure prediction tab
    const structTab = tabButtons.find((b) => b.props["data-use-case"] === "structure-prediction");
    act(() => {
      structTab?.props.onClick();
    });

    const updatedTab = renderer!.root
      .findAllByType("button")
      .find((b) => b.props["data-use-case"] === "structure-prediction");
    expect(updatedTab?.props["aria-selected"]).toBe(true);

    // Verify table updated to structure prediction metric and models
    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("lDDT");
    expect(json).toContain("AlphaFold 3");
  });

  it("switches across all biological categories cleanly", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(<UnifiedLeaderboard rows={MOCK_LEADERBOARD_ROWS} />);
    });

    const categories = [
      { slug: "protein-design", metric: "scRMSD", model: "Chroma" },
      { slug: "transcriptomics", metric: "Pearson r", model: "GEARS" },
      { slug: "genomic-grammar", metric: "AUROC", model: "Enformer" },
      { slug: "variant-effect", metric: "Spearman Rho", model: "PoET-2" },
    ];

    for (const cat of categories) {
      const tab = renderer!.root
        .findAllByType("button")
        .find((b) => b.props["data-use-case"] === cat.slug);
      act(() => {
        tab?.props.onClick();
      });
      const json = JSON.stringify(renderer!.toJSON());
      expect(json).toContain(cat.metric);
      expect(json).toContain(cat.model);
    }
  });

  it("handles sorting across all columns (asc and desc) with safe null handling", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UnifiedLeaderboard rows={MOCK_LEADERBOARD_ROWS} initialCategory="variant_effect" />
      );
    });

    const getModelRows = () =>
      renderer!.root.findAllByType("tr").filter((tr) => tr.props["data-model-id"]);

    // Helper to click a sort header by text content
    const clickHeader = (textMatch: string) => {
      const ths = renderer!.root.findAllByType("th");
      const th = ths.find((el) => {
        const text = Array.isArray(el.children) ? el.children.join("") : String(el.children || "");
        return text.includes(textMatch);
      });
      expect(th).toBeDefined();
      act(() => {
        th!.props.onClick();
      });
    };

    // 1. Sort by Model Name (asc then desc)
    clickHeader("Model");
    let rows = getModelRows();
    expect(rows[0].props["data-model-id"]).toBe("blosum62-baseline");

    clickHeader("Model");
    rows = getModelRows();
    expect(rows[0].props["data-model-id"]).toBe("random-baseline");

    // 2. Sort by Creator (asc then desc)
    clickHeader("Creator");
    clickHeader("Creator");

    // 3. Sort by Capability Index (default click sets desc, second click sets asc)
    clickHeader("Capability Index");
    rows = getModelRows();
    expect(rows[0].props["data-model-id"]).toBe("poet-2"); // highest index desc

    clickHeader("Capability Index");
    rows = getModelRows();
    expect(rows[0].props["data-model-id"]).toBe("random-baseline"); // lowest index asc

    // 4. Sort by Raw Metric
    clickHeader("Spearman Rho");
    clickHeader("Spearman Rho");

    // 5. Sort by Margin vs Pre-ML
    clickHeader("Margin vs Pre-ML");
    clickHeader("Margin vs Pre-ML");

    // 6. Sort by Latency with NULL HANDLING (closed-api-model has null latency)
    clickHeader("Latency");
    rows = getModelRows();
    // In ascending sort, fastest is first (random-baseline at 0ms), null is at the end
    expect(rows[0].props["data-model-id"]).toBe("random-baseline");
    expect(rows[rows.length - 1].props["data-model-id"]).toBe("closed-api-model");

    clickHeader("Latency"); // toggle desc
    rows = getModelRows();
    // In descending sort, slowest measured is first (esm-2-3b at 110ms), null is STILL at the end!
    expect(rows[0].props["data-model-id"]).toBe("esm-2-3b");
    expect(rows[rows.length - 1].props["data-model-id"]).toBe("closed-api-model");

    // 7. Sort by VRAM with NULL HANDLING (closed-api-model has null VRAM)
    clickHeader("VRAM");
    rows = getModelRows();
    expect(rows[rows.length - 1].props["data-model-id"]).toBe("closed-api-model");

    clickHeader("VRAM");
    rows = getModelRows();
    expect(rows[rows.length - 1].props["data-model-id"]).toBe("closed-api-model");

    // 8. Sort by License
    clickHeader("License");
    clickHeader("License");

    // 9. Sort by Rank
    clickHeader("Rank");
    clickHeader("Rank");
  });

  it("filters models by open weights, max VRAM, and search input", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UnifiedLeaderboard rows={MOCK_LEADERBOARD_ROWS} initialCategory="variant_effect" />
      );
    });

    // 1. Open weights filter
    const openWeightsCheckbox = renderer!.root.findByProps({ name: "open_weights_only" });
    act(() => {
      openWeightsCheckbox.props.onChange({ target: { checked: true } });
    });

    let json = JSON.stringify(renderer!.toJSON());
    expect(json).not.toContain("Proprietary-BioLM");
    expect(json).toContain("PoET-2");

    // 2. Max VRAM filter (< 16 GB)
    const vramSelect = renderer!.root.findByProps({
      "aria-label": "Filter by maximum VRAM requirement",
    });
    act(() => {
      vramSelect.props.onChange({ target: { value: "16" } });
    });

    json = JSON.stringify(renderer!.toJSON());
    expect(json).not.toContain("ESM-2 (3B)"); // 24GB excluded
    expect(json).toContain("PoET-2"); // 16GB included
    expect(json).toContain("ESM-2 (650M)"); // 8GB included

    // 3. Search query filter
    const searchInput = renderer!.root.findByProps({
      placeholder: "Search models or creators...",
    });
    act(() => {
      searchInput.props.onChange({ target: { value: "meta" } });
    });

    json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("ESM-2 (650M)");
    expect(json).not.toContain("PoET-2");

    // 4. Clear filters action
    const clearButton = renderer!.root
      .findAllByType("button")
      .find((b) => b.children.includes("Clear Filters"));
    expect(clearButton).toBeDefined();

    act(() => {
      clearButton!.props.onClick();
    });

    json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("PoET-2");
    expect(json).toContain("ESM-2 (3B)");
    expect(json).toContain("Proprietary-BioLM");
  });

  it("displays empty state when no models match search, with reset button", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UnifiedLeaderboard rows={MOCK_LEADERBOARD_ROWS} initialCategory="variant_effect" />
      );
    });

    const searchInput = renderer!.root.findByProps({
      placeholder: "Search models or creators...",
    });
    act(() => {
      searchInput.props.onChange({ target: { value: "nonexistent-model-xyz-999" } });
    });

    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("No matching models found");

    const resetButton = renderer!.root
      .findAllByType("button")
      .find((b) => b.children.includes("Reset Filters"));
    expect(resetButton).toBeDefined();

    act(() => {
      resetButton!.props.onClick();
    });

    const restoredJson = JSON.stringify(renderer!.toJSON());
    expect(restoredJson).toContain("PoET-2");
  });

  it("handles progressive disclosure of secondary metrics in drawer rows", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UnifiedLeaderboard rows={MOCK_LEADERBOARD_ROWS} initialCategory="variant_effect" />
      );
    });

    // Rows start collapsed
    let drawers = renderer!.root.findAllByProps({ "data-drawer-for": "poet-2" });
    expect(drawers.length).toBe(0);

    // Expand poet-2 by clicking row
    const poetRow = renderer!.root.findByProps({ "data-model-id": "poet-2" });
    act(() => {
      poetRow.props.onClick();
    });

    drawers = renderer!.root.findAllByProps({ "data-drawer-for": "poet-2" });
    expect(drawers.length).toBe(1);

    const drawerJson = JSON.stringify(renderer!.toJSON());
    expect(drawerJson).toContain("Hardware & Telemetry");
    expect(drawerJson).toContain("42 ms");
    expect(drawerJson).toContain("23.8 /s");
    expect(drawerJson).toContain("16 GB");
    expect(drawerJson).toContain("650M");
    expect(drawerJson).toContain("2048");
    expect(drawerJson).toContain("Protocol Baselines & Signal");
    expect(drawerJson).toContain("BLOSUM62");
    expect(drawerJson).toContain("82.7%");
    expect(drawerJson).toContain("Scientific Provenance");
    expect(drawerJson).toContain("src-poet2");
    expect(drawerJson).toContain("reproduced");
    expect(drawerJson).toContain("Pareto Frontier");
    expect(drawerJson).toContain("Nature"); // citation journal
    expect(drawerJson).toContain("10.1038/s41586-024-07487-w"); // citation doi

    // Collapse poet-2 by clicking toggle button
    const toggleBtn = renderer!.root.findByProps({
      "aria-label": "Toggle details for PoET-2",
    });
    act(() => {
      toggleBtn.props.onClick({ stopPropagation: () => {} });
    });

    drawers = renderer!.root.findAllByProps({ "data-drawer-for": "poet-2" });
    expect(drawers.length).toBe(0);
  });

  it("handles null telemetry defensively in drawer rows", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UnifiedLeaderboard rows={MOCK_LEADERBOARD_ROWS} initialCategory="variant_effect" />
      );
    });

    // Expand closed-api-model (all telemetry execution fields are null)
    const closedRow = renderer!.root.findByProps({ "data-model-id": "closed-api-model" });
    act(() => {
      closedRow.props.onClick();
    });

    const drawers = renderer!.root.findAllByProps({ "data-drawer-for": "closed-api-model" });
    expect(drawers.length).toBe(1);

    const drawerJson = JSON.stringify(renderer!.toJSON());
    expect(drawerJson).toContain("Not measured");
    expect(drawerJson).toContain("Not reported");
    expect(drawerJson).toContain("Not estimated");
    expect(drawerJson).toContain("Closed / Proprietary");
    expect(drawerJson).toContain("Undefined"); // ceiling undefined
  });

  it("pre-expands row when expandedRowId prop is provided", () => {
    const html = renderToStaticMarkup(
      <UnifiedLeaderboard
        rows={MOCK_LEADERBOARD_ROWS}
        initialCategory="variant_effect"
        expandedRowId="poet-2"
      />
    );

    expect(html).toContain('data-drawer-for="poet-2"');
    expect(html).toContain("Deep Generative Models for Variant Effect");
  });

  it("renders Pareto highlight screening banner when showParetoHighlight is true", () => {
    const html = renderToStaticMarkup(
      <UnifiedLeaderboard
        rows={MOCK_LEADERBOARD_ROWS}
        initialCategory="variant_effect"
        showParetoHighlight={true}
      />
    );

    expect(html).toContain("Pareto Frontier Screening");
    expect(html).toContain("23.8 items/sec");
  });

  it("hides category switcher tabs when showCategorySwitcher is false", () => {
    const html = renderToStaticMarkup(
      <UnifiedLeaderboard
        rows={MOCK_LEADERBOARD_ROWS}
        initialCategory="variant_effect"
        showCategorySwitcher={false}
      />
    );

    expect(html).not.toContain('role="tablist"');
  });

  it("renders gracefully with empty rows prop", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard rows={[]} />);
    expect(html).toContain("No matching models found");
  });

  it("falls back to default catalogue when rows prop is undefined", () => {
    const html = renderToStaticMarkup(
      <UnifiedLeaderboard initialCategory="variant_effect" />
    );
    expect(html).toContain("PoET-2");
    expect(html).toContain("BLOSUM62");
  });

  it("supports useCaseSlug prop for initial category resolution", () => {
    const html = renderToStaticMarkup(
      <UnifiedLeaderboard useCaseSlug="structure-prediction" />
    );
    expect(html).toContain("lDDT");
    expect(html).toContain("AlphaFold 3");
  });

  it("renders unstandardized assay category where biological ceiling is undefined", () => {
    const html = renderToStaticMarkup(
      <UnifiedLeaderboard initialCategory="unstandardized" />
    );
    expect(html).toContain("Experimental noise floor not yet standardized");
    expect(html).toContain("Standard Heuristic Baseline");
  });

  it("renders community_verified and baseline details in drawer rows", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UnifiedLeaderboard rows={MOCK_LEADERBOARD_ROWS} initialCategory="variant_effect" />
      );
    });

    // Expand esm-2-650m which has community_verified status
    const esmRow = renderer!.root.findByProps({ "data-model-id": "esm-2-650m" });
    act(() => {
      esmRow.props.onClick();
    });

    let json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("community_verified");

    // Expand blosum62-baseline which is a baseline
    const blosumRow = renderer!.root.findByProps({ "data-model-id": "blosum62-baseline" });
    act(() => {
      blosumRow.props.onClick();
    });

    json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("Reference Baseline");

    // Click link with stopPropagation
    const link = renderer!.root.findAllByType("a")[0];
    act(() => {
      link.props.onClick({ stopPropagation: () => {} });
    });
  });

  it("handles all VRAM filter thresholds and search by creator / license", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UnifiedLeaderboard rows={MOCK_LEADERBOARD_ROWS} initialCategory="variant_effect" />
      );
    });

    const vramSelect = renderer!.root.findByProps({
      "aria-label": "Filter by maximum VRAM requirement",
    });

    // Select 24GB
    act(() => {
      vramSelect.props.onChange({ target: { value: "24" } });
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("ESM-2 (3B)");

    // Select 48GB
    act(() => {
      vramSelect.props.onChange({ target: { value: "48" } });
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("ESM-2 (3B)");

    // Select 80GB
    act(() => {
      vramSelect.props.onChange({ target: { value: "80" } });
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("ESM-2 (3B)");

    // Reset to all
    act(() => {
      vramSelect.props.onChange({ target: { value: "all" } });
    });

    // Search by creator
    const searchInput = renderer!.root.findByProps({
      placeholder: "Search models or creators...",
    });
    act(() => {
      searchInput.props.onChange({ target: { value: "Meta AI" } });
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("ESM-2 (3B)");

    // Search by license
    act(() => {
      searchInput.props.onChange({ target: { value: "Apache-2.0" } });
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("PoET-2");
  });

  it("defensively handles null and undefined fraction_of_biological_ceiling in drawer and footer banner without throwing", () => {
    const testRowWithNullCeiling: BiologicalModelRankingRow = {
      model_id: "null-ceiling-model",
      model_name: "Null Ceiling Model",
      creator: "Test Org",
      category: "variant_effect",
      primary_metric_name: "Spearman Rho",
      raw_metric_value: 0.75,
      use_case_index_score: 99.0,
      margin_over_conventional: 50.0,
      fraction_of_biological_ceiling: null as any,
      baselines: CATEGORY_PROTOCOL_BASELINES.variant_effect,
      telemetry: {
        inference_latency_ms: 50,
        throughput_items_per_sec: null,
        min_vram_gb: 16,
        parameter_count_millions: 500,
        estimated_cost_per_1k_evals_usd: 0.02,
        open_weights: true,
        license: "Apache-2.0",
        context_window_length: 1024,
      },
      pareto_optimal: true,
      reviewed_status: "reproduced",
      source_record_id: "src-null-ceiling",
    };

    let renderer: ReactTestRenderer;
    expect(() => {
      act(() => {
        renderer = create(
          <UnifiedLeaderboard
            rows={[testRowWithNullCeiling]}
            expandedRowId="null-ceiling-model"
            showParetoHighlight={true}
          />
        );
      });
    }).not.toThrow();

    const json = JSON.stringify(renderer!.toJSON());
    // In drawer, % Biological Ceiling Captured should render "Undefined"
    expect(json).toContain("Undefined");
    // Footer banner top model check should not crash and should safely omit null%
    expect(json).not.toContain("null%");
    // Pareto highlight banner should render without throughput suffix
    expect(json).toContain("Pareto Frontier Screening");
  });

  it("defensively handles null and undefined use_case_index_score in row rendering without throwing", () => {
    const testRowWithNullIndex: BiologicalModelRankingRow = {
      model_id: "null-index-model",
      model_name: "Null Index Model",
      creator: "Test Org",
      category: "variant_effect",
      primary_metric_name: "Spearman Rho",
      raw_metric_value: 0.5,
      use_case_index_score: null as any,
      margin_over_conventional: 10.0,
      fraction_of_biological_ceiling: 50.0,
      baselines: CATEGORY_PROTOCOL_BASELINES.variant_effect,
      telemetry: {
        inference_latency_ms: 10,
        throughput_items_per_sec: null,
        min_vram_gb: null,
        parameter_count_millions: null,
        estimated_cost_per_1k_evals_usd: null,
        open_weights: true,
        license: "MIT",
        context_window_length: null,
      },
      pareto_optimal: false,
      reviewed_status: "source_checked",
      source_record_id: "src-null-index",
    };

    let renderer: ReactTestRenderer;
    expect(() => {
      act(() => {
        renderer = create(
          <UnifiedLeaderboard rows={[testRowWithNullIndex]} />
        );
      });
    }).not.toThrow();

    const json = JSON.stringify(renderer!.toJSON());
    // Capability index score should safely display "—"
    expect(json).toContain("—");
  });

  it("supports accessible keyboard navigation (Enter, Space) on sortable table headers", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UnifiedLeaderboard rows={MOCK_LEADERBOARD_ROWS} initialCategory="variant_effect" />
      );
    });

    const ths = renderer!.root.findAllByType("th");
    const sortHeaders = ths.filter((th) => th.props.tabIndex === 0);
    // 9 sortable columns: rank, model, creator, index, metric, margin, latency, vram, license
    expect(sortHeaders.length).toBe(9);

    const modelHeader = sortHeaders.find((th) => {
      const text = Array.isArray(th.children) ? th.children.join("") : String(th.children || "");
      return text.includes("Model");
    });
    expect(modelHeader).toBeDefined();

    // Trigger Enter key across all 9 sortable headers to verify keyboard accessibility
    const preventDefault = vi.fn();
    for (const header of sortHeaders) {
      act(() => {
        header.props.onKeyDown({ key: "Enter", preventDefault });
      });
    }
    expect(preventDefault).toHaveBeenCalledTimes(9);

    let rows = renderer!.root.findAllByType("tr").filter((tr) => tr.props["data-model-id"]);
    expect(rows.length).toBeGreaterThan(0);

    // Trigger Space key on Model header (switches active column to model, defaults to asc)
    act(() => {
      modelHeader!.props.onKeyDown({ key: " ", preventDefault });
    });
    rows = renderer!.root.findAllByType("tr").filter((tr) => tr.props["data-model-id"]);
    expect(rows[0].props["data-model-id"]).toBe("blosum62-baseline");

    // Trigger Spacebar key on Model header (toggles direction to desc)
    act(() => {
      modelHeader!.props.onKeyDown({ key: "Spacebar", preventDefault });
    });
    rows = renderer!.root.findAllByType("tr").filter((tr) => tr.props["data-model-id"]);
    expect(rows[0].props["data-model-id"]).toBe("random-baseline");

    // Other keys (e.g. Tab, Escape) should not trigger sort or preventDefault
    const nonTriggerPreventDefault = vi.fn();
    act(() => {
      modelHeader!.props.onKeyDown({ key: "Tab", preventDefault: nonTriggerPreventDefault });
    });
    expect(nonTriggerPreventDefault).not.toHaveBeenCalled();
  });
});
