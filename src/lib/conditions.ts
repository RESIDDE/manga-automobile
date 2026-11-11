/**
 * The conditions a vehicle can be recorded in. "Damaged" was retired: older
 * records that still carry it are shown as they are but can't be chosen again.
 */
export const VEHICLE_CONDITIONS = ["New", "Foreign Used", "Used"] as const;
export type VehicleCondition = (typeof VEHICLE_CONDITIONS)[number];
