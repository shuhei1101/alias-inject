"""ツールの結果への引用の文脈の追加（単一ユースケース）の E2E テスト"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from support.harness import (
    ANSWER_BRIEFLY,
    E2ETestCase,
    alias_lines,
    cat_prompt,
    read_prompt,
    subagent_read_prompt,
)

# term-a を含み、term-b を含まない、読ませるファイルの本文
TERM_A_NOTE = "このファイルは term-a について書いたメモです。\n"


class ToolResultContextTest(E2ETestCase):
    def test_normal(self) -> None:
        """Read の結果の本文に初めて出た語の文脈が結果の後ろに届き、本文は変わらない（正常シナリオ）"""
        # 準備
        session = self.start_with_terms()
        text = read_prompt(self.write_note(TERM_A_NOTE))

        # 実行
        result = session.submit(text)

        # 検証
        self.assert_tool_context_has_term(result, "term-a", "Read")
        self.assertIn("description: E2E 用の用語 term-a", result.tool_context_text("Read"))
        self.assertNotIn("id: term-b", result.tool_context_text())
        self.assertIn(TERM_A_NOTE.strip(), result.tool_result_text)

    def test_normal_when_only_recorded_terms(self) -> None:
        """入力で記録済みの語だけを含む結果には文脈が追加されない（正常シナリオ（記録済みの語だけ））"""
        # 準備
        session = self.start_with_terms()
        session.submit(f"term-a について。{ANSWER_BRIEFLY}")
        text = read_prompt(self.write_note(TERM_A_NOTE))

        # 実行
        result = session.submit(text)

        # 検証
        self.assert_no_tool_context(result)

    def test_normal_when_tool_excluded(self) -> None:
        """exclude_tools の Bash の結果には文脈が追加されず、その後の Read の結果には追加される（正常シナリオ（照合から外したツール））"""
        # 準備
        session = self.start_with_terms(global_extra=["exclude_tools: [Bash]"])
        note = self.write_note(TERM_A_NOTE)

        # 実行
        by_bash = session.submit(cat_prompt(note))
        by_read = session.submit(read_prompt(note))

        # 検証
        self.assertIn(TERM_A_NOTE.strip(), by_bash.tool_result_text)
        self.assert_no_tool_context(by_bash)
        self.assert_tool_context_has_term(by_read, "term-a", "Read")

    def test_normal_when_reading_own_document(self) -> None:
        """読んでいる文書そのものの語は外し、本文に出た他の語の文脈を追加する（正常シナリオ（読んでいる文書そのもの））"""
        # 準備
        # 文書 doc-x の YAML を、alias_type が doc の行で読む。本文に doc-x と term-a を含む
        session = self.session
        doc_path = session.repo_dir / "docs-x" / "doc-x.yaml"
        session.write_file(doc_path, "id: doc-x\nname: doc-x\ndescription: doc-x は term-a を説明する文書\n")
        # 入力の文のパスに出る doc-x が入力で記録されないよう、利用者の入力は照合しない
        session = self.start_with_terms(
            global_extra=["origins: [plugin]"], dev_docs_rows=alias_lines("docs-x", "doc", "docs-x/*.yaml")
        )

        # 実行
        result = session.submit(read_prompt(doc_path))

        # 検証
        self.assert_tool_context_has_term(result, "term-a", "Read")
        self.assertNotIn("id: doc-x", result.tool_context_text())

    def test_normal_when_over_limit(self) -> None:
        """出た回数の多い語から max_items 語だけを追加する（正常シナリオ（上限を超える））"""
        # 準備
        session = self.start_with_terms(global_extra=["max_items: 1"])
        # 最初に出た位置は term-a が早く、出た回数は term-b が多い
        text = read_prompt(self.write_note("term-a の次に term-b、term-b、term-b と書く。\n"))

        # 実行
        result = session.submit(text)

        # 検証
        self.assert_tool_context_has_term(result, "term-b", "Read")
        self.assertNotIn("id: term-a", result.tool_context_text())

    def test_normal_when_in_subagent(self) -> None:
        """サブエージェントの Read とメインの会話の Read は別の記録で照合され、どちらにも文脈が追加される（正常シナリオ（サブエージェント））"""
        # 準備
        # サブエージェントの答え（メインの会話の Agent の結果）に term-a が入っても、メインの会話の記録に入らないようにする
        session = self.start_with_terms(global_extra=["exclude_tools: [Agent]"])
        note = self.write_note(TERM_A_NOTE)

        # 実行
        session.submit(subagent_read_prompt(note))
        in_subagent = "\n".join(text for name, text in session.subagent_tool_contexts() if name == "Read")
        in_main = session.submit(read_prompt(note))

        # 検証
        self.assertIn("id: term-a", in_subagent)
        self.assert_tool_context_has_term(in_main, "term-a", "Read")

    def test_normal_when_error_result(self) -> None:
        """Read のエラーの結果には文脈が追加されない（正常シナリオ（エラーの結果））"""
        # 準備
        # 入力の文のパスに出る term-a が入力で記録されないよう、利用者の入力は照合しない
        session = self.start_with_terms(global_extra=["origins: [plugin]"])
        missing = session.project_dir / "term-a" / "missing.txt"

        # 実行
        result = session.submit(read_prompt(missing))

        # 検証
        self.assert_no_tool_context(result)

    def test_error_when_config_unreadable(self) -> None:
        """設定ファイルが読めなくても Read の結果の本文はそのまま届き、文脈は追加されない（異常シナリオ（設定ファイルが読めない））"""
        # 準備
        session = self.start_with_terms()
        session.write_file(session.config_path, "global: [\n")
        text = read_prompt(self.write_note(TERM_A_NOTE))

        # 実行
        result = session.submit(text)

        # 検証
        self.assertIn(TERM_A_NOTE.strip(), result.tool_result_text)
        self.assert_no_tool_context(result)


if __name__ == "__main__":
    unittest.main()
