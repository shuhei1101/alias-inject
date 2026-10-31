"""E2E テストの共通の補助。tmux で実際の Claude Code を起動し、入力の送信とモデルに届いた文脈の読み取りを行う"""

from __future__ import annotations

import json
import os
import re
import shlex
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
# ツールの結果の後ろの文脈に追加される、変数参照の値の行の先頭
REFERENCE_PREFIX = "変数参照の値"
# 読ませるファイルの変数参照が指す、claude の起動時に設定する環境変数と、その値
REFERENCE_NAME = "ALIAS_INJECT_E2E_VALUE"
REFERENCE_VALUE = "value-a"
# 読ませるファイルの変数参照が指す、設定しない環境変数
UNSET_NAME = "ALIAS_INJECT_E2E_UNSET"
# REFERENCE_NAME の変数参照を 2 回含む、読ませるファイルの本文
REFERENCE_NOTE = f"値は !{{{REFERENCE_NAME}}} です。\nもう一度 !{{{REFERENCE_NAME}}} と書きます。\n"
# ツールを使う入力でモデルが確認を求めて止まらないよう、許可しておくツール
ALLOWED_TOOLS = ["Read", "Bash(cat:*)"]
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
    # モデルに届いたツールの結果の本文
    tool_results: list[str] = field(default_factory=list)
    # ツールの結果の後ろに追加された文脈（tool.call のフックの添付の本文）と、そのツールの名前の組
    tool_contexts: list[tuple[str, str]] = field(default_factory=list)

    @property
    def context_text(self) -> str:
        return "\n".join(self.contexts)

    @property
    def tool_result_text(self) -> str:
        return "\n".join(self.tool_results)

    def tool_context_text(self, tool: str | None = None) -> str:
        """ツールの結果の後ろに追加された文脈。tool を渡すとそのツールの結果の分だけ"""
        return "\n".join(text for name, text in self.tool_contexts if tool is None or name == tool)


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


def _tool_names_of(lines: list[dict[str, Any]]) -> dict[str, str]:
    """assistant の行の tool_use の ID からツールの名前を引く表"""
    names: dict[str, str] = {}
    for line in lines:
        content = (line.get("message") or {}).get("content")
        if line.get("type") != "assistant" or not isinstance(content, list):
            continue
        for part in content:
            if isinstance(part, dict) and part.get("type") == "tool_use":
                names[str(part.get("id"))] = str(part.get("name"))
    return names


def _tool_contexts_of(lines: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """tool.call のフックが追加した文脈を、ツールの名前と組にして取り出す"""
    names = _tool_names_of(lines)
    found: list[tuple[str, str]] = []
    for line in lines:
        text = _context_of(line)
        attachment = line.get("attachment") or {}
        if text is None or attachment.get("hookName") != "tool.call":
            continue
        # 添付の toolUseID は `{tool_use の ID}-context`
        tool_use_id = str(attachment.get("toolUseID", "")).removesuffix("-context")
        found.append((names.get(tool_use_id, ""), text))
    return found


def _tool_results_of(line: dict[str, Any]) -> list[str]:
    """transcript の user の行からツールの結果の本文を取り出す"""
    content = (line.get("message") or {}).get("content")
    if line.get("type") != "user" or not isinstance(content, list):
        return []
    texts: list[str] = []
    for part in content:
        if not isinstance(part, dict) or part.get("type") != "tool_result":
            continue
        body = part.get("content")
        if isinstance(body, str):
            texts.append(body)
        elif isinstance(body, list):
            texts.append("".join(item.get("text", "") for item in body if isinstance(item, dict) and item.get("type") == "text"))
    return texts


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
        # 読むリポジトリのフォルダ。dev-docs.yaml の documents の行の paths の相対パスはここから解決される
        self.repo_dir = self.root / "knowledge"
        self.terms_dir = self.repo_dir / "terms"
        # alias_type を持たない行の YAML を置くフォルダ
        self.docs_dir = self.repo_dir / "docs"
        self.dev_docs_path = self.repo_dir / "dev-docs.yaml"
        # 中身の無い PATH 用のフォルダ。`env` などのコマンドが見つからない PATH にするときに使う
        self.empty_bin_dir = self.root / "empty-bin"
        self.tmux_name = f"alias-inject-e2e-{os.getpid()}-{uuid.uuid4().hex[:6]}"
        self._seen: dict[Path, int] = {}
        self._clock = time.time()
        for folder in (self.config_dir, self.project_dir, self.terms_dir, self.docs_dir, self.urls_dir, self.empty_bin_dir):
            folder.mkdir(parents=True)

    # ---- 準備 ----

    def write_user_settings(self, config_path: Path | None, *, allow: list[str] | None = None) -> None:
        """ユーザースコープの settings.json の env に ALIAS_INJECT_CONFIG を置く（None なら env を置かない）。allow は確認なしで使うツール"""
        settings: dict[str, Any] = {}
        if config_path is not None:
            settings["env"] = {"ALIAS_INJECT_CONFIG": str(config_path)}
        if allow:
            settings["permissions"] = {"allow": allow}
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

    def start(self, *, env: dict[str, str] | None = None, path: str | None = None) -> None:
        """Claude Code を起動し、入力を受け付ける状態まで待つ。env は起動時に足す環境変数、path は PATH の差し替え（claude は絶対パスで起動する）。

        コマンドの頭で CLAUDE_CODE_CHILD_SESSION を外す（Claude Code のセッションから流すと、継いだこの変数のせいで PATH が空の claude が transcript を保存しない）
        """
        for tool in ("tmux", "claude"):
            if shutil.which(tool) is None:
                raise RuntimeError(f"{tool} が PATH にありません")
        claude = str(shutil.which("claude"))
        self._prepare_config_dir()
        extra_env = [arg for name, value in (env or {}).items() for arg in ("-e", f"{name}={value}")]
        command = f"{claude} --plugin-dir {PLUGIN_DIR} --model {MODEL}"
        # PATH の差し替えは tmux の -e ではなくコマンドの頭で渡す（-e の PATH は claude に届かない）
        if path is not None:
            command = f"PATH={shlex.quote(path)} {command}"
        command = f"unset CLAUDE_CODE_CHILD_SESSION; {command}"
        self._tmux(
            "new-session", "-d", "-s", self.tmux_name, "-x", "200", "-y", "50", "-c", str(self.project_dir),
            "-e", f"CLAUDE_CONFIG_DIR={self.config_dir}",
            "-e", f"HOME={os.environ['HOME']}",
            *extra_env,
            command,
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
            text = path.read_text(encoding="utf-8")
            # 最後の改行までを読んだ行とする（改行で終わっていない末尾の書きかけの行は次の回に読む）
            complete = text[: text.rfind("\n") + 1].split("\n")[:-1]
            consumed = self._seen.get(path, 0)
            for line in complete[consumed:]:
                if line.strip():
                    found.append(json.loads(line))
            self._seen[path] = len(complete)
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
        tool_results = [text for line in lines for text in _tool_results_of(line)]
        return Submission(
            sent=sent, contexts=contexts, lines=lines, tool_results=tool_results, tool_contexts=_tool_contexts_of(lines)
        )

    def subagent_tool_contexts(self) -> list[tuple[str, str]]:
        """サブエージェントの transcript（`projects/*/{セッション}/subagents/*.jsonl`）に残った、ツールの結果の後ろの文脈"""
        lines: list[dict[str, Any]] = []
        for path in (self.config_dir / "projects").glob("*/*/subagents/*.jsonl"):
            lines.extend(json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
        return _tool_contexts_of(lines)

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

def alias_lines(
    alias_id: str,
    alias_type: str,
    paths: str,
    *,
    records: str | None = None,
    metadata: list[str] | None = None,
) -> list[str]:
    """エイリアスの元の行 1 つの行（`- id:` を字下げなしで始める）。alias_type は行の `alias_type` の値、metadata は字下げなしで追加するキーの行（無ければ `metadata` を書かない）"""
    return [
        f"- id: {alias_id}",
        f"  paths: [{paths}]",
        f"  alias_type: {alias_type}",
        *([f"  records: {records}"] if records else []),
        *(["  metadata:", *[f"    {line}" for line in metadata]] if metadata else []),
    ]


def legacy_alias_lines(alias_id: str, alias_type: str, paths: str) -> list[str]:
    """`metadata` を持たない旧い構造の aliases の要素 1 つの行（`type` と `fields` で書く）"""
    return [
        f"- id: {alias_id}",
        f"  type: {alias_type}",
        f"  paths: [{paths}]",
        "  fields:",
        "    id: id",
        "    match: [name]",
    ]


def metadata_alias_type_lines(alias_id: str, alias_type: str, paths: str) -> list[str]:
    """行の `alias_type` を持たず `metadata.alias_type` を持つ旧い構造の行 1 つの行（`{type: custom, value: 種類}` で書く）"""
    return [
        f"- id: {alias_id}",
        f"  paths: [{paths}]",
        "  metadata:",
        "    alias_type:",
        "      type: custom",
        f"      value: {alias_type}",
    ]


def plain_document_lines() -> list[str]:
    """`alias_type` を持たない documents の行（`docs/*.yaml` に当たる。エイリアスの行ではない）"""
    return ["- id: docs", "  paths: [docs/*.yaml]", "  metadata:", "    title: name"]


def term_alias_lines(*, records: str | None = None) -> list[str]:
    """dev-docs.yaml の用語の行（`terms/*.yaml` を読む）の行"""
    return alias_lines("terms", "term", "terms/*.yaml", records=records)


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


def dev_docs_text(documents: list[str], *, extra: list[str] | None = None) -> str:
    """documents を持つ dev-docs.yaml の本文。documents は字下げなしの行の並び、extra はトップレベルに足す行"""
    return "\n".join(["documents:", *[f"  {line}" for line in documents], *(extra or [])]) + "\n"


def term_text(term_id: str, *, aliases: list[str] | None = None, description: str | None = None) -> str:
    """用語の YAML の本文。語（name）は ID と同じにする"""
    lines = [f"id: {term_id}", f"name: {term_id}"]
    if aliases:
        lines.append(f"aliases: [{', '.join(aliases)}]")
    lines.append(f"description: {description or f'E2E 用の用語 {term_id}'}")
    return "\n".join(lines) + "\n"


def term_list_text(*term_ids: str) -> str:
    """複数の用語を、配列 `terms` に並べた 1 つの YAML の本文"""
    items = ["  - " + term_text(term_id).rstrip().replace("\n", "\n    ") for term_id in term_ids]
    return "\n".join(["terms:", *items]) + "\n"


def command_text(command_id: str) -> str:
    """コマンドの YAML の本文。語（name）は ID と同じにする"""
    return f"id: {command_id}\nname: {command_id}\ncommand: make {command_id}\n"


def url_of(url_id: str) -> str:
    """URL の YAML が持つ URL"""
    return f"https://example.com/{url_id}"


def url_text(url_id: str) -> str:
    """URL の YAML の本文。語（name）は ID と同じにする"""
    return f"id: {url_id}\nname: {url_id}\nurl: {url_of(url_id)}\n"


def url_links_text(url_id: str) -> str:
    """配列 `links` に URL の要素を 1 つ持つ YAML の本文。語は `title` の列から取る"""
    return f"links:\n  - id: {url_id}\n    title: {url_id}\n    url: {url_of(url_id)}\n"


def skill_of(skill_id: str) -> str:
    """スキルの YAML が持つスキル名"""
    return f"e2e-{skill_id}"


def skill_text(skill_id: str) -> str:
    """スキルの YAML の本文。語（name）は ID と同じにする"""
    return f"id: {skill_id}\nname: {skill_id}\nskill: {skill_of(skill_id)}\n"


def tool_of(tool_id: str) -> str:
    """ツールの YAML が持つ MCP のツール名"""
    return f"mcp__e2e__{tool_id}"


def tool_text(tool_id: str) -> str:
    """ツールの YAML の本文。語（name）は ID と同じにする"""
    return f"id: {tool_id}\nname: {tool_id}\ntool: {tool_of(tool_id)}\n"


def path_of(path_id: str) -> str:
    """パスの YAML が持つパス（`~` を展開しない書き方）"""
    return f"~/.config/e2e/{path_id}.yaml"


def path_text(path_id: str) -> str:
    """パスの YAML の本文。語（name）は ID と同じにする"""
    return f"id: {path_id}\nname: {path_id}\npath: {path_of(path_id)}\n"


def env_url_of(env_id: str) -> str:
    """環境の YAML が持つ URL"""
    return f"http://127.0.0.1:8000/{env_id}"


ENV_PORT = 8000


def env_text(env_id: str) -> str:
    """環境の YAML の本文。語（name）は ID と同じにする"""
    return f"id: {env_id}\nname: {env_id}\nurl: {env_url_of(env_id)}\nport: {ENV_PORT}\n"


def avoid_text(avoid_id: str, replacement: str) -> str:
    """避ける語の YAML の本文。語（name）は ID と同じにする"""
    return f"id: {avoid_id}\nname: {avoid_id}\nreplacement: {replacement}\n"


def reference_line(name: str, value: str) -> str:
    """環境変数が設定されている名前の、変数参照の値の行"""
    return f"{REFERENCE_PREFIX}: !{{{name}}} = {value}"


def unset_reference_line(name: str) -> str:
    """環境変数が設定されていない名前の、変数参照の値の行"""
    return f"{REFERENCE_PREFIX}: !{{{name}}} は環境変数が設定されていない"


def read_prompt(path: Path) -> str:
    """ファイルを Read ツールで読ませる入力"""
    return f"{path} を Read ツールで読んで、読み終えたら「了」とだけ答えて。"


def subagent_read_prompt(path: Path) -> str:
    """Agent ツールで起動したサブエージェントに、ファイルを Read ツールで読ませる入力"""
    return (
        f"Agent ツールでサブエージェントを 1 つ起動し、{path} を Read ツールで読ませて。"
        "サブエージェントには読み終えたら「了」とだけ答えさせ、あなたも「了」とだけ答えて。"
    )


def cat_prompt(path: Path) -> str:
    """ファイルを Bash ツールの cat で読ませる入力"""
    return f"Bash ツールで cat {path} を実行して、実行し終えたら「了」とだけ答えて。"


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
        dev_docs_rows: list[str] | None = None,
        dev_docs_extra: list[str] | None = None,
        config_aliases: list[str] | None = None,
        term_records: bool = False,
        extra_repositories: list[Path] | None = None,
        config_exists: bool = True,
        env: dict[str, str] | None = None,
        path: str | None = None,
    ) -> ClaudeSession:
        """term-a（エイリアス 用語エー）と term-b を持つ設定で Claude Code を起動する。

        dev-docs.yaml は documents に、用語の行・alias_type を持たない行・dev_docs_rows を持ち、
        トップレベルに dev_docs_extra を足す。設定ファイルは dev-docs.yaml（extra_repositories の後ろ）と
        config_aliases を持つ。term_records が True のとき、用語は配列 `terms` を持つ 1 つの YAML に置き、
        用語の行を `records: terms` にする（False のときは 1 ファイルに 1 語）。
        env は起動時に足す環境変数、path は claude を起動する PATH の差し替え
        """
        session = self.session
        if term_records:
            session.write_file(session.terms_dir / "terms.yaml", term_list_text("term-a", "term-b"))
        else:
            session.write_file(session.terms_dir / "term-a.yaml", term_text("term-a", aliases=["用語エー"]))
            session.write_file(session.terms_dir / "term-b.yaml", term_text("term-b"))
        session.write_file(session.docs_dir / "doc-z.yaml", "name: doc-z\n")
        session.write_file(
            session.dev_docs_path,
            dev_docs_text(
                [*term_alias_lines(records="terms" if term_records else None), *plain_document_lines(), *(dev_docs_rows or [])],
                extra=dev_docs_extra,
            ),
        )
        if config_exists:
            session.write_file(
                session.config_path,
                config_text(
                    repositories=[*(extra_repositories or []), session.dev_docs_path],
                    global_extra=global_extra,
                    aliases=config_aliases,
                ),
            )
        session.write_user_settings(session.config_path, allow=ALLOWED_TOOLS)
        session.start(env=env, path=path)
        return session

    def write_note(self, text: str) -> Path:
        """読ませるテキストファイルをプロジェクトのフォルダに書き、そのパスを返す"""
        path = self.session.project_dir / "note.txt"
        self.session.write_file(path, text)
        return path

    def assert_context_has_entry(self, submission: Submission, section: str, entry_id: str, *fields: str) -> None:
        """見出しと section のセクションの下に、項目の ID と指定した列が並んでいる"""
        text = submission.context_text
        self.assertIn(f"# {HEADING}", text)
        self.assertIn(f"## {section}", text)
        self.assertIn(f"id: {entry_id}", text)
        for field_line in fields:
            self.assertIn(field_line, text)

    def assert_sections_in_order(self, submission: Submission, *sections: str) -> None:
        """見出しの下に、sections のセクションがこの順に並んでいる"""
        text = submission.context_text
        self.assertIn(f"# {HEADING}", text)
        positions = [text.find(f"## {section}") for section in sections]
        self.assertNotIn(-1, positions)
        self.assertEqual(positions, sorted(positions))

    def assert_context_has_term(self, submission: Submission, term_id: str) -> None:
        """見出しと「用語」のセクションの下に、語の ID が並んでいる"""
        self.assert_context_has_entry(submission, "用語", term_id)

    def assert_context_has_reference_line(self, submission: Submission, line: str) -> None:
        """ツールの結果の後ろの文脈に、変数参照の値の行がちょうど 1 行ある"""
        self.assertEqual(submission.context_text.count(line), 1)

    def assert_no_reference_line(self, submission: Submission) -> None:
        """文脈にもツールの結果にも、変数参照の値の行が無い"""
        self.assertNotIn(REFERENCE_PREFIX, submission.context_text)
        self.assertNotIn(REFERENCE_PREFIX, submission.tool_result_text)

    def assert_tool_context_has_term(self, submission: Submission, term_id: str, tool: str | None = None) -> None:
        """ツールの結果の後ろの文脈で、見出しと「用語」のセクションの下に語の ID が並んでいる"""
        text = submission.tool_context_text(tool)
        self.assertIn(f"# {HEADING}", text)
        self.assertIn("## 用語", text)
        self.assertIn(f"id: {term_id}", text)

    def assert_no_tool_context(self, submission: Submission, tool: str | None = None) -> None:
        """ツールの結果の後ろに引用の文脈が追加されていない"""
        self.assertNotIn(HEADING, submission.tool_context_text(tool))

    def assert_no_context(self, submission: Submission) -> None:
        """文脈が追加されていない"""
        self.assertNotIn(HEADING, submission.context_text)

    def assert_sent_unchanged(self, submission: Submission, text: str) -> None:
        """入力の文が送信したとおりのまま届いている"""
        self.assertEqual((submission.sent or "").strip(), text.strip())
