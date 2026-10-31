/**
 * The BanglaDataHub grocery basket — mirrors GROCERY_BASKET in
 * ingestion/jobs/derive_indicators.py (keep the two in step). Quantities are in each
 * item's SPI unit; `per` is how BBS prices it.
 */
export const BASKET = [
  { id: "commodities.wheat_flour", name: "Wheat flour", qty: 2, per: "20-kg bag" },
  { id: "commodities.rice_basmati", name: "Basmati rice (broken)", qty: 5, per: "kg" },
  { id: "commodities.pulse_masoor", name: "Masoor pulse", qty: 1, per: "kg" },
  { id: "commodities.pulse_gram", name: "Gram pulse", qty: 1, per: "kg" },
  { id: "commodities.vegetable_ghee_tin", name: "Vegetable ghee", qty: 2, per: "2.5-kg tin" },
  { id: "commodities.sugar", name: "Sugar", qty: 4, per: "kg" },
  { id: "commodities.milk_fresh", name: "Fresh milk", qty: 30, per: "litre" },
  { id: "commodities.eggs", name: "Eggs", qty: 2, per: "dozen" },
  { id: "commodities.chicken", name: "Chicken (live broiler)", qty: 4, per: "kg" },
  { id: "commodities.potatoes", name: "Potatoes", qty: 5, per: "kg" },
  { id: "commodities.onions", name: "Onions", qty: 4, per: "kg" },
  { id: "commodities.tomatoes", name: "Tomatoes", qty: 3, per: "kg" },
  { id: "commodities.tea_packet", name: "Tea", qty: 2, per: "190-g pack" },
  { id: "commodities.salt", name: "Salt", qty: 1, per: "800-g pack" },
] as const;
