import { runBackup } from "./recovery/backup";
import { recordBackupFailure, sendBackupAlert } from "./recovery/monitor";
try { await runBackup(); }
catch {
  console.error(JSON.stringify({ event: "backup.failed", message: "Backup did not complete. Check runner configuration and provider access." }));
  try { await recordBackupFailure(); } catch { console.error(JSON.stringify({ event: "backup.failure_record_failed" })); }
  try { await sendBackupAlert("Zenshin backup failed", "The independent backup runner failed. The last complete backup pointer was not advanced. Check backup age and runner/provider configuration."); }
  catch { console.error(JSON.stringify({ event: "backup.alert_failed" })); }
  process.exitCode = 1;
}
