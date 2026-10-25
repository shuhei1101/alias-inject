"""セッションを通した引用の文脈の追加（複合ユースケース）の E2E テスト"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from support.harness import ANSWER_BRIEFLY, E2ETestCase, term_text


class SessionFlowTest(E2ETestCase):
    def test_normal(self) -> None:
        """入力を重ねる間に書き換え・圧縮・/clear を挟んでも、語ごとに 1 回だけ文脈が追加される（正常シナリオ）"""
        # 準備
        session = self.start_with_terms()
        text_a = f"term-a について。{ANSWER_BRIEFLY}"

        # 実行
        first = session.submit(text_a)
        second = session.submit(text_a)
        # 用語の YAML に term-c を追加する
        session.write_file(session.terms_dir / "term-c.yaml", term_text("term-c"))
        text_c = f"term-c について。{ANSWER_BRIEFLY}"
        third = session.submit(text_c)
        session.compact()
        after_compact = session.submit(text_a)
        session.clear()
        after_clear = session.submit(text_a)

        # 検証
        self.assert_context_has_term(first, "term-a")
        self.assert_no_context(second)
        self.assert_context_has_term(third, "term-c")
        self.assert_context_has_term(after_compact, "term-a")
        self.assert_context_has_term(after_clear, "term-a")
        for result, text in (
            (first, text_a),
            (second, text_a),
            (third, text_c),
            (after_compact, text_a),
            (after_clear, text_a),
        ):
            self.assert_sent_unchanged(result, text)


if __name__ == "__main__":
    unittest.main()
