import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const APP_DATA_NAME = "AbandonStruggleADHD";
const LABEL = "com.abandon-struggle-adhd.web";
const PLIST_NAME = `${LABEL}.plist`;
const DEFAULT_PORT = "3000";
const command = process.argv[2] || "status";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const domain = `gui/${process.getuid?.() ?? os.userInfo().uid}`;
const serviceTarget = `${domain}/${LABEL}`;

function getAppDataDir() {
  return path.join(os.homedir(), "Library", "Application Support", APP_DATA_NAME);
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

function runLaunchctl(args, quiet = false) {
  return spawnSync("launchctl", args, {
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit"
  });
}

function ensureSupported() {
  if (process.platform !== "darwin") {
    console.error("网页后台服务目前只支持 macOS launchd。");
    process.exitCode = 1;
    return false;
  }
  return true;
}

function buildPlist() {
  const logsDir = getLogsDir();
  const port = process.env.PORT || DEFAULT_PORT;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${plistEscape(process.execPath)}</string>
    <string>${plistEscape(nextBin)}</string>
    <string>start</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>${plistEscape(port)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${plistEscape(projectRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${plistEscape(path.join(logsDir, "web.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${plistEscape(path.join(logsDir, "web.err.log"))}</string>
</dict>
</plist>
`;
}

function stopLoadedService() {
  runLaunchctl(["bootout", serviceTarget], true);
}

function install() {
  if (!ensureSupported()) return;

  const buildIdPath = path.join(projectRoot, ".next", "BUILD_ID");
  if (!fs.existsSync(buildIdPath)) {
    console.error("没有找到生产构建，请先运行 npm run build。");
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(getLaunchAgentsDir(), { recursive: true });
  fs.mkdirSync(getLogsDir(), { recursive: true });

  const plistPath = getPlistPath();
  fs.writeFileSync(plistPath, buildPlist(), "utf8");
  stopLoadedService();

  const result = runLaunchctl(["bootstrap", domain, plistPath]);
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    return;
  }

  runLaunchctl(["kickstart", "-k", serviceTarget]);
  console.log(`网页后台服务已安装：http://localhost:${process.env.PORT || DEFAULT_PORT}`);
  console.log(`日志目录：${getLogsDir()}`);
}

function uninstall() {
  if (!ensureSupported()) return;

  const plistPath = getPlistPath();
  stopLoadedService();
  if (fs.existsSync(plistPath)) {
    fs.unlinkSync(plistPath);
  }
  console.log(`网页后台服务已移除：${plistPath}`);
}

function restart() {
  if (!ensureSupported()) return;

  const result = runLaunchctl(["kickstart", "-k", serviceTarget]);
  if (result.status !== 0) {
    console.error("服务尚未安装，请先运行 npm run web:install。");
    process.exitCode = result.status || 1;
    return;
  }
  console.log("网页后台服务已重启。");
}

function status() {
  if (!ensureSupported()) return;

  const plistPath = getPlistPath();
  const result = runLaunchctl(["print", serviceTarget], true);
  console.log(`plist：${plistPath}`);
  console.log(`已安装：${fs.existsSync(plistPath) ? "是" : "否"}`);
  console.log(`正在运行：${result.status === 0 ? "是" : "否"}`);

  if (result.status === 0) {
    const pid = result.stdout.match(/\bpid = (\d+)/)?.[1];
    if (pid) console.log(`PID：${pid}`);
  }
  console.log(`日志目录：${getLogsDir()}`);
}

if (command === "install") {
  install();
} else if (command === "uninstall") {
  uninstall();
} else if (command === "restart") {
  restart();
} else if (command === "status") {
  status();
} else {
  console.error(`未知命令：${command}`);
  process.exitCode = 1;
}
