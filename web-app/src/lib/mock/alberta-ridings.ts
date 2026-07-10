/**
 * Curated 12-riding demo set (scaled down from the full Elections Alberta 2019
 * boundaries) — run `node scripts/generate-alberta-ridings.mjs` to regenerate.
 *
 * Invariants the demo relies on:
 *   - Exactly 12 ridings, each with a unique MLA name and official seat handle.
 *   - The Premier seat (ab-premier) is separate from the Calgary-Lougheed MLA seat.
 *   - Ridings referenced elsewhere in the corpus stay present so no district,
 *     profile, or persona link dangles: edmonton-strathcona, edmonton-city-centre,
 *     calgary-elbow, calgary-mountain-view, calgary-forest-lawn.
 */
import type { AlbertaRiding } from "./types";

export const ALBERTA_RIDINGS: AlbertaRiding[] = [
  {
    "name": "Banff-Kananaskis",
    "slug": "banff-kananaskis",
    "mla": {
      "name": "Priya Wilson",
      "handle": "banffkananaskmla",
      "seatHandle": "ab-ban_kanns"
    }
  },
  {
    "name": "Calgary-Bow",
    "slug": "calgary-bow",
    "mla": {
      "name": "Rosa Whitecloud",
      "handle": "calgarybowmla",
      "seatHandle": "ab-cal_bow"
    }
  },
  {
    "name": "Calgary-Elbow",
    "slug": "calgary-elbow",
    "mla": {
      "name": "Tom Berg",
      "handle": "tomberg",
      "seatHandle": "ab-cal_elb"
    }
  },
  {
    "name": "Calgary-Forest Lawn",
    "slug": "calgary-forest-lawn",
    "mla": {
      "name": "Nadia Rees",
      "handle": "calgaryforestmla",
      "seatHandle": "ab-cal_for_lawn"
    }
  },
  {
    "name": "Calgary-Lougheed",
    "slug": "calgary-lougheed",
    "mla": {
      "name": "Hon. A. Premier",
      "handle": "premier",
      "seatHandle": "ab-cal_lough"
    }
  },
  {
    "name": "Calgary-Mountain View",
    "slug": "calgary-mountain-view",
    "mla": {
      "name": "Joss Ferns",
      "handle": "jossferns",
      "seatHandle": "ab-cal_mou_view"
    }
  },
  {
    "name": "Edmonton-City Centre",
    "slug": "edmonton-city-centre",
    "mla": {
      "name": "Lena Park",
      "handle": "lenapark",
      "seatHandle": "ab-edm_city_cen"
    }
  },
  {
    "name": "Edmonton-Glenora",
    "slug": "edmonton-glenora",
    "mla": {
      "name": "Lucas Driver",
      "handle": "edmontonglenomla",
      "seatHandle": "ab-edm_gle"
    }
  },
  {
    "name": "Edmonton-Strathcona",
    "slug": "edmonton-strathcona",
    "mla": {
      "name": "Rae Nguyen",
      "handle": "raenguyen",
      "seatHandle": "ab-edm_strth"
    }
  },
  {
    "name": "Grande Prairie",
    "slug": "grande-prairie",
    "mla": {
      "name": "Joss Hall",
      "handle": "grandeprairiemla",
      "seatHandle": "ab-gra_pra"
    }
  },
  {
    "name": "Lethbridge-West",
    "slug": "lethbridge-west",
    "mla": {
      "name": "Finley Nguyen",
      "handle": "lethbridgewesmla",
      "seatHandle": "ab-let_west"
    }
  },
  {
    "name": "Red Deer-South",
    "slug": "red-deer-south",
    "mla": {
      "name": "Owen Rivera",
      "handle": "reddeersouthmla",
      "seatHandle": "ab-red_deer_sou"
    }
  }
];
