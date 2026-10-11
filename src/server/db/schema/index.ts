/**
 * Drizzle schema barrel (docs/DATABASE_DESIGN.md). drizzle-kit reads this file to generate SQL
 * migrations into db/migrations; Better Auth's adapter and the app's queries import from here.
 */
export * from "./auth";
export * from "./campus";
export * from "./cart";
export * from "./catalog";
export * from "./delivery";
export * from "./engagement";
export * from "./enums";
export * from "./operations";
export * from "./orders";
export * from "./profiles";
