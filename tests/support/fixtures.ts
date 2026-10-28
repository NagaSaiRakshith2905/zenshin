import { testDatabaseName } from "./database";

// Fresh values per test; never load .env.local or share a production fixture.
export function environmentFixture(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "test",
    APP_ENV: "development",
    APP_ORIGIN: "http://localhost:3000",
    TEST_DATABASE_URL: `postgresql://test:test@127.0.0.1:5432/${testDatabaseName()}`,
    ...overrides,
  };
}
