/** District profiles: the Census 2022 series each section shows. Shared by the server
 * functions, the pages and the crawler renderer. */

export const districtSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export type IndicatorUnit = "count" | "percent" | "number" | "persons";

export interface Indicator {
  id: string;
  label: string;
  unit: IndicatorUnit;
  /** Series id used as the denominator when a share is shown. */
  denominator?: string;
  /** Older/variant ids that carry the same indicator in some workbooks. */
  aliases?: string[];
}

export interface Section {
  key: string;
  title: string;
  note: string;
  indicators: Indicator[];
}

export const SECTIONS: Section[] = [
  {
    key: "headline",
    title: "Census 2022 at a glance",
    note: "Population and Housing Census 2022, district headline table (C-01).",
    indicators: [
      { id: "regional.census.population", label: "Population", unit: "count" },
      { id: "regional.census.population.male", label: "Male", unit: "count" },
      { id: "regional.census.population.female", label: "Female", unit: "count" },
      { id: "regional.census.households", label: "Households", unit: "count" },
      { id: "regional.census.sex_ratio", label: "Males per 100 females", unit: "number" },
      { id: "regional.census.c18.average_household_size", label: "Average household size", unit: "persons" },
    ],
  },
  {
    key: "age",
    title: "Age structure",
    note: "Population by five-year age group (C-02). Shares use total population.",
    indicators: [
      { id: "regional.census.c02.age_group_in_years_0_4", label: "0–4", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_5_9", label: "5–9", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_10_14", label: "10–14", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_15_19", label: "15–19", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_20_24", label: "20–24", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_25_29", label: "25–29", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_30_34", label: "30–34", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_35_39", label: "35–39", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_40_44", label: "40–44", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_45_49", label: "45–49", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_50_54", label: "50–54", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_55_59", label: "55–59", unit: "count", denominator: "regional.census.population", aliases: ["regional.census.c02.age_group_in_years_50_59"] },
      { id: "regional.census.c02.age_group_in_years_60_64", label: "60–64", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_65_69", label: "65–69", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_70_74", label: "70–74", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_75_79", label: "75–79", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c02.age_group_in_years_80", label: "80+", unit: "count", denominator: "regional.census.population" },
    ],
  },
  {
    key: "education",
    title: "Education",
    note: "Highest level of education attained, population aged 5 and above (C-06).",
    indicators: [
      { id: "regional.census.c06.highest_level_of_education_attained_play_nursery_kg_pre_primary_student", label: "Play / nursery / KG", unit: "count", denominator: "regional.census.c06.population_number" },
      { id: "regional.census.c06.highest_level_of_education_attained_student_class_i", label: "Student, class I", unit: "count", denominator: "regional.census.c06.population_number" },
      { id: "regional.census.c06.highest_level_of_education_attained_class_i_v", label: "Class I–V", unit: "count", denominator: "regional.census.c06.population_number" },
      { id: "regional.census.c06.highest_level_of_education_attained_class_vi_ix", label: "Class VI–IX", unit: "count", denominator: "regional.census.c06.population_number" },
      { id: "regional.census.c06.highest_level_of_education_attained_ssc_dakhil_o_level_equivalent", label: "SSC / Dakhil / O-level", unit: "count", denominator: "regional.census.c06.population_number" },
      { id: "regional.census.c06.highest_level_of_education_attained_hsc_alim_a_level_equivalent", label: "HSC / Alim / A-level", unit: "count", denominator: "regional.census.c06.population_number" },
      { id: "regional.census.c06.highest_level_of_education_attained_diploma_nursing_midwifery", label: "Diploma / nursing / midwifery", unit: "count", denominator: "regional.census.c06.population_number" },
      { id: "regional.census.c06.highest_level_of_education_attained_graduate_and_above", label: "Graduate and above", unit: "count", denominator: "regional.census.c06.population_number" },
      { id: "regional.census.c06.highest_level_of_education_attained_non_formal_informal_education_and_ot", label: "Non-formal / informal / other", unit: "count", denominator: "regional.census.c06.population_number" },
    ],
  },
  {
    key: "work",
    title: "Work and employment",
    note: "Activity status of the population aged 10 and above (C-08) and employment by sector (C-09).",
    indicators: [
      { id: "regional.census.c08.employed_total", label: "Employed", unit: "count", denominator: "regional.census.c08.population_total" },
      { id: "regional.census.c08.looking_for_work_total", label: "Looking for work", unit: "count", denominator: "regional.census.c08.population_total" },
      { id: "regional.census.c08.household_work_total", label: "Household work", unit: "count", denominator: "regional.census.c08.population_total" },
      { id: "regional.census.c08.do_not_work_total", label: "Do not work", unit: "count", denominator: "regional.census.c08.population_total" },
      { id: "regional.census.c09.agriculture_total", label: "Employed in agriculture", unit: "count" },
      { id: "regional.census.c09.industry_total", label: "Employed in industry", unit: "count" },
      { id: "regional.census.c09.service_total", label: "Employed in services", unit: "count" },
    ],
  },
  {
    key: "housing",
    title: "Housing",
    note: "Structure, drinking water, sanitation and cooking fuel of general households (C-14 to C-17).",
    indicators: [
      { id: "regional.census.c14.type_of_structure_pucca", label: "Pucca structure", unit: "percent" },
      { id: "regional.census.c14.type_of_structure_semi_pucca", label: "Semi-pucca structure", unit: "percent" },
      { id: "regional.census.c14.type_of_structure_kancha", label: "Kancha structure", unit: "percent" },
      { id: "regional.census.c14.type_of_structure_jhupri", label: "Jhupri structure", unit: "percent" },
      { id: "regional.census.c15.source_of_drinking_water_tap_pipe_supply", label: "Tap / piped water", unit: "percent" },
      { id: "regional.census.c15.source_of_drinking_water_tube_well_deep_shallow", label: "Tube-well water", unit: "percent" },
      { id: "regional.census.c16.toilet_facilities_safe_disposal_with_flushing_pouring_water", label: "Safe flushing / pouring toilet", unit: "percent" },
      { id: "regional.census.c16.toilet_facilities_open_defecation_no_latrine_available", label: "Open defecation / no latrine", unit: "percent" },
      { id: "regional.census.c17.source_of_cooking_fuel_supply_gas", label: "Piped (supply) gas", unit: "percent" },
      { id: "regional.census.c17.source_of_cooking_fuel_lp_gas", label: "LP gas", unit: "percent" },
      { id: "regional.census.c17.source_of_cooking_fuel_electricity", label: "Electricity", unit: "percent" },
      { id: "regional.census.c17.source_of_cooking_fuel_wood_chalk_chopped_wood", label: "Wood / chopped wood", unit: "percent" },
    ],
  },
  {
    key: "religion",
    title: "Religion and ethnicity",
    note: "Population by religion (C-03) and ethnic population (C-13).",
    indicators: [
      { id: "regional.census.c03.muslim", label: "Muslim", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c03.hindu", label: "Hindu", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c03.buddhist", label: "Buddhist", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c03.christian", label: "Christian", unit: "count", denominator: "regional.census.population" },
      { id: "regional.census.c13.ethnic_population_total", label: "Ethnic population", unit: "count", denominator: "regional.census.population" },
    ],
  },
  {
    key: "digital",
    title: "Connectivity and finance",
    note: "Internet use, mobile-phone ownership (C-11) and financial accounts (C-12).",
    indicators: [
      { id: "regional.census.c11.internet_user_5_years_and_above", label: "Internet users, age 5+", unit: "percent" },
      { id: "regional.census.c11.population_having_mobile_phone_for_own_use_5_years_and_above", label: "Own a mobile phone, age 5+", unit: "percent" },
      { id: "regional.census.c11.internet_user_15_years_and_above", label: "Internet users, age 15+", unit: "percent" },
      { id: "regional.census.c12.having_account_in_financial_institution_bank_insurance_micro_credit_post", label: "Account in a financial institution", unit: "percent" },
      { id: "regional.census.c12.having_mobile_banking_account_total", label: "Mobile-banking account", unit: "percent" },
    ],
  },
  {
    key: "household-size",
    title: "Household size",
    note: "General households by number of members (C-18).",
    indicators: [
      { id: "regional.census.c18.household_comprising_1_person", label: "1 person", unit: "count", denominator: "regional.census.c18.general_household" },
      { id: "regional.census.c18.household_comprising_2_person", label: "2 people", unit: "count", denominator: "regional.census.c18.general_household" },
      { id: "regional.census.c18.household_comprising_3_person", label: "3 people", unit: "count", denominator: "regional.census.c18.general_household" },
      { id: "regional.census.c18.household_comprising_4_person", label: "4 people", unit: "count", denominator: "regional.census.c18.general_household" },
      { id: "regional.census.c18.household_comprising_5_person", label: "5 people", unit: "count", denominator: "regional.census.c18.general_household" },
      { id: "regional.census.c18.household_comprising_6_person", label: "6 people", unit: "count", denominator: "regional.census.c18.general_household" },
      { id: "regional.census.c18.household_comprising_7_person", label: "7 people", unit: "count", denominator: "regional.census.c18.general_household" },
      { id: "regional.census.c18.household_comprising_8_person", label: "8 people", unit: "count", denominator: "regional.census.c18.general_household" },
      { id: "regional.census.c18.household_comprising_9_person", label: "9 people", unit: "count", denominator: "regional.census.c18.general_household" },
      { id: "regional.census.c18.household_comprising_10_person", label: "10+ people", unit: "count", denominator: "regional.census.c18.general_household" },
    ],
  },
];

export function fmtIndicator(v: number | null | undefined, unit: IndicatorUnit): string {
  if (v == null || Number.isNaN(v)) return "—";
  const n = (x: number, d = 0) => x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
  switch (unit) {
    case "percent":
      return `${n(v, v < 10 ? 2 : 1)}%`;
    case "persons":
      return n(v, 2);
    case "number":
      return n(v, 1);
    default:
      return n(v);
  }
}

export interface RegionalRow {
  series: string;
  date: string;
  value: number | null;
  dims: Record<string, string>;
}

export interface DistrictPayload {
  district: string;
  province: string;
  rows: RegionalRow[];
  province_rows: RegionalRow[];
}

export interface ProfileRow extends Indicator {
  value: number | null;
  share: number | null;
  date: string | null;
}

/** One district's payload (from /v1/regional/district/{name}) -> readable sections. Pure. */
export function assembleProfile(p: DistrictPayload) {
  const lookup = new Map<string, RegionalRow>();
  for (const r of p.rows) {
    if (r.value != null && !lookup.has(r.series)) lookup.set(r.series, r);
  }
  const value = (id: string | undefined) => (id ? (lookup.get(id)?.value ?? null) : null);
  const find = (ind: Indicator) => {
    for (const id of [ind.id, ...(ind.aliases ?? [])]) {
      const row = lookup.get(id);
      if (row) return row;
    }
    return undefined;
  };
  const sections = SECTIONS.map((s) => ({
    ...s,
    rows: s.indicators
      .map((ind) => {
        const row = find(ind);
        const v = row?.value ?? null;
        const denom = value(ind.denominator);
        return {
          ...ind,
          value: v,
          share: v != null && denom ? (v / denom) * 100 : null,
          date: row?.date ?? null,
        } satisfies ProfileRow;
      })
      .filter((r) => r.value != null),
  })).filter((s) => s.rows.length);
  return { name: p.district, province: p.province, sections };
}
