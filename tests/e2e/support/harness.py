"""E2E テストの共通の補助。tmux で実際の Claude Code を起動し、入力の送信とモデルに届いた文脈の読み取りを行う"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import unittest
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

PLUGIN_DIR = Path(os.environ.get("ALIAS_INJECT_E2E_PLUGIN_DIR", Path(__file__).resolve().parents[3]))
SOURCE_CONFIG_DIR = Path(
    os.environ.get("ALIAS_INJECT_E2E_SOURCE_CONFIG_DIR")
    or os.environ.get("CLAUDE_CONFIG_DIR")
    or Path.home() / ".claude"
)
MODEL = os.environ.get("ALIAS_INJECT_E2E_MODEL", "haiku")

STARTUP_TIMEOUT_SEC = 90
TURN_TIMEOUT_SEC = 180
COMPACT_TIMEOUT_SEC = 240
POLL_INTERVAL_SEC = 0.5
CLEAR_SETTLE_SEC = 5

HEADING = "この発言に出る用語"
# モデルがツールを使って止まらないよう、入力の末尾に付ける
ANSWER_BRIEFLY = "ツールは使わず、一言で答えて。"


@dataclass
class Submission:
    """1 回の入力の結果"""

    # transcript に残った、送信した入力の文
    sent: str | None
    # モデルへの入力に追加された文脈（hook_additional_context の添付の本文）
    contexts: list[str]
    # この入力の間に transcript へ増えた行
    lines: list[dict[str, Any]] = field(default_factory=list)

    @property
    def context_text(self) -> str:
        return "\n".join(self.contexts)


def _user_text(line: dict[str, Any]) -> str | None:
    """transcript の user の行から入力の文を取り出す"""
    if line.get("type") != "user" or line.get("isMeta") or line.get("isCompactSummary"):
        return None
    content = (line.get("message") or {}).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = [part.get("text", "") for part in content if isinstance(part, dict) and part.get("type") == "text"]
        return "".join(texts) or None
    return None


def _context_of(line: dict[str, Any]) -> str | None:
    """transcript の添付の行から追加された文脈を取り出す"""
    attachment = line.get("attachment")
    if line.get("type") != "attachment" or not isinstance(attachment, dict):
        return None
    if attachment.get("type") != "hook_additional_context":
        return None
    content = attachment.get("content")
    return "\n".join(content) if isinstance(content, list) else str(content)


def is_turn_end(line: dict[str, Any]) -> bool:
    """モデルの返事が終わった行か"""
    return line.get("type") == "assistant" and (line.get("message") or {}).get("stop_reason") == "end_turn"


def is_compact_boundary(line: dict[str, Any]) -> bool:
    """会話の圧縮が終わった行か"""
    return line.get("type") == "system" and line.get("subtype") == "compact_boundary"


class ClaudeSession:
    """一時の CLAUDE_CONFIG_DIR とプロジェクトで、tmux 上の Claude Code を 1 つ動かす"""

    def __init__(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="alias-inject-e2e-"))
        self.config_dir = self.root / "claude-config"
        self.project_dir = self.root / "project"
        # 端末の設定ファイルのフォルダ。設定ファイルの aliases の相対パスはここから解決される
        self.alias_dir = self.root / "alias-inject"
        self.urls_dir = self.alias_dir / "urls"
        self.config_path = self.alias_dir / "settings.yaml"
        # 読むリポジトリのフォルダ。dev-docs.yaml の aliases の相対パスはここから解決される
        self.repo_dir = self.root / "knowledge"
        self.terms_dir = self.repo_dir / "terms"
        self.dev_docs_path = self.repo_dir / "dev-docs.yaml"
        self.tmux_name = f"alias-inject-e2e-{os.getpid()}-{uuid.uuid4().hex[:6]}"
        self._seen: dict[Path, int] = {}
        self._clock = time.time()
        for folder in (self.config_dir, self.project_dir, self.terms_dir, self.urls_dir):
            folder.mkdir(parents=True)

    # ---- 準備 ----

    def write_user_settings(self, config_path: Path | None) -> None:
        """ユーザースコープの settings.json の env に ALIAS_INJECT_CONFIG を置く（None なら env を置かない）"""
        settings: dict[str, Any] = {}
        if config_path is not None:
            settings["env"] = {"ALIAS_INJECT_CONFIG": str(config_path)}
        (self.config_dir / "settings.json").write_text(json.dumps(settings), encoding="utf-8")

    def write_file(self, path: Path, text: str) -> None:
        """ファイルを書く。更新時刻は必ず前より進める（読み直しの判定が更新時刻だけのため）"""
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        self._clock += 2
        os.utime(path, (self._clock, self._clock))

    def _prepare_config_dir(self) -> None:
        credentials = SOURCE_CONFIG_DIR / ".credentials.json"
        if not credentials.is_file():
            raise RuntimeError(f"認証情報がありません: {credentials}（ALIAS_INJECT_E2E_SOURCE_CONFIG_DIR で指定する）")
        # 認証情報は複製せずリンクにする（更新されたトークンが元のファイルに書かれる）
        link = self.config_dir / ".credentials.json"
        if not link.exists():
            link.symlink_to(credentials)
        state = {
            "hasCompletedOnboarding": True,
            "theme": "dark",
            "projects": {str(self.project_dir): {"hasTrustDialogAccepted": True}},
        }
        (self.config_dir / ".claude.json").write_text(json.dumps(state), encoding="utf-8")

    # ---- tmux ----

    def _tmux(self, *args: str) -> str:
        result = subprocess.run(["tmux", *args], capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise RuntimeError(f"tmux {' '.join(args)} が失敗しました: {result.stderr.strip()}")
        return result.stdout

    def pane(self) -> str:
        return self._tmux("capture-pane", "-p", "-t", self.tmux_name)

    def start(self) -> None:
        """Claude Code を起動し、入力を受け付ける状態まで待つ"""
        for tool in ("tmux", "claude"):
            if shutil.which(tool) is None:
                raise RuntimeError(f"{tool} が PATH にありません")
        self._prepare_config_dir()
        self._tmux(
            "new-session", "-d", "-s", self.tmux_name, "-x", "200", "-y", "50", "-c", str(self.project_dir),
            "-e", f"CLAUDE_CONFIG_DIR={self.config_dir}",
            "-e", f"HOME={os.environ['HOME']}",
            "-e", f"PATH={os.environ['PATH']}",
            f"claude --plugin-dir {PLUGIN_DIR} --model {MODEL}",
        )
        self._wait_for_prompt(STARTUP_TIMEOUT_SEC)

    def _wait_for_prompt(self, timeout_sec: float) -> None:
        deadline = time.time() + timeout_sec
        while time.time() < deadline:
            screen = self.pane()
            if re.search(r"trust this folder", screen, re.IGNORECASE):
                self._tmux("send-keys", "-t", self.tmux_name, "Enter")
            elif "❯" in screen and "Select login method" not in screen:
                return
            time.sleep(POLL_INTERVAL_SEC)
        raise TimeoutError(f"入力を受け付ける状態になりませんでした:\n{self.pane()}")

    def close(self) -> None:
        """自分の tmux セッションだけを終わらせ、一時のフォルダを消す"""
        subprocess.run(["tmux", "kill-session", "-t", self.tmux_name], capture_output=True, check=False)
        # 終わりかけの Claude Code がフォルダへ書き込むことがあるため、消えるまで繰り返す
        for _ in range(10):
            shutil.rmtree(self.root, ignore_errors=True)
            if not self.root.exists():
                return
            time.sleep(0.5)

    # ---- 入力と観測 ----

    def _drain(self) -> list[dict[str, Any]]:
        """前回から transcript に増えた行を返す"""
        found: list[dict[str, Any]] = []
        files = sorted((self.config_dir / "projects").glob("*/*.jsonl"), key=lambda path: path.stat().st_mtime)
        for path in files:
            lines = path.read_text(encoding="utf-8").split("\n")
            consumed = self._seen.get(path, 0)
            for line in lines[consumed:]:
                if not line.strip():
                    consumed += 1
                    continue
                try:
                    found.append(json.loads(line))
                except json.JSONDecodeError:
                    # 書きかけの行は次の回に読む
                    break
                consumed += 1
            self._seen[path] = consumed
        return found

    def _wait_for(self, done: Callable[[list[dict[str, Any]]], bool], timeout_sec: float, what: str) -> list[dict[str, Any]]:
        collected: list[dict[str, Any]] = []
        deadline = time.time() + timeout_sec
        while time.time() < deadline:
            collected.extend(self._drain())
            if done(collected):
                return collected
            time.sleep(POLL_INTERVAL_SEC)
        raise TimeoutError(f"{what}を待っている間に時間切れになりました:\n{self.pane()}")

    def _type(self, text: str) -> None:
        self._tmux("send-keys", "-t", self.tmux_name, "-l", text)
        time.sleep(0.5)
        self._tmux("send-keys", "-t", self.tmux_name, "Enter")

    def submit(self, text: str) -> Submission:
        """入力を送信し、モデルの返事が終わるまで待って、モデルに届いた文脈を返す"""
        self._drain()
        self._type(text)
        lines = self._wait_for(lambda found: any(is_turn_end(line) for line in found), TURN_TIMEOUT_SEC, "モデルの返事")
        lines.extend(self._drain())
        sent = next((value for value in map(_user_text, lines) if value is not None), None)
        contexts = [value for value in map(_context_of, lines) if value is not None]
        return Submission(sent=sent, contexts=contexts, lines=lines)

    def compact(self) -> None:
        """/compact を実行し、圧縮が終わるまで待つ"""
        self._drain()
        self._type("/compact")
        self._wait_for(lambda found: any(is_compact_boundary(line) for line in found), COMPACT_TIMEOUT_SEC, "会話の圧縮")
        self._wait_for_prompt(STARTUP_TIMEOUT_SEC)

    def clear(self) -> None:
        """/clear を実行し、入力を受け付ける状態まで待つ"""
        self._drain()
        self._type("/clear")
        time.sleep(CLEAR_SETTLE_SEC)
        self._wait_for_prompt(STARTUP_TIMEOUT_SEC)


# ---- 設定ファイル・dev-docs.yaml・照合の YAML ----

# type ごとの fields のうち、id 以外の列の対応
ALIAS_COLUMNS = {
    "term": ["match: [name, aliases]", "title: name", "description: description"],
    "command": ["match: [name]", "command: command"],
    "url": ["match: [name]", "url: url"],
}


def alias_lines(alias_id: str, alias_type: str, paths: str, *, extra_fields: list[str] | None = None) -> list[str]:
    """aliases の要素 1 つの行（`- id:` を字下げなしで始める）。fields の列は元の YAML の `id`・`name` などに対応させる"""
    return [
        f"- id: {alias_id}",
        f"  type: {alias_type}",
        f"  paths: [{paths}]",
        "  fields:",
        "    id: id",
        *[f"    {line}" for line in [*ALIAS_COLUMNS[alias_type], *(extra_fields or [])]],
    ]


def term_alias_lines() -> list[str]:
    """dev-docs.yaml の用語の aliases の要素（`terms/*.yaml` を読む）の行"""
    return alias_lines("terms", "term", "terms/*.yaml")


def config_text(
    *,
    repositories: list[Path],
    global_extra: list[str] | None = None,
    aliases: list[str] | None = None,
) -> str:
    """読むリポジトリの dev-docs.yaml を global.repositories に持つ設定ファイルの本文。aliases は字下げなしの要素の行"""
    lines = [
        "global:",
        *[f"  {line}" for line in global_extra or []],
        "  repositories:",
        *[f"    - config: {path}" for path in repositories],
    ]
    if aliases:
        lines += ["  aliases:", *[f"    {line}" for line in aliases]]
    return "\n".join(lines) + "\n"


def dev_docs_text(aliases: list[str]) -> str:
    """aliases を持つ dev-docs.yaml の本文。aliases は字下げなしの要素の行"""
    return "\n".join(["aliases:", *[f"  {line}" for line in aliases]]) + "\n"


def term_text(term_id: str, *, aliases: list[str] | None = None, description: str | None = None) -> str:
    """用語の YAML の本文。語（name）は ID と同じにする"""
    lines = [f"id: {term_id}", f"name: {term_id}"]
    if aliases:
        lines.append(f"aliases: [{', '.join(aliases)}]")
    lines.append(f"description: {description or f'E2E 用の用語 {term_id}'}")
    return "\n".join(lines) + "\n"


def term_list_text(*term_ids: str) -> str:
    """複数の用語を 1 つの YAML の並びにした本文"""
    items = ["- " + term_text(term_id).rstrip().replace("\n", "\n  ") for term_id in term_ids]
    return "\n".join(items) + "\n"


def command_text(command_id: str) -> str:
    """コマンドの YAML の本文。語（name）は ID と同じにする"""
    return f"id: {command_id}\nname: {command_id}\ncommand: make {command_id}\n"


def url_of(url_id: str) -> str:
    """URL の YAML が持つ URL"""
    return f"https://example.com/{url_id}"


def url_text(url_id: str) -> str:
    """URL の YAML の本文。語（name）は ID と同じにする"""
    return f"id: {url_id}\nname: {url_id}\nurl: {url_of(url_id)}\n"


class E2ETestCase(unittest.TestCase):
    """テストごとに Claude Code のセッションを用意して後片付けする基底"""

    session: ClaudeSession

    def setUp(self) -> None:
        self.session = ClaudeSession()
        self.addCleanup(self.session.close)

    def start_with_terms(
        self,
        *,
        global_extra: list[str] | None = None,
        dev_docs_aliases: list[str] | None = None,
        config_aliases: list[str] | None = None,
        extra_repositories: list[Path] | None = None,
        config_exists: bool = True,
    ) -> ClaudeSession:
        """term-a（エイリアス 用語エー）と term-b を持つ設定で Claude Code を起動する。

        dev-docs.yaml は用語の aliases の要素に dev_docs_aliases を足して持ち、設定ファイルは
        dev-docs.yaml（extra_repositories の後ろ）と config_aliases を持つ
        """
        session = self.session
        session.write_file(session.terms_dir / "term-a.yaml", term_text("term-a", aliases=["用語エー"]))
        session.write_file(session.terms_dir / "term-b.yaml", term_text("term-b"))
        session.write_file(session.dev_docs_path, dev_docs_text([*term_alias_lines(), *(dev_docs_aliases or [])]))
        if config_exists:
            session.write_file(
                session.config_path,
                config_text(
                    repositories=[*(extra_repositories or []), session.dev_docs_path],
                    global_extra=global_extra,
                    aliases=config_aliases,
                ),
            )
        session.write_user_settings(session.config_path)
        session.start()
        return session

    def assert_context_has_entry(self, submission: Submission, section: str, entry_id: str, *fields: str) -> None:
        """見出しと section のセクションの下に、項目の ID と指定した列が並んでいる"""
        text = submission.context_text
        self.assertIn(f"# {HEADING}", text)
        self.assertIn(f"## {section}", text)
        self.assertIn(f"id: {entry_id}", text)
        for field_line in fields:
            self.assertIn(field_line, text)

    def assert_context_has_term(self, submission: Submission, term_id: str) -> None:
        """見出しと「用語」のセクションの下に、語の ID が並んでいる"""
        self.assert_context_has_entry(submission, "用語", term_id)

    def assert_no_context(self, submission: Submission) -> None:
        """文脈が追加されていない"""
        self.assertNotIn(HEADING, submission.context_text)

    def assert_sent_unchanged(self, submission: Submission, text: str) -> None:
        """入力の文が送信したとおりのまま届いている"""
        self.assertEqual((submission.sent or "").strip(), text.strip())
