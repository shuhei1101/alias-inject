declare module 'claude-code' {
  interface PluginState {
    'alias-inject': { recorded: StateFamily<string[]> }
  }
}
