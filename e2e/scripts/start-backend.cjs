/**
 * E2E 用にバックエンド(FastAPI)を起動するヘルパー。
 * - 毎回まっさらな SQLite のテスト用 DB を使う(前回のデータが残らない)。
 * - venv の python を自動検出して uvicorn を起動する。
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const backendDir = path.resolve(__dirname, "..", "..", "backend");
const dbPath = path.join(__dirname, "..", ".e2e", "e2e.db");
const dbDir = path.dirname(dbPath);

// 前回のテストDBを消して、毎回クリーンな状態から始める
fs.rmSync(dbDir, { recursive: true, force: true });
fs.mkdirSync(dbDir, { recursive: true });

// venv の python を探す(Windows / macOS・Linux 両対応)
const candidates = [
  path.join(backendDir, ".venv", "Scripts", "python.exe"), // Windows
  path.join(backendDir, ".venv", "bin", "python"), // macOS / Linux
  "python",
];
const python = candidates.find((p) => p === "python" || fs.existsSync(p));
if (!python) {
  console.error("python が見つかりません。backend の venv を作成してください。");
  process.exit(1);
}

const child = spawn(
  python,
  ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
  {
    cwd: backendDir,
    env: {
      ...process.env,
      DATABASE_URL: `sqlite:///${dbPath}`,
      SECRET_KEY: "e2e-secret-key-for-playwright-at-least-32-bytes",
    },
    stdio: "inherit",
  },
);

child.on("error", (err) => {
  console.error("uvicorn の起動に失敗しました:", err);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
