"""
Kerala AI English Coach Statue (FreeLLMAPI Multi-Provider) - Windows Launcher
=============================================================================
1. Prevents Windows PC from sleeping / turning off display (SetThreadExecutionState).
2. Serves the interactive AI English Coach Kiosk + Passkey Admin Page on http://127.0.0.1:8686.
3. Provides a built-in CORS proxy (/api/proxy) for NVIDIA NIM, Groq, Google AI Studio,
   and OpenRouter using Python stdlib (zero external pip dependencies required).
4. Persists multi-provider API keys & router config to local config.json (/api/config).
5. Launches Microsoft Edge in dedicated Desktop App Mode with pre-authorized microphone.
"""

import os
import json
import time
import ctypes
import threading
import subprocess
import urllib.request
import urllib.error
from urllib.parse import urlparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8686
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
if not os.path.exists(WEB_DIR):
    WEB_DIR = BASE_DIR
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

ALLOWED_PROXY_HOSTS = {
    "integrate.api.nvidia.com",
    "api.groq.com",
    "generativelanguage.googleapis.com",
    "openrouter.ai",
}

# Windows Power Management Flags
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_DISPLAY_REQUIRED = 0x00000002


def set_keep_awake():
    """Instruct Windows kernel to prevent system sleep and display timeout."""
    try:
        res = ctypes.windll.kernel32.SetThreadExecutionState(
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
        )
        if res:
            print("[+] Windows Power Management: Always Awake Active")
    except Exception as e:
        print(f"[!] Warning: SetThreadExecutionState: {e}")


def restore_sleep():
    """Restore standard Windows power configuration on exit."""
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
        print("[+] Windows Power Management restored.")
    except Exception:
        pass


class CoachHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        return

    def _send_json(self, status_code, obj):
        raw = json.dumps(obj).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == "/admin":
            self.path = "/admin.html"
            return super().do_GET()

        if self.path == "/api/config":
            if os.path.exists(CONFIG_PATH):
                try:
                    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    return self._send_json(200, data)
                except Exception:
                    pass
            return self._send_json(200, {})

        return super().do_GET()

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_len) if content_len > 0 else b"{}"

        if self.path == "/api/config":
            try:
                data = json.loads(raw_body.decode("utf-8"))
                with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
                return self._send_json(200, {"ok": True})
            except Exception as e:
                return self._send_json(400, {"error": str(e)})

        if self.path == "/api/proxy":
            try:
                req_data = json.loads(raw_body.decode("utf-8"))
                target_url = req_data.get("targetUrl", "")
                req_method = "GET" if req_data.get("method") == "GET" else "POST"
                fwd_headers = req_data.get("headers", {})
                payload = req_data.get("payload", None)

                parsed = urlparse(target_url)
                if parsed.scheme != "https" or parsed.hostname not in ALLOWED_PROXY_HOSTS:
                    return self._send_json(403, {"error": "Target host not allowed"})

                safe_headers = {}
                if req_method == "POST":
                    safe_headers["Content-Type"] = "application/json"
                for k in ("Authorization", "HTTP-Referer", "X-Title"):
                    if k in fwd_headers and fwd_headers[k]:
                        safe_headers[k] = fwd_headers[k]

                up_req = urllib.request.Request(
                    target_url,
                    data=json.dumps(payload).encode("utf-8") if (req_method == "POST" and payload is not None) else None,
                    headers=safe_headers,
                    method=req_method,
                )
                try:
                    with urllib.request.urlopen(up_req, timeout=20) as resp:
                        body = resp.read()
                        self.send_response(resp.status)
                        self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                        self.send_header("Content-Length", str(len(body)))
                        self.end_headers()
                        self.wfile.write(body)
                except urllib.error.HTTPError as he:
                    err_body = he.read()
                    self.send_response(he.code)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(err_body)))
                    self.end_headers()
                    self.wfile.write(err_body)
            except Exception as e:
                return self._send_json(502, {"error": str(e)})
            return

        return self._send_json(404, {"error": "Not found"})


def run_server():
    server_address = ("127.0.0.1", PORT)
    httpd = ThreadingHTTPServer(server_address, CoachHTTPHandler)
    print(f"[+] Kiosk Web Server running at http://127.0.0.1:{PORT}")
    print(f"[+] Passkey Admin Panel: http://127.0.0.1:{PORT}/admin")
    httpd.serve_forever()


def find_edge_path():
    possible_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for p in possible_paths:
        if os.path.exists(p):
            return p
    return None


def launch_kiosk_window():
    edge_exe = find_edge_path()
    target_url = f"http://127.0.0.1:{PORT}/index.html"

    if edge_exe:
        print(f"[+] Launching English Coach Statue App via: {edge_exe}")
        cmd = [
            edge_exe,
            f"--app={target_url}",
            "--start-maximized",
            "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
            "--disable-features=Translate",
        ]
        return subprocess.Popen(cmd)
    else:
        import webbrowser
        webbrowser.open(target_url)
        return None


def main():
    print("=" * 72)
    print("   KERALA AI ENGLISH COACH STATUE (FreeLLMAPI Multi-Provider Router)  ")
    print("=" * 72)

    set_keep_awake()

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    time.sleep(1)

    process = launch_kiosk_window()

    print("\n[OK] English Coach Statue is now active!")
    print("     - Kiosk URL : http://127.0.0.1:8686/")
    print("     - Admin URL : http://127.0.0.1:8686/admin")
    print("     - Supports NVIDIA NIM, Groq, Google AI Studio & OpenRouter (Multi-Key)")
    print("     - Press Ctrl+C in this console to exit.\n")

    try:
        if process:
            while process.poll() is None:
                time.sleep(60)
                set_keep_awake()
        else:
            while True:
                time.sleep(60)
                set_keep_awake()
    except KeyboardInterrupt:
        print("\n[*] Shutting down English Coach Statue...")
    finally:
        restore_sleep()


if __name__ == "__main__":
    main()
