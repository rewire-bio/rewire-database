# Retrieval log — 30 September 2026

Web discovery used the queries below. Successful source HTML/XML, figure and DOCX bytes are cached under ignored `workbench/use-case-coverage/clinical/`. Source records preserve their digests.

## Issue #341
- Exomiser benchmark 2024 2025 rare disease 100000 genomes top 1 LIRICAL benchmark table
- Talos automated reanalysis rare disease 2024 2025 diagnostic yield

## Issue #342
- Talos automated reanalysis rare disease 2024 2025 diagnostic yield
- AUTOMATED VERSUS MANUAL REANALYSIS IN RARE DISEASE GENOMICS

## Issue #343
- BRCA1 BRCA2 classification benchmark ENIGMA AutoGVP 2024 table
- BRCA1 BRCA2 manual benchmark AutoGVP

## Issue #344
- somatic oncogenicity benchmark CancerVar oncogenicity 2024 2025 table
- Oncogenicity Variant Interpreter full text table 2026

## Issue #345
- EGFR NSCLC evidence retrieval benchmark CIViC precision recall molecular tumor board OncoKB benchmark
- EGFR evidence retrieval benchmark
- CIViC benchmark precision recall evidence extraction
- EGFR CIViC MCP benchmark

## Access outcomes

- Talos final Nature HTML and Table 1 HTML: retrieved successfully by public HTTPS.
- ENIGMA PMC HTML: retrieved successfully by HTTPS after web-browser wrapper returned challenge; Europe PMC XML returned HTTP500. Supplement mmc3.xlsx download returned challenge HTML and was not parsed as spreadsheet.
- OncoVI Europe PMC fullTextXML: retrieved successfully. Supplemental Table S6 mmc15.xlsx returned challenge HTML.
- CIViC final OUP HTML through publisher CDN and linked supplementary DOCX: retrieved successfully. Figure1c JPEG visually inspected; supplementary tables parsed from document XML.
- PhEval PMC11929307 fullTextXML: discovered and inspected as an alternative reproducible ranking framework, not extracted into numeric comparisons because selected Talos primary cohort more closely tests review workload.
- CAVaLRi Wiley primary page: discovered, HTTP403/timeout on full retrieval; not used for unverified numeric extraction.
- 2026 automated-versus-manual reanalysis medRxiv: discovered; HTTP403 full retrieval. Indexed text/caption has conflicting diagnostic percentages; no numeric intake.
- Current OncoKB and CIViC documentation: discovery context only, not invented benchmarks. OncoTraj longitudinal resistance benchmark addresses a different endpoint; no evidence-retrieval coverage inferred.

Search is bounded, not a proof that no benchmark exists.
