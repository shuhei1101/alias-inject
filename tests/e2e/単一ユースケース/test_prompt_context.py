"""入力への引用の文脈の追加（単一ユースケース）の E2E テスト"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from support.harness import ANSWER_BRIEFLY, E2ETestCase, config_text


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
        session.write_file(session.config_path, config_text(terms_glob=session.terms_dir / "*.yaml"))
        restored = session.submit(f"term-a について。{ANSWER_BRIEFLY}")

        # 検証
        self.assert_no_context(excluded)
        self.assert_context_has_term(restored, "term-a")

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


if __name__ == "__main__":
    unittest.main()
