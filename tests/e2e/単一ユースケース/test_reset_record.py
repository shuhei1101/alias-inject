"""圧縮とクリアの後の記録の消去（単一ユースケース）の E2E テスト"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from support.harness import ANSWER_BRIEFLY, E2ETestCase, read_prompt


class ResetRecordTest(E2ETestCase):
    def test_normal_when_compacted(self) -> None:
        """/compact の後の入力で、記録が消えて同じ語の文脈がもう一度追加される（正常シナリオ（圧縮））"""
        # 準備
        session = self.start_with_terms()
        first = session.submit(f"term-a について。{ANSWER_BRIEFLY}")

        # 実行
        session.compact()
        result = session.submit(f"term-a について。{ANSWER_BRIEFLY}")

        # 検証
        self.assert_context_has_term(first, "term-a")
        self.assert_context_has_term(result, "term-a")

    def test_normal_when_cleared(self) -> None:
        """/clear の後の入力で、同じ語の文脈がもう一度追加される（正常シナリオ（クリア））"""
        # 準備
        session = self.start_with_terms()
        first = session.submit(f"term-a について。{ANSWER_BRIEFLY}")

        # 実行
        session.clear()
        result = session.submit(f"term-a について。{ANSWER_BRIEFLY}")

        # 検証
        self.assert_context_has_term(first, "term-a")
        self.assert_context_has_term(result, "term-a")

    def test_normal_when_compacted_after_tool_result(self) -> None:
        """ツールの結果で文脈を追加した語も、/compact の後の入力でもう一度追加される（正常シナリオ（ツールの結果で追加した語））"""
        # 準備
        session = self.start_with_terms()
        first = session.submit(read_prompt(self.write_note("このファイルは term-a について書いたメモです。\n")))

        # 実行
        session.compact()
        result = session.submit(f"term-a について。{ANSWER_BRIEFLY}")

        # 検証
        self.assert_tool_context_has_term(first, "term-a", "Read")
        self.assert_context_has_term(result, "term-a")


if __name__ == "__main__":
    unittest.main()
