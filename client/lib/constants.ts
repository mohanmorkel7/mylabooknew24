export const VC_TYPES = [
  { value: "early_stage", label: "Early Stage" },
  { value: "accelerator", label: "Accelerator" },
  { value: "growth", label: "Growth" },
  { value: "strategic_bank", label: "Strategic - Bank" },
  { value: "strategic_fintech", label: "Strategic - Fintech" },
  { value: "strategic_individual", label: "Strategic - Individual" },
  { value: "angel", label: "Angel" },
];

export const SECTOR_FOCUS = [
  { value: "fintech", label: "Fintech" },
  { value: "fintech_b2b", label: "Fintech -B2B" },
  { value: "fintech_saas", label: "Fintech - SaaS" },
  { value: "fintech_infrastructure", label: "Fintech - Infrastructure" },
  { value: "sector_agnostic", label: "Sector Agnostic" },
];

const SECTOR_FOCUS_MAP = new Map(SECTOR_FOCUS.map((s) => [s.value, s.label]));

export function getSectorLabel(value?: string | null): string {
  if (!value) return "";
  const key = value.trim();
  const mapped = SECTOR_FOCUS_MAP.get(key);
  if (mapped) return mapped;
  const prettified = key
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return prettified;
}
