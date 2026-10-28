import { requireTestDatabaseUrl } from "./database";

// Every integration test file must pass this guard before importing a driver.
requireTestDatabaseUrl(process.env);
