import { injectable } from '@theia/core/shared/inversify';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { CHROME_BAR_FOCUS_ADDRESS_COMMAND_ID } from './chrome-bar-commands';

/**
 * Set on the address pill's input element only (an element-scoped context
 * key), so it is true exactly when a keydown targets the pill.
 */
export const ADDRESS_FOCUSED_CONTEXT_KEY = 'powerbrowser.addressFocused';

/**
 * GUI-06 (13-03): the chrome bar's keybindings.
 *
 * Focusing the address pill, plus the pill-scoped F6 passthrough below.
 * `ctrlcmd` is the stock Theia
 * spelling for "Ctrl on Linux/Windows, Cmd on macOS" -- registering the two
 * modifiers as two literal bindings does NOT do that, because Theia rejects
 * a literal `cmd+` binding off macOS ("meta is for OSX only") and logs a
 * startup warning, leaving the macOS half unregistered on every other
 * platform. Bound against the imported focus-command const -- never a
 * re-spelled id string. Bound statically at module load beside the plan
 * 13-02 bindings (D-50: a contribution bound after first enumeration is
 * permanently invisible).
 */
@injectable()
export class ChromeBarKeybindingContribution implements KeybindingContribution {

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: CHROME_BAR_FOCUS_ADDRESS_COMMAND_ID,
            keybinding: 'ctrlcmd+l',
            // KEY-04: Monaco and the terminal keep Ctrl+L now that chrome no longer reserves it.
            when: '!editorFocus && !terminalFocus',
        });
        // WR-02: F6/Shift+F6 in the pill go to the page (the pill's own keydown
        // handler). Theia's capture-phase dispatch would otherwise run
        // @theia/debug's F6 (Pause, `inDebugMode`) first and stop the event.
        // A passthrough binding on an element-local key outranks that global
        // binding whatever the registration order, and lets the event reach the
        // pill; F6 everywhere else in Theia is untouched.
        for (const keybinding of ['f6', 'shift+f6']) {
            keybindings.registerKeybinding({
                command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
                keybinding,
                when: ADDRESS_FOCUSED_CONTEXT_KEY,
            });
        }
    }
}
