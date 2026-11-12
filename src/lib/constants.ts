/**
 * Maximum length of the Chassis Number (VIN) field on the inventory and quick
 * sale forms. Kept at 11 to match how the chassis number is written on the
 * stock records here.
 */
export const VIN_MAX_LENGTH = 11;

/**
 * Full 17-character VIN, used wherever the complete manufacturer number is
 * quoted or signed for: the Proforma Invoice, the Vehicle Sales Agreement and
 * the Vehicle Display / Consignment Agreement. These are documents a customer
 * keeps, so the chassis number on them has to be the whole one.
 */
export const VIN_FULL_LENGTH = 17;
