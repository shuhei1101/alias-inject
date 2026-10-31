"""セッションを通した引用の文脈の追加（複合ユースケース）の E2E テスト"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from support.harness import (
    ANSWER_BRIEFLY,
    REFERENCE_NAME,
    REFERENCE_NOTE,
    REFERENCE_VALUE,
    E2ETestCase,
    read_prompt,
    reference_line,
    term_list_text,
)


class SessionFlowTest(E2ETestCase):
    def test_normal(self) -> None:
        """入力を重ねる間に書き換え・圧縮・/clear を挟んでも、語ごとに 1 回だけ文脈が追加され、/clear の後に読んだ本文の語の文脈と変数参照の値が届く（正常シナリオ）"""
        # 準備
        # 用語は配列 terms を持つ YAML に置く（用語の行は records: terms）
        session = self.start_with_terms(term_records=True, env={REFERENCE_NAME: REFERENCE_VALUE})
        text_a = f"term-a について。{ANSWER_BRIEFLY}"
        text_read = read_prompt(self.write_note(f"{REFERENCE_NOTE}term-b についても書きます。\n"))

        # 実行
        first = session.submit(text_a)
        second = session.submit(text_a)
        # 用語の YAML の配列 terms に term-c を追加する
        session.write_file(session.terms_dir / "terms.yaml", term_list_text("term-a", "term-b", "term-c"))
        text_c = f"term-c について。{ANSWER_BRIEFLY}"
        third = session.submit(text_c)
        session.compact()
        after_compact = session.submit(text_a)
        session.clear()
        after_clear = session.submit(text_a)
        after_read = session.submit(text_read)
        text_b = f"term-b について。{ANSWER_BRIEFLY}"
        after_tool_result = session.submit(text_b)

        # 検証
        self.assert_context_has_term(first, "term-a")
        self.assert_no_context(second)
        self.assert_context_has_term(third, "term-c")
        self.assert_context_has_term(after_compact, "term-a")
        self.assert_context_has_term(after_clear, "term-a")
        self.assert_tool_context_has_term(after_read, "term-b", "Read")
        self.assert_context_has_reference_line(after_read, reference_line(REFERENCE_NAME, REFERENCE_VALUE))
        # ツールの結果で追加した term-b は入力と記録を共有する
        self.assert_no_context(after_tool_result)
        for result, text in (
            (first, text_a),
            (second, text_a),
            (third, text_c),
            (after_compact, text_a),
            (after_clear, text_a),
            (after_read, text_read),
            (after_tool_result, text_b),
        ):
            self.assert_sent_unchanged(result, text)


if __name__ == "__main__":
    unittest.main()
