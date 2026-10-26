"""PoC: hooks モジュールの子プロセスへ届く PATH の出所と、env を起動できない状態の作り方を観測する"""

from __future__ import annotations

import json
import os
import shlex
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests" / "e2e"))

from support.harness import (  # noqa: E402
    MODEL,
    REFERENCE_NAME,
    REFERENCE_VALUE,
    STARTUP_TIMEOUT_SEC,
    ClaudeSession,
    read_prompt,
)

POC_PLUGIN_DIR = Path(__file__).resolve().parent / "plugin"
POC_PREFIX = "POC_"
RUNS_PER_CASE = 3


def _start(session: ClaudeSession, *, path: str | None) -> None:
    """claude を起動する。path はコマンドの文字列の頭の PATH= で渡す（tmux の -e PATH= は使わない）"""
    claude = str(shutil.which("claude"))
    session._prepare_config_dir()
    command = f"{claude} --plugin-dir {shlex.quote(str(POC_PLUGIN_DIR))} --model {MODEL}"
    # path の指定があるときだけ、claude を起動するシェルで PATH を差し替える
    if path is not None:
        command = f"PATH={shlex.quote(path)} {command}"
    session._tmux(
        "new-session", "-d", "-s", session.tmux_name, "-x", "200", "-y", "50", "-c", str(session.project_dir),
        "-e", f"CLAUDE_CONFIG_DIR={session.config_dir}",
        "-e", f"HOME={os.environ['HOME']}",
        "-e", f"{REFERENCE_NAME}={REFERENCE_VALUE}",
        command,
    )


def _claude_path(session: ClaudeSession) -> str:
    """tmux のペインで動く claude のプロセスの環境から PATH を読む"""
    pid = session._tmux("display-message", "-p", "-t", session.tmux_name, "#{pane_pid}").strip()
    environ = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
    comm = Path(f"/proc/{pid}/comm").read_text().strip()
    path = next((entry.decode() for entry in environ if entry.startswith(b"PATH=")), "(PATH なし)")
    return f"pid={pid} comm={comm} {path}"


def run_case(name: str, *, path: str | None, settings_path: str | None) -> dict[str, object]:
    """1 回の起動で、claude の PATH・入力を受け付けたか・子プロセスの観測を記録する"""
    session = ClaudeSession()
    record: dict[str, object] = {"case": name}
    try:
        settings: dict[str, object] = {"permissions": {"allow": ["Read"]}}
        # settings.json の env.PATH を仕込むケース
        if settings_path is not None:
            settings["env"] = {"PATH": settings_path}
        (session.config_dir / "settings.json").write_text(json.dumps(settings), encoding="utf-8")
        note = session.project_dir / "note.txt"
        session.write_file(note, "PoC の本文です。\n")

        _start(session, path=None if path is None else path.replace("{empty}", str(session.empty_bin_dir)))
        try:
            session._wait_for_prompt(STARTUP_TIMEOUT_SEC)
            record["prompt_ready"] = True
        except TimeoutError as error:
            record["prompt_ready"] = False
            record["pane"] = str(error)[-600:]
            return record
        record["claude_path"] = _claude_path(session)

        result = session.submit(read_prompt(note))
        record["observed"] = [line for text in result.contexts for line in text.splitlines() if line.startswith(POC_PREFIX)]
        return record
    finally:
        session.close()


def main() -> None:
    """仕込みを使わないケースと、空の PATH で起動するケースを流して JSON Lines で出す"""
    cases = [("control", None, None)] + [(f"empty-path-{index + 1}", "{empty}", None) for index in range(RUNS_PER_CASE)]
    # 引数 settings を渡したときだけ、settings.json の env.PATH も空にするケースを加える
    if "settings" in sys.argv[1:]:
        cases = [(f"empty-path-and-settings-{index + 1}", "{empty}", "/nonexistent-poc-bin") for index in range(RUNS_PER_CASE)]
    for name, path, settings_path in cases:
        print(json.dumps(run_case(name, path=path, settings_path=settings_path), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
