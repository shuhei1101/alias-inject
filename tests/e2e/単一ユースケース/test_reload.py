"""設定とYAMLの読み直し（単一ユースケース）の E2E テスト"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from support.harness import (
    ANSWER_BRIEFLY,
    E2ETestCase,
    alias_lines,
    command_text,
    dev_docs_text,
    plain_document_lines,
    term_alias_lines,
    term_list_text,
    term_text,
    url_text,
)


class ReloadTest(E2ETestCase):
    def test_normal(self) -> None:
        """書き換えた直後の入力で、追加した語と追加した YAML の語の文脈が追加される（正常シナリオ）"""
        # 準備
        # 用語は配列 terms を持つ YAML に置く（用語の行は records: terms）
        session = self.start_with_terms(term_records=True)
        session.submit(f"こんにちは。{ANSWER_BRIEFLY}")
        # 配列 terms に term-c を加え、同じ glob に当たる YAML（term-d）を足す
        session.write_file(session.terms_dir / "terms.yaml", term_list_text("term-a", "term-b", "term-c"))
        session.write_file(session.terms_dir / "term-d.yaml", term_list_text("term-d"))

        # 実行
        result = session.submit(f"term-c と term-d について。{ANSWER_BRIEFLY}")

        # 検証
        self.assert_context_has_term(result, "term-c")
        self.assertIn("id: term-d", result.context_text)

    def test_normal_when_repository_config_changed(self) -> None:
        """書き換えた dev-docs.yaml の documents に足した行の語の文脈が、書き換えた直後の入力で追加される（正常シナリオ（dev-docs.yaml の書き換え））"""
        # 準備
        session = self.start_with_terms()
        session.write_file(session.repo_dir / "commands" / "cmd-a.yaml", command_text("cmd-a"))
        session.submit(f"こんにちは。{ANSWER_BRIEFLY}")
        # dev-docs.yaml の documents に、コマンドの YAML を読む行を足す
        session.write_file(
            session.dev_docs_path,
            dev_docs_text([*term_alias_lines(), *plain_document_lines(), *alias_lines("commands", "command", "commands/*.yaml")]),
        )

        # 実行
        result = session.submit(f"cmd-a について。{ANSWER_BRIEFLY}")

        # 検証
        self.assert_context_has_entry(result, "コマンド", "cmd-a", "command: `make cmd-a`")

    def test_error_when_yaml_malformed(self) -> None:
        """書式の誤った YAML の行だけが外れ、もう一方の行の文脈は追加される（異常シナリオ（YAML の書式の誤り））"""
        # 準備
        session = self.start_with_terms(config_aliases=alias_lines("urls", "url", "urls/*.yaml"))
        session.write_file(session.urls_dir / "url-a.yaml", url_text("url-a"))
        session.submit(f"こんにちは。{ANSWER_BRIEFLY}")
        # URL の YAML を書式の誤った内容に書き換える
        session.write_file(session.urls_dir / "url-a.yaml", "id: [url-a\nname: url-a\n")

        # 実行
        result = session.submit(f"term-a と url-a について。{ANSWER_BRIEFLY}")

        # 検証
        self.assert_context_has_term(result, "term-a")
        self.assertNotIn("## URL", result.context_text)
        self.assertNotIn("id: url-a", result.context_text)
        # 入力の送信は止まらず、モデルの返事が返っている
        self.assertTrue(any(line.get("type") == "assistant" for line in result.lines))


if __name__ == "__main__":
    unittest.main()
