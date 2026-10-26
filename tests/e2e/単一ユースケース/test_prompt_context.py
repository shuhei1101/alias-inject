"""入力への引用の文脈の追加（単一ユースケース）の E2E テスト"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from support.harness import ANSWER_BRIEFLY, E2ETestCase, alias_lines, config_text, term_text, url_of, url_text


class PromptContextTest(E2ETestCase):
    def test_normal(self) -> None:
        """初めて出た語の文脈だけがモデルに届き、入力の文は変わらない（正常シナリオ）"""
        # 準備
        session = self.start_with_terms()
        text = f"term-a について説明して。{ANSWER_BRIEFLY}"

        # 実行
        result = session.submit(text)

        # 検証
        self.assert_context_has_term(result, "term-a")
        self.assertIn("description: E2E 用の用語 term-a", result.context_text)
        self.assertNotIn("id: term-b", result.context_text)
        self.assert_sent_unchanged(result, text)

    def test_normal_when_only_recorded_terms(self) -> None:
        """記録済みの語だけを含む入力には文脈が追加されない（正常シナリオ（記録済みの語だけ））"""
        # 準備
        session = self.start_with_terms()
        session.submit(f"term-a について説明して。{ANSWER_BRIEFLY}")
        text = f"もう一度 term-a について。{ANSWER_BRIEFLY}"

        # 実行
        result = session.submit(text)

        # 検証
        self.assert_no_context(result)
        self.assert_sent_unchanged(result, text)

    def test_normal_when_over_limit(self) -> None:
        """max_items を超えた語は、その回には追加されず次の入力で追加される（正常シナリオ（上限を超える））"""
        # 準備
        session = self.start_with_terms(global_extra=["max_items: 1"])

        # 実行
        first = session.submit(f"term-a と term-b の違いは。{ANSWER_BRIEFLY}")
        second = session.submit(f"term-b について。{ANSWER_BRIEFLY}")

        # 検証
        self.assertIn("id: term-a", first.context_text)
        self.assertNotIn("id: term-b", first.context_text)
        self.assert_context_has_term(second, "term-b")

    def test_normal_when_origin_excluded(self) -> None:
        """origins に無い出所の入力には追加されず、設定を戻した後の入力で追加される（正常シナリオ（出所が対象外））"""
        # 準備
        session = self.start_with_terms(global_extra=["origins: [plugin]"])

        # 実行
        excluded = session.submit(f"term-a について。{ANSWER_BRIEFLY}")
        # origins を既定（すべての出所）に戻す
        session.write_file(session.config_path, config_text(repositories=[session.dev_docs_path]))
        restored = session.submit(f"term-a について。{ANSWER_BRIEFLY}")

        # 検証
        self.assert_no_context(excluded)
        self.assert_context_has_term(restored, "term-a")

    def test_normal_when_config_aliases(self) -> None:
        """dev-docs.yaml と設定ファイルの aliases の両方の語の文脈が追加される（正常シナリオ（設定ファイルの aliases））"""
        # 準備
        session = self.start_with_terms(config_aliases=alias_lines("urls", "url", "urls/*.yaml"))
        session.write_file(session.urls_dir / "link-a.yaml", url_text("link-a"))

        # 実行
        result = session.submit(f"term-a と link-a について。{ANSWER_BRIEFLY}")

        # 検証
        self.assert_context_has_term(result, "term-a")
        self.assert_context_has_entry(result, "URL", "link-a", f"url: {url_of('link-a')}")

    def test_error_when_config_unreadable(self) -> None:
        """設定ファイルが読めなくても入力は止まらず、文脈は追加されない（異常シナリオ（設定ファイルが読めない））"""
        # 準備
        # ALIAS_INJECT_CONFIG が、無いファイルを指す
        session = self.start_with_terms(config_exists=False)
        text = f"term-a について。{ANSWER_BRIEFLY}"

        # 実行
        result = session.submit(text)

        # 検証
        self.assert_no_context(result)
        self.assert_sent_unchanged(result, text)
        # モデルの返事が返っている
        self.assertTrue(any(line.get("type") == "assistant" for line in result.lines))

    def test_error_when_repository_unreadable(self) -> None:
        """読めない dev-docs.yaml のリポジトリだけが外れ、他のリポジトリと設定ファイルの aliases の文脈は追加される（異常シナリオ（dev-docs.yaml が読めない））"""
        # 準備
        # 無い dev-docs.yaml を指す要素を、読めるリポジトリの前に並べる
        missing = self.session.root / "missing" / "dev-docs.yaml"
        session = self.start_with_terms(
            config_aliases=alias_lines("urls", "url", "urls/*.yaml"),
            extra_repositories=[missing],
        )
        session.write_file(session.urls_dir / "link-a.yaml", url_text("link-a"))
        text = f"term-a と link-a について。{ANSWER_BRIEFLY}"

        # 実行
        result = session.submit(text)

        # 検証
        self.assert_context_has_term(result, "term-a")
        self.assert_context_has_entry(result, "URL", "link-a")
        self.assert_sent_unchanged(result, text)

    def test_error_when_alias_invalid(self) -> None:
        """スキーマに合わない aliases の要素だけが外れ、他の要素の文脈は追加される（異常シナリオ（スキーマに合わない aliases の要素））"""
        # 準備
        # term に無いキー mcp を fields に持つ要素。照合に要る列は揃っているので、スキーマで検証しなければ term-x が当たる
        session = self.start_with_terms(
            dev_docs_aliases=alias_lines("bad", "term", "bad/*.yaml", extra_fields=["mcp: rule-inject"]),
        )
        session.write_file(session.repo_dir / "bad" / "term-x.yaml", term_text("term-x"))
        text = f"term-a と term-x について。{ANSWER_BRIEFLY}"

        # 実行
        result = session.submit(text)

        # 検証
        self.assert_context_has_term(result, "term-a")
        self.assertNotIn("id: term-x", result.context_text)
        self.assert_sent_unchanged(result, text)


if __name__ == "__main__":
    unittest.main()
