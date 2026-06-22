import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const APP_DATA_NAME = "AbandonStruggleADHD";

export function getAppDataDir() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", APP_DATA_NAME);
  }

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_DATA_NAME);
  }

  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), APP_DATA_NAME);
}

export function getLogsDir() {
  return path.join(getAppDataDir(), "logs");
}

export function getLegacyTasksDbPath() {
  return path.join(process.cwd(), "data", "tasks.db");
}

export function getTasksDbPath() {
  return process.env.TASKS_DB_PATH || path.join(getAppDataDir(), "tasks.db");
}

export function ensureAppDataDirs() {
  fs.mkdirSync(getAppDataDir(), { recursive: true });
  fs.mkdirSync(getLogsDir(), { recursive: true });
}

function hasTasksTable(dbPath: string) {
  if (!fs.existsSync(dbPath)) {
    return false;
  }

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath, { open: true, readOnly: true });
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")
      .get() as { name: string } | undefined;
    return Boolean(row);
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

function copySqliteFileSet(sourcePath: string, targetPath: string) {
  for (const suffix of ["", "-wal", "-shm"]) {
    const targetSidecar = `${targetPath}${suffix}`;
    if (fs.existsSync(targetSidecar)) {
      fs.unlinkSync(targetSidecar);
    }
  }

  fs.copyFileSync(sourcePath, targetPath);

  for (const suffix of ["-wal", "-shm"]) {
    const sourceSidecar = `${sourcePath}${suffix}`;
    if (fs.existsSync(sourceSidecar)) {
      fs.copyFileSync(sourceSidecar, `${targetPath}${suffix}`);
    }
  }
}

export function ensureTasksDbLocation() {
  ensureAppDataDirs();

  const nextPath = getTasksDbPath();
  const nextDir = path.dirname(nextPath);
  fs.mkdirSync(nextDir, { recursive: true });

  const legacyPath = getLegacyTasksDbPath();
  if (!hasTasksTable(nextPath) && fs.existsSync(legacyPath)) {
    copySqliteFileSet(legacyPath, nextPath);
  }

  return nextPath;
}
