**Implementation review — rewire-database #58, 24 September 2026**

Reviewed the working diff, source-label transformation and reviewed batch, snapshot validation, catalogue queries, chart/table transport, and record/profile rendering in `/Volumes/Extreme SSD/rewire-database-issue-58`. Application code, tests, data, releases and Git/GitHub state were not changed by this reviewer.

**P2 — Bind a linked identity to the record's actual tested subject.**

Location: `services/omics/src/source-identity.ts:112–124`, particularly the predicate at lines 117–123.

`validateSourceIdentity` accepts an evaluation/result identity when the referenced record has the same `source_label` and identity status, and its name occurs in the referring record's name. It does not require a subject identity record of the correct kind or follow the evaluation's tested-entity link. The available `IdentityRecord` type does not even include links.

A concrete counterexample requires only changing an already valid renamed evaluation's `attributes.source_identity.subject_id` to that evaluation's own ID. Its label, status and name all match itself, so this new publication gate accepts the record. `RecordPage` subsequently loads that ID as the identity subject, and `SourceIdentityNotice` renders a self-link as “Evidence for this identity”. Likewise, changing an evaluation's tested-entity link to another valid configuration leaves the copied identity, result names and subject ID accepted, even though the chart uses the different tested configuration. Existing evaluation validation checks link count and target kind, so it does not resolve this contradiction.

The gate should require a full subject identity on the allowed subject kind and prove the subject ID through the evaluation's actual tested-entity link; for a result, first follow its evaluation link. Reject self-references and unrelated targets. This preserves the explicit ID-based scientific attribution that the feature intends to enforce. Regression coverage should exercise these malformed references, not only missing labels or mismatched display names.

This is a validation defect; I did not find a wrong subject reference in the current eight-entry ATOM3D batch.

**Other conclusions and limits**

- The transformation retains existing IDs, result/evaluation links, values, comparison conditions, denominators and locators by spreading the original records and adding identity metadata. Only explicit reviewed family links and additive model/source/claim records are introduced.
- Both compact API records and packed chart transport preserve the new identity fields. Catalogue search, browse search and comparison-row search include the preserved printed label; charts and result tables use the changed record name.
- The existing query engine aggregates family results upward and does not send them back into sibling configurations. I found no inappropriate transfer introduced by the three added ATOM3D family edges.
- No historical archive changes appeared in the reviewed diff. I did not rebuild a release, execute authored probes, run tests or render a browser page; those validation runs remain with Claude. Tests were being written during review and their incompleteness is not a finding.
- The known omitted `hest-method-ciga` identity was already being routed to Claude and is not duplicated here. DeepAffinity's accepted split uncertainty is not challenged; no numerical or denominator change is requested.

No other concrete implementation bug was identified in the reviewed state.

**Follow-up review — graph validation and HEST shorthand**

Verdict: the P2 finding above is resolved in the revised implementation. No new concrete regression was identified in these changes.

`services/omics/src/source-identity.ts:127–164` now rejects an identity pointing at its own record, requires an allowed tested-entity kind with a full subject identity, and verifies the actual scientific links. An evaluation must link to the declared subject through a tested-entity relation. A result must link to an evaluation that tests that subject and carries the same identity subject ID. Combined with the existing snapshot checks requiring exactly one evaluation and tested entity, both the self-reference and unrelated-subject paths described above are blocked.

The new `label_form` distinction is explicit in each reviewed entry and subject identity. `scripts/omics/source-label-identities.ts:99–112` still requires the exact stable subject ID, previous-record hash, original name and declared label shape; the surname regex does not independently select records for renaming. The replacement at lines 56–64 requires one whole-label occurrence. The current HEST Ciga configuration, ten evaluation names/descriptions and ten result names satisfy that boundary rule, with measurements, links and conditions still copied unchanged. No model-family link is added for Ciga.

The updated Watkins entry consistently resolves the generic Rosetta scoring-function identity while leaving the exact RSR score function and settings unknown. This accepted source-review decision does not create a rendering or validation conflict.

The regression file was still being updated during this follow-up: the final read included the new fixture `label_form` but not completed graph/HEST cases. This is a review limitation, not an additional defect. No tests or authored probes were run by this reviewer. `git diff --check` passed. Application code, tests, data, releases and Git/GitHub state remain untouched by this reviewer.
