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
    "unknown",
  ],
  Randomization: ["yes", "no", "unknown"],
  Blinding: [
    "double_blind",
    "single_blind",
    "open_label",
    "not_applicable",
    "unknown",
  ],
  ControlType: [
    "placebo",
    "active_comparator",
    "historical",
    "no_control",
    "unknown",
  ],
  Multicenter: ["yes", "no", "unknown"],
  Prospective: ["yes", "no", "unknown"],
  ConsecutiveEnrollment: ["yes", "no", "unknown"],
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
  ComparatorType: [
    "standard_of_care",
    "placebo",
    "alternative_treatment",
    "no_treatment",
    "historical_control",
    "unknown",
  ],
  PrimaryEndpointCategory: [
    "overall_survival",
    "cause_specific_mortality",
    "quality_of_life",
    "event_free_survival",
    "relapse_free_survival",
    "disease_free_survival",
    "progression_free_survival",
    "tumor_response",
    "biomarker",
    "safety",
    "unknown",
  ],
  StatisticalSignificance: [
    "significant",
    "not_significant",
    "mixed",
    "unknown",
  ],
  IntentionToTreat: ["yes", "no", "unknown"],
  PowerCalculation: ["yes", "no", "unknown"],
  FundingSource: ["industry", "government", "non_profit", "mixed", "unknown"],
  ConflictsOfInterest: [
    "declared_none",
    "declared_present",
    "not_declared",
    "unknown",
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
    .replace(/[<>~]/g, " ")
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

function scalarField(path: string[], fieldName: string, typeLabel: string): DiagramNode {
  return {
    id: toId(...path, fieldName),
    title: humanize(fieldName),
    kind: "leaf",
    subtitle: `${fieldName}: ${typeLabel}`,
  };
}

function enumField(
  path: string[],
  fieldName: string,
  typeLabel: keyof typeof enumValues,
): DiagramNode {
  const values = enumValues[typeLabel];

  return {
    id: toId(...path, fieldName),
    title: humanize(fieldName),
    kind: "enum",
    subtitle: `${fieldName}: ${typeLabel}`,
    children: values.map((value) => ({
      id: toId(...path, fieldName, value),
      title: humanize(value),
      kind: "leaf",
      subtitle: `${typeLabel} option`,
    })),
  };
}

function classNode(
  path: string[],
  className: string,
  children: DiagramNode[],
  subtitle?: string,
): DiagramNode {
  return {
    id: toId(...path, className),
    title: humanize(className),
    kind: "class",
    subtitle: subtitle ?? `${children.length} children`,
    children,
  };
}

const studyDesign = classNode(
  ["study-design-model"],
  "StudyDesign",
  [
    enumField(["study-design-model", "StudyDesign"], "design_type", "DesignType"),
    enumField(
      ["study-design-model", "StudyDesign"],
      "randomization",
      "Randomization",
    ),
    enumField(["study-design-model", "StudyDesign"], "blinding", "Blinding"),
    enumField(["study-design-model", "StudyDesign"], "control_type", "ControlType"),
    enumField(["study-design-model", "StudyDesign"], "multicenter", "Multicenter"),
    enumField(["study-design-model", "StudyDesign"], "prospective", "Prospective"),
    enumField(
      ["study-design-model", "StudyDesign"],
      "consecutive_enrollment",
      "ConsecutiveEnrollment",
    ),
  ],
  "7 fields",
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
    scalarField(
      ["study-design-model", "PicoElements", "Population"],
      "sample_size",
      "Union",
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Population"],
      "inclusion_criteria",
      "Union",
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Population"],
      "exclusion_criteria",
      "Union",
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Population"],
      "prior_treatments",
      "str",
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Population"],
      "biomarker_selection",
      "str",
    ),
  ],
  "8 fields",
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
    scalarField(
      ["study-design-model", "PicoElements", "Intervention"],
      "dosing_regimen",
      "str",
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Intervention"],
      "treatment_duration",
      "str",
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Intervention"],
      "combination_components",
      "Union",
    ),
  ],
  "5 fields",
);

const comparison = classNode(
  ["study-design-model", "PicoElements"],
  "Comparison",
  [
    scalarField(
      ["study-design-model", "PicoElements", "Comparison"],
      "comparator",
      "str",
    ),
    enumField(
      ["study-design-model", "PicoElements", "Comparison"],
      "comparator_type",
      "ComparatorType",
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Comparison"],
      "comparator_details",
      "str",
    ),
  ],
  "3 fields",
);

const outcomes = classNode(
  ["study-design-model", "PicoElements"],
  "Outcomes",
  [
    scalarField(
      ["study-design-model", "PicoElements", "Outcomes"],
      "primary_endpoint",
      "str",
    ),
    enumField(
      ["study-design-model", "PicoElements", "Outcomes"],
      "primary_endpoint_category",
      "PrimaryEndpointCategory",
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Outcomes"],
      "secondary_endpoints",
      "Union",
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Outcomes"],
      "time_frame",
      "str",
    ),
    enumField(
      ["study-design-model", "PicoElements", "Outcomes"],
      "statistical_significance",
      "StatisticalSignificance",
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Outcomes"],
      "effect_size",
      "str",
    ),
    scalarField(
      ["study-design-model", "PicoElements", "Outcomes"],
      "confidence_intervals",
      "str",
    ),
  ],
  "7 fields",
);

const picoElements = classNode(
  ["study-design-model"],
  "PicoElements",
  [population, intervention, comparison, outcomes],
  "4 sections",
);

const qualityIndicators = classNode(
  ["study-design-model"],
  "QualityIndicators",
  [
    scalarField(
      ["study-design-model", "QualityIndicators"],
      "follow_up_duration",
      "str",
    ),
    scalarField(
      ["study-design-model", "QualityIndicators"],
      "loss_to_follow_up",
      "str",
    ),
    enumField(
      ["study-design-model", "QualityIndicators"],
      "intention_to_treat",
      "IntentionToTreat",
    ),
    enumField(
      ["study-design-model", "QualityIndicators"],
      "power_calculation",
      "PowerCalculation",
    ),
    enumField(
      ["study-design-model", "QualityIndicators"],
      "funding_source",
      "FundingSource",
    ),
    enumField(
      ["study-design-model", "QualityIndicators"],
      "conflicts_of_interest",
      "ConflictsOfInterest",
    ),
  ],
  "6 fields",
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
      "List<str>",
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
  subtitle: "4 primary sections",
  children: [studyDesign, picoElements, qualityIndicators, extractionConfidence],
};
