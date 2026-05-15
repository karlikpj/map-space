export type NodeKind = "root" | "class" | "enum" | "leaf";

export interface DiagramNode {
  id: string;
  title: string;
  kind: NodeKind;
  subtitle?: string;
  children?: DiagramNode[];
}

const ACRONYMS = new Map<string, string>([
  ["rct", "RCT"],
  ["pico", "PICO"],
]);

const enumValues = {
  DesignType: [
    "RCT_double_blind",
    "RCT_single_blind",
    "RCT_open_label",
    "meta_analysis",
    "nonrandomized_controlled",
    "cohort_prospective",
    "cohort_retrospective",
    "case_control",
    "case_series",
    "cross_sectional",
    "systematic_review",
    "observational_other",
    "noninferiority_trial",
    "modeling_study",
    "unknown",
  ],
  Multicenter: ["yes", "no", "not_applicable", "unknown"],
  Prospective: ["yes", "no", "not_applicable", "unknown"],
  TrialPhase: ["early_phase_1", "phase_1", "phase_2", "phase_3", "phase_4"],
  AgeGroup: ["pediatric", "adult", "both", "unknown"],
  InterventionType: [
    "chemotherapy",
    "targeted_therapy",
    "immunotherapy",
    "radiation",
    "surgery",
    "combination",
    "supportive_care",
    "diagnostic",
    "other",
    "unknown",
  ],
  PrimaryEndpointCategory: [
    "overall_survival",
    "cause_specific_mortality",
    "total_mortality",
    "quality_of_life",
    "event_free_survival",
    "relapse_free_survival",
    "disease_free_survival",
    "progression_free_survival",
    "tumor_response",
    "biomarker",
    "safety",
    "expert_opinion",
  ],
  StatisticalSignificanceAssessment: [
    "not_statistically_significant",
    "statistically_significant_with_a_narrow_confidence_interval",
    "statistically_significant_with_a_wide_confidence_interval",
    "statistically_significant_with_unknown_confidence_interval",
    "not_determined_based_on_info_provided",
  ],
  ConclusionsCategory: [
    "not_determinable",
    "no_meaningful_findings_more_research_needed",
    "solid_findings_more_research_needed",
    "actionable_findings_system_changes_needed",
    "clear_findings_ready_for_implementation",
  ],
  OverallConfidence: ["high", "moderate", "low"],
} as const;

function toId(...parts: string[]): string {
  return parts
    .join(".")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[[\]<>~]/g, " ")
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      if (ACRONYMS.has(lower)) {
        return ACRONYMS.get(lower) as string;
      }
      if (token.toUpperCase() === token && token.length <= 5) {
        return token;
      }
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(" ");
}

function leafNode(path: string[], title: string, subtitle?: string): DiagramNode {
  return {
    id: toId(...path, title),
    title,
    kind: "leaf",
    subtitle,
  };
}

function branchNode(
  path: string[],
  title: string,
  kind: Extract<NodeKind, "class" | "enum">,
  subtitle?: string,
  children?: DiagramNode[],
): DiagramNode {
  return {
    id: toId(...path, title),
    title,
    kind,
    subtitle,
    children,
  };
}

function scalarField(path: string[], fieldName: string, typeLabel: string): DiagramNode {
  return leafNode(path, humanize(fieldName), `${fieldName}: ${typeLabel}`);
}

function enumOptionLeaf(path: string[], ownerName: string, value: string): DiagramNode {
  return leafNode(path, humanize(value), `${ownerName} option`);
}

function enumField(
  path: string[],
  fieldName: string,
  typeLabel: keyof typeof enumValues,
  subtitleOverride?: string,
): DiagramNode {
  return branchNode(
    [...path, fieldName],
    humanize(fieldName),
    "enum",
    subtitleOverride ?? `${fieldName}: ${typeLabel}`,
    enumValues[typeLabel].map((value) =>
      enumOptionLeaf([...path, fieldName], typeLabel, value),
    ),
  );
}

function classNode(
  path: string[],
  className: string,
  children: DiagramNode[],
  subtitle?: string,
): DiagramNode {
  return branchNode(
    [...path, className],
    humanize(className),
    "class",
    subtitle ?? `${children.length} children`,
    children,
  );
}

function unionField(
  path: string[],
  fieldName: string,
  unionLabel: string,
  children: DiagramNode[],
): DiagramNode {
  return branchNode(
    [...path, fieldName],
    humanize(fieldName),
    "class",
    `${fieldName}: ${unionLabel}`,
    children,
  );
}

const trialPhasesVariant = branchNode(
  ["study-design-model", "StudyDesign", "trial_phase"],
  "Trial Phases List",
  "class",
  "TrialPhases: list[TrialPhase] (min_length=1, max_length=2)",
  enumValues.TrialPhase.map((value) =>
    enumOptionLeaf(
      ["study-design-model", "StudyDesign", "trial_phase", "TrialPhases"],
      "TrialPhase",
      value,
    ),
  ),
);

const primaryEndpoint = classNode(
  ["study-design-model", "PicoElements", "Outcomes", "primary_endpoints", "PrimaryEndpoints"],
  "PrimaryEndpoint",
  [
    scalarField(
      [
        "study-design-model",
        "PicoElements",
        "Outcomes",
        "primary_endpoints",
        "PrimaryEndpoints",
        "PrimaryEndpoint",
      ],
      "primary_endpoint_text",
      "str",
    ),
    enumField(
      [
        "study-design-model",
        "PicoElements",
        "Outcomes",
        "primary_endpoints",
        "PrimaryEndpoints",
        "PrimaryEndpoint",
      ],
      "primary_endpoint_category",
      "PrimaryEndpointCategory",
    ),
    scalarField(
      [
        "study-design-model",
        "PicoElements",
        "Outcomes",
        "primary_endpoints",
        "PrimaryEndpoints",
        "PrimaryEndpoint",
      ],
      "primary_endpoint_results",
      'str = "unknown"',
    ),
    enumField(
      [
        "study-design-model",
        "PicoElements",
        "Outcomes",
        "primary_endpoints",
        "PrimaryEndpoints",
        "PrimaryEndpoint",
      ],
      "statistical_significance_assessment",
      "StatisticalSignificanceAssessment",
    ),
    scalarField(
      [
        "study-design-model",
        "PicoElements",
        "Outcomes",
        "primary_endpoints",
        "PrimaryEndpoints",
        "PrimaryEndpoint",
      ],
      "statistical_significance_assessment_reason",
      "str",
    ),
  ],
  "5 fields",
);

const primaryEndpointsVariant = branchNode(
  ["study-design-model", "PicoElements", "Outcomes", "primary_endpoints"],
  "Primary Endpoints List",
  "class",
  "PrimaryEndpoints: list[PrimaryEndpoint] (min_length=1)",
  [primaryEndpoint],
);

const secondaryEndpointsVariant = branchNode(
  ["study-design-model", "PicoElements", "Outcomes", "secondary_endpoints"],
  "Secondary Endpoints List",
  "class",
  "SecondaryEndpoints: list[str] (min_length=1)",
  [
    leafNode(
      [
        "study-design-model",
        "PicoElements",
        "Outcomes",
        "secondary_endpoints",
        "SecondaryEndpoints",
      ],
      "Values",
      "root: list[str] (min_length=1)",
    ),
  ],
);

const sampleSizeVariant = branchNode(
  ["study-design-model", "PicoElements", "Population", "sample_size"],
  "Sample Size Value",
  "class",
  "SampleSize: int (ge=1)",
  [
    leafNode(
      [
        "study-design-model",
        "PicoElements",
        "Population",
        "sample_size",
        "SampleSize",
      ],
      "Value",
      "root: int (ge=1)",
    ),
  ],
);

const studyDesign = classNode(
  ["study-design-model"],
  "StudyDesign",
  [
    enumField(["study-design-model", "StudyDesign"], "design_type", "DesignType"),
    enumField(["study-design-model", "StudyDesign"], "multicenter", "Multicenter"),
    enumField(["study-design-model", "StudyDesign"], "prospective", "Prospective"),
    unionField(
      ["study-design-model", "StudyDesign"],
      "trial_phase",
      "TrialPhases | TrialPhases1 | TrialPhases2",
      [
        trialPhasesVariant,
        enumOptionLeaf(
          ["study-design-model", "StudyDesign", "trial_phase", "TrialPhases1"],
          "TrialPhases1",
          "unknown",
        ),
        enumOptionLeaf(
          ["study-design-model", "StudyDesign", "trial_phase", "TrialPhases2"],
          "TrialPhases2",
          "not_applicable",
        ),
      ],
    ),
  ],
  "4 fields",
);

const population = classNode(
  ["study-design-model", "PicoElements"],
  "Population",
  [
    scalarField(
      ["study-design-model", "PicoElements", "Population"],
      "cancer_type",
      "str",
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Population"],
      "cancer_stage",
      "str",
    ),
    enumField(
      ["study-design-model", "PicoElements", "Population"],
      "age_group",
      "AgeGroup",
    ),
    unionField(
      ["study-design-model", "PicoElements", "Population"],
      "sample_size",
      "SampleSize | SampleSize1",
      [
        sampleSizeVariant,
        enumOptionLeaf(
          [
            "study-design-model",
            "PicoElements",
            "Population",
            "sample_size",
            "SampleSize1",
          ],
          "SampleSize1",
          "unknown",
        ),
        enumOptionLeaf(
          [
            "study-design-model",
            "PicoElements",
            "Population",
            "sample_size",
            "SampleSize1",
          ],
          "SampleSize1",
          "not_applicable",
        ),
      ],
    ),
  ],
  "4 fields",
);

const intervention = classNode(
  ["study-design-model", "PicoElements"],
  "Intervention",
  [
    scalarField(
      ["study-design-model", "PicoElements", "Intervention"],
      "primary_intervention",
      "str",
    ),
    enumField(
      ["study-design-model", "PicoElements", "Intervention"],
      "intervention_type",
      "InterventionType",
    ),
  ],
  "2 fields",
);

const outcomes = classNode(
  ["study-design-model", "PicoElements"],
  "Outcomes",
  [
    unionField(
      ["study-design-model", "PicoElements", "Outcomes"],
      "primary_endpoints",
      "PrimaryEndpoints | PrimaryEndpoints1 | PrimaryEndpoints2",
      [
        primaryEndpointsVariant,
        enumOptionLeaf(
          [
            "study-design-model",
            "PicoElements",
            "Outcomes",
            "primary_endpoints",
            "PrimaryEndpoints1",
          ],
          "PrimaryEndpoints1",
          "unknown",
        ),
        enumOptionLeaf(
          [
            "study-design-model",
            "PicoElements",
            "Outcomes",
            "primary_endpoints",
            "PrimaryEndpoints2",
          ],
          "PrimaryEndpoints2",
          "not_applicable",
        ),
      ],
    ),
    unionField(
      ["study-design-model", "PicoElements", "Outcomes"],
      "secondary_endpoints",
      "SecondaryEndpoints | SecondaryEndpoints1",
      [
        secondaryEndpointsVariant,
        enumOptionLeaf(
          [
            "study-design-model",
            "PicoElements",
            "Outcomes",
            "secondary_endpoints",
            "SecondaryEndpoints1",
          ],
          "SecondaryEndpoints1",
          "unknown",
        ),
      ],
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Outcomes"],
      "study_conclusions",
      'str = "Not reported"',
    ),
    enumField(
      ["study-design-model", "PicoElements", "Outcomes"],
      "conclusions_category",
      "ConclusionsCategory",
      "conclusions_category: ConclusionsCategory = not_determinable",
    ),
  ],
  "4 fields",
);

const picoElements = classNode(
  ["study-design-model"],
  "PicoElements",
  [population, intervention, outcomes],
  "3 sections",
);

const extractionConfidence = classNode(
  ["study-design-model"],
  "ExtractionConfidence",
  [
    enumField(
      ["study-design-model", "ExtractionConfidence"],
      "overall_confidence",
      "OverallConfidence",
    ),
    scalarField(
      ["study-design-model", "ExtractionConfidence"],
      "missing_critical_elements",
      "list[str]",
    ),
    scalarField(
      ["study-design-model", "ExtractionConfidence"],
      "extraction_notes",
      "str",
    ),
  ],
  "3 fields",
);

export const studyDesignModel: DiagramNode = {
  id: "study-design-model",
  title: "Study Design Model",
  kind: "root",
  subtitle: "3 primary sections",
  children: [studyDesign, picoElements, extractionConfidence],
};
