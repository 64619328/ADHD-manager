import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const APP_DATA_NAME = "AbandonStruggleADHD";
const LABEL = "com.abandon-struggle-adhd.reminder";
const PLIST_NAME = `${LABEL}.plist`;
const command = process.argv[2] || "status";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const reminderScript = path.join(scriptDir, "reminder.mjs");

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

function getLaunchAgentsDir() {
  return path.join(os.homedir(), "Library", "LaunchAgents");
}

function getPlistPath() {
  return path.join(getLaunchAgentsDir(), PLIST_NAME);
}

function plistEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function runLaunchctl(args, options = {}) {
  return spawnSync("launchctl", args, {
    encoding: "utf8",
    stdio: options.quiet ? "pipe" : "inherit"
  });
}

function buildPlist() {
  const logsDir = getLogsDir();
  const envBlock = process.env.TASKS_DB_PATH
    ? `
  <key>EnvironmentVariables</key>
  <dict>
    <key>TASKS_DB_PATH</key>
    <string>${plistEscape(process.env.TASKS_DB_PATH)}</string>
  </dict>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${plistEscape(process.execPath)}</string>
    <string>${plistEscape(reminderScript)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${plistEscape(projectRoot)}</string>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${plistEscape(path.join(logsDir, "reminder.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${plistEscape(path.join(logsDir, "reminder.err.log"))}</string>${envBlock}
</dict>
</plist>
`;
}

function install() {
  if (process.platform !== "darwin") {
    console.log("launchd 提醒服务只支持 macOS。");
    return;
  }

  fs.mkdirSync(getLaunchAgentsDir(), { recursive: true });
  fs.mkdirSync(getLogsDir(), { recursive: true });

  const plistPath = getPlistPath();
  fs.writeFileSync(plistPath, buildPlist(), "utf8");

  runLaunchctl(["unload", plistPath], { quiet: true });
  const result = runLaunchctl(["load", plistPath]);
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    return;
  }

  console.log(`已安装每小时提醒服务：${plistPath}`);
  console.log(`日志目录：${getLogsDir()}`);
}

function uninstall() {
  if (process.platform !== "darwin") {
    console.log("launchd 提醒服务只支持 macOS。");
    return;
  }

  const plistPath = getPlistPath();
  runLaunchctl(["unload", plistPath], { quiet: true });

  if (fs.existsSync(plistPath)) {
    fs.unlinkSync(plistPath);
  }

  console.log(`已移除每小时提醒服务：${plistPath}`);
}

function status() {
  if (process.platform !== "darwin") {
    console.log("launchd 提醒服务只支持 macOS。");
    return;
  }

  const plistPath = getPlistPath();
  const list = runLaunchctl(["list"], { quiet: true });
  const loadedLine = list.stdout
    ?.split("\n")
    .find((line) => line.includes(LABEL));

  console.log(`plist：${plistPath}`);
  console.log(`已安装：${fs.existsSync(plistPath) ? "是" : "否"}`);
  console.log(`已加载：${loadedLine ? "是" : "否"}`);
  if (loadedLine) {
    console.log(loadedLine.trim());
  }
}

if (command === "install") {
  install();
} else if (command === "uninstall") {
  uninstall();
} else if (command === "status") {
  status();
} else {
  console.error(`未知命令：${command}`);
  process.exitCode = 1;
}
