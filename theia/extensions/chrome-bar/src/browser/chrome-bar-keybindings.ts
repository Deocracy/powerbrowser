import { injectable } from '@theia/core/shared/inversify';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { CHROME_BAR_FOCUS_ADDRESS_COMMAND_ID } from './chrome-bar-commands';

/**
 * GUI-06 (13-03): the chrome bar's keybindings.
 *
 * One binding only: focusing the address pill. `ctrlcmd` is the stock Theia
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
    }
}
