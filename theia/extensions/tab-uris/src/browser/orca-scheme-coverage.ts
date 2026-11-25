import URI from '@theia/core/lib/common/uri';

/**
 * Phase 64 (TAB-02; P64-16, P64-17, P64-35; interface C7): the `pb-orca:`
 * reverse lookup for hosted Orca pane widgets, in the style of
 * existing-scheme-coverage.ts's `webviewUriOf`.
 *
 * The factory id lives here, not in @powerbrowser/orca-panes, which imports it
 * from tab-uris (the reverse import would be a cycle). The address path is
 * identity only: the minted name (`chat1`, `term2`, ...). The Orca tab id,
 * worktree id and pane key stay in the widget's construction options, never in
 * the address (docs/URI-SCHEMES.md general rules). `TabUriRegistry.uriOf`
 * calls this from one branch, so the registry's exported shape is unchanged.
 */
export const ORCA_PANE_FACTORY_ID = 'powerbrowser.orca-pane';

export function orcaPaneUriOf(factoryId: string, options: unknown): URI | undefined {
    if (factoryId !== ORCA_PANE_FACTORY_ID) {
        return undefined;
    }
    const { name } = (options as { name?: string } | undefined) ?? {};
    return name ? new URI('pb-orca:' + name) : undefined;
}
