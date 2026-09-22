"""Test the production launchers and proxy using an isolated database (Windows).

Run: backend/.venv/Scripts/python.exe deploy/windows/smoke_test.py
Builds an isolated frontend. Ports 13000 and 18000 must be free.
No Cloudflare credentials are required.
"""

import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.parse import urlparse

import httpx

ROOT = Path(__file__).resolve().parents[2]
PUBLIC_HOST = "coredesk.shinobuabe.com"


def main():
    for port in (13000, 18000):
        with socket.socket() as sock:
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                raise RuntimeError(f"Port {port} is already in use; stop that server first.")

    command = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
               "-File", str(ROOT / "deploy/windows/coredesk.ps1")]
    options = ["-BackendPort", "18000", "-FrontendPort", "13000",
               "-BuildDirectory", ".next-tunnel-smoke"]
    subprocess.run([*command, "Build", *options], cwd=ROOT, check=True,
                   creationflags=subprocess.CREATE_NO_WINDOW)

    with tempfile.TemporaryDirectory(prefix="coredesk-tunnel-") as temporary:
        env = os.environ.copy()
        env["DATABASE_URL"] = f"sqlite:///{Path(temporary).as_posix()}/test.db"
        env["SECRET_KEY"] = "isolated-tunnel-smoke-test-key-at-least-32-characters"
        env["COOKIE_NAME"] = "access_token"
        processes = []
        logs = []
        try:
            for action in ("Backend", "Frontend"):
                log = open(Path(temporary) / f"{action}.log", "w+", encoding="utf-8", errors="replace")
                logs.append(log)
                processes.append(subprocess.Popen(
                    [*command, action, *options],
                    cwd=ROOT, env=env, stdout=log, stderr=log,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                ))

            with httpx.Client(base_url="http://127.0.0.1:13000", timeout=20, headers={
                "host": PUBLIC_HOST,
                "x-forwarded-host": PUBLIC_HOST,
                "x-forwarded-proto": "https",
            }) as client:
                deadline = time.monotonic() + 60
                while True:
                    if any(p.poll() is not None for p in processes):
                        raise RuntimeError("A server exited during startup")
                    try:
                        if client.get("/api/health").status_code == 200:
                            break
                    except httpx.TransportError:
                        pass
                    if time.monotonic() > deadline:
                        raise RuntimeError("Servers did not become ready")
                    time.sleep(0.5)

                assert client.get("/login").status_code == 200
                guard = client.get("/dashboard")
                assert guard.status_code in (302, 307)
                location = guard.headers["location"]
                target = urlparse(location)
                assert target.path == "/login"
                assert not target.netloc or (target.netloc == PUBLIC_HOST and target.scheme == "https"), location
                assert client.get("/api/auth/me").status_code == 401

                account = {"email": "tunnel-test@example.com", "name": "Tunnel test",
                           "password": "isolated-password-123", "department": "Test"}
                response = client.post("/api/auth/register", json=account)
                assert response.status_code == 201, response.status_code
                cookie = response.headers["set-cookie"]
                assert "Secure" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
                # Emulate the browser's HTTPS Cookie being forwarded over local HTTP.
                client.headers["cookie"] = cookie.split(";", 1)[0]
                assert client.get("/api/auth/me").status_code == 200
                for path in ("", "/todos", "/schedule", "/notices", "/office", "/settings"):
                    assert client.get(f"/dashboard{path}").status_code == 200, path
                response = client.post("/api/auth/register", json={**account, "email": "second@example.com"})
                assert response.status_code == 403
                assert client.post("/api/auth/logout").status_code == 204
                del client.headers["cookie"]
                client.cookies.clear()
                assert client.get("/api/auth/me").status_code == 401
                response = client.post("/api/auth/login", json=account)
                assert response.status_code == 200
                assert "Secure" in response.headers["set-cookie"]
                print("PASS: proxy, public redirect, Secure Cookie, authenticated pages, registration policy, logout/login")
        except Exception:
            for log in logs:
                log.flush()
                log.seek(0)
                print(log.read())
            raise
        finally:
            for process in reversed(processes):
                if process.poll() is None:
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                                   check=True, stdout=subprocess.DEVNULL)
                process.wait(timeout=10)
            for log in logs:
                log.close()


if __name__ == "__main__":
    main()
