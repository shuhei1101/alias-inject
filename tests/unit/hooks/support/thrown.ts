/** 関数を呼び、投げられた例外を返却する。投げなければ null を返却する */
export function thrown(run: () => unknown): unknown {
  try {
    run()
    return null
  } catch (error) {
    return error
  }
}

/** 非同期の関数を呼び、投げられた例外を返却する。投げなければ null を返却する */
export async function thrownAsync(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
    return null
  } catch (error) {
    return error
  }
}
