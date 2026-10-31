import { backupClients, createBackupStore } from "./recovery/store";
import { monitorBackups, sendBackupAlert } from "./recovery/monitor";
try {
  const status = await monitorBackups(createBackupStore(backupClients(process.env)), sendBackupAlert);
  if (status.state !== "healthy" || status.failed) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ event: "backup.monitor_failed" }));
  try { await sendBackupAlert("Zenshin backup monitor failed", "The independent monitor could not verify backup age. Check destination access and monitor configuration."); } catch { console.error(JSON.stringify({ event: "backup.alert_failed" })); }
  process.exitCode = 1;
}
