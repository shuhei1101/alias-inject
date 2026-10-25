"""設定とYAMLの読み直し（単一ユースケース）の E2E テスト"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from support.harness import ANSWER_BRIEFLY, E2ETestCase, term_list_text, term_text


class ReloadTest(E2ETestCase):
    def test_normal(self) -> None:
        """書き換えた直後の入力で、追加した語と追加した YAML の語の文脈が追加される（正常シナリオ）"""
        # 準備
        session = self.start_with_terms()
        session.submit(f"こんにちは。{ANSWER_BRIEFLY}")
        # term-a の YAML に term-c を加え、同じ glob に当たる YAML（term-d）を足す
        session.write_file(session.terms_dir / "term-a.yaml", term_list_text("term-a", "term-c"))
        session.write_file(session.terms_dir / "term-d.yaml", term_text("term-d"))

        # 実行
        result = session.submit(f"term-c と term-d について。{ANSWER_BRIEFLY}")

        # 検証
        self.assert_context_has_term(result, "term-c")
        self.assertIn("id: term-d", result.context_text)

    def test_error_when_yaml_malformed(self) -> None:
        """書式の誤った YAML のソースだけが外れ、もう一方のソースの文脈は追加される（異常シナリオ（YAML の書式の誤り））"""
        # 準備
        session = self.start_with_terms(
            extra_sources=["- label: URL", "  type: url", f"  files: {self.session.urls_dir}/*.yaml", "  id: id", "  words: [name]", "  url: url"],
        )
        session.write_file(session.urls_dir / "url-a.yaml", "id: url-a\nname: url-a\nurl: https://example.com/a\n")
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
