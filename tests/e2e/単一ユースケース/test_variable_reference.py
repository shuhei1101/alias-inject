"""読んだ本文への変数参照の値の追加（単一ユースケース）の E2E テスト"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from support.harness import (
    REFERENCE_NAME,
    REFERENCE_NOTE,
    REFERENCE_VALUE,
    UNSET_NAME,
    E2ETestCase,
    cat_prompt,
    read_prompt,
    reference_line,
    unset_reference_line,
)


class VariableReferenceTest(E2ETestCase):
    def test_normal(self) -> None:
        """Read で読んだ本文の変数参照の値が 1 行だけ文脈に追加され、本文は置き換わらない（正常シナリオ）"""
        # 準備
        session = self.start_with_terms(env={REFERENCE_NAME: REFERENCE_VALUE})
        text = read_prompt(self.write_note(REFERENCE_NOTE))

        # 実行
        result = session.submit(text)

        # 検証
        self.assert_context_has_reference_line(result, reference_line(REFERENCE_NAME, REFERENCE_VALUE))
        self.assertIn(f"!{{{REFERENCE_NAME}}}", result.tool_result_text)
        self.assert_sent_unchanged(result, text)

    def test_normal_when_read_by_bash(self) -> None:
        """Bash の cat で読んだ本文の変数参照の値が 1 行だけ文脈に追加される（正常シナリオ（Bash で読む））"""
        # 準備
        session = self.start_with_terms(env={REFERENCE_NAME: REFERENCE_VALUE})
        text = cat_prompt(self.write_note(REFERENCE_NOTE))

        # 実行
        result = session.submit(text)

        # 検証
        self.assert_context_has_reference_line(result, reference_line(REFERENCE_NAME, REFERENCE_VALUE))

    def test_normal_when_unset(self) -> None:
        """環境変数が設定されていない名前は、設定されていない旨の行が文脈に追加される（正常シナリオ（設定されていない名前））"""
        # 準備
        session = self.start_with_terms(env={REFERENCE_NAME: REFERENCE_VALUE})
        text = read_prompt(self.write_note(f"値は !{{{UNSET_NAME}}} です。\n"))

        # 実行
        result = session.submit(text)

        # 検証
        self.assert_context_has_reference_line(result, unset_reference_line(UNSET_NAME))

    def test_normal_when_no_reference(self) -> None:
        """変数参照を含まない本文には、変数参照の値の行が追加されない（正常シナリオ（変数参照が無い））"""
        # 準備
        session = self.start_with_terms(env={REFERENCE_NAME: REFERENCE_VALUE})
        text = read_prompt(self.write_note("変数参照を含まない本文です。\n"))

        # 実行
        result = session.submit(text)

        # 検証
        self.assert_no_reference_line(result)
        self.assertIn("変数参照を含まない本文です。", result.tool_result_text)

    def test_error_when_values_unavailable(self) -> None:
        """値を引く子プロセスを起動できなくても、ツールの結果の本文はそのまま届き、変数参照の値の行は追加されない（異常シナリオ（値を引けない））"""
        # 準備
        # env を見つけられない PATH で claude を起動する
        session = self.start_with_terms(
            env={REFERENCE_NAME: REFERENCE_VALUE},
            path=str(self.session.empty_bin_dir),
        )
        text = read_prompt(self.write_note(REFERENCE_NOTE))

        # 実行
        result = session.submit(text)

        # 検証
        self.assertIn(f"!{{{REFERENCE_NAME}}}", result.tool_result_text)
        self.assert_no_reference_line(result)
        # モデルの返事が返っている
        self.assertTrue(any(line.get("type") == "assistant" for line in result.lines))


if __name__ == "__main__":
    unittest.main()
