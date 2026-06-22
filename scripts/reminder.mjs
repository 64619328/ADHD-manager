import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const APP_DATA_NAME = "AbandonStruggleADHD";
const HOUR_MS = 60 * 60 * 1000;
const dryRun = process.argv.includes("--dry-run");

function getAppDataDir() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", APP_DATA_NAME);
  }

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_DATA_NAME);
  }

  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), APP_DATA_NAME);
}

function getLogsDir() {
  return path.join(getAppDataDir(), "logs");
}

function getTasksDbPath() {
  return process.env.TASKS_DB_PATH || path.join(getAppDataDir(), "tasks.db");
}

function getLegacyTasksDbPath() {
  return path.join(process.cwd(), "data", "tasks.db");
}

function ensureTasksDbLocation() {
  fs.mkdirSync(getAppDataDir(), { recursive: true });
  fs.mkdirSync(getLogsDir(), { recursive: true });

  const nextPath = getTasksDbPath();
  fs.mkdirSync(path.dirname(nextPath), { recursive: true });

  const legacyPath = getLegacyTasksDbPath();
  if (!hasTasksTable(nextPath) && fs.existsSync(legacyPath)) {
    copySqliteFileSet(legacyPath, nextPath);
  }

  return nextPath;
}

function hasTasksTable(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return false;
  }

  let db = null;
  try {
    db = new DatabaseSync(dbPath, { open: true, readOnly: true });
    return Boolean(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get()
    );
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

function copySqliteFileSet(sourcePath, targetPath) {
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

function parseDeadline(value) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(String(value).replace(" ", "T")).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function buildReminder(task, now = Date.now()) {
  const deadline = parseDeadline(task.deadline_at);
  if (!deadline) {
    return null;
  }

  const remaining = deadline - now;
  if (remaining <= 0 || remaining > 3 * HOUR_MS) {
    return null;
  }

  const hours = Math.max(1, Math.ceil(remaining / HOUR_MS));
  return `亲爱的～快来看看 【${task.goal}】 这个任务，距离ddl不足 ${hours} 个小时了哟～`;
}

function notify(message) {
  if (dryRun || process.platform !== "darwin") {
    console.log(message);
    return;
  }

  execFileSync("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "DDL 提醒"`], {
    stdio: "ignore"
  });
  console.log(message);
}

function main() {
  const dbPath = ensureTasksDbLocation();

  if (!fs.existsSync(dbPath)) {
    console.log(`数据库不存在：${dbPath}`);
    return;
  }

  const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
  try {
    const hasTasks = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get();
    if (!hasTasks) {
      console.log("暂无需要提醒的任务");
      return;
    }

    const tasks = db
      .prepare(
        `
          SELECT id, goal, deadline_at
          FROM tasks
          WHERE priority = 'P0'
            AND status != '已完成'
            AND deadline_at IS NOT NULL
        `
      )
      .all();

    const messages = tasks.map((task) => buildReminder(task)).filter(Boolean);

    if (messages.length === 0) {
      console.log("暂无需要提醒的任务");
      return;
    }

    messages.forEach((message) => notify(message));
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
