import { describe, expect, it } from 'vitest'
import {
  installedElectronCandidates,
  resolveInstalledElectronExecutable
} from './orcad-browser-provider'

const SWITCH = 'ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER'

const cases: { platform: NodeJS.Platform; home: string; env: NodeJS.ProcessEnv }[] = [
  { platform: 'darwin', home: '/Users/test', env: {} },
  { platform: 'linux', home: '/home/test', env: {} },
  {
    platform: 'win32',
    home: 'C:\\Users\\test',
    env: { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local', ProgramFiles: 'C:\\Program Files' }
  }
]

describe('ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER', () => {
  it('leaves the installed Electron candidates unchanged when the switch is unset or not 1', () => {
    for (const { platform, home, env } of cases) {
      const stock = installedElectronCandidates(platform, home, env)
      expect(stock.length).toBeGreaterThan(0)
      for (const value of ['', '0', 'true', 'yes']) {
        expect(installedElectronCandidates(platform, home, { ...env, [SWITCH]: value })).toEqual(
          stock
        )
      }
    }
  })

  it('returns no installed Electron candidate when the switch is 1', () => {
    for (const { platform, home, env } of cases) {
      expect(installedElectronCandidates(platform, home, { ...env, [SWITCH]: '1' })).toEqual([])
    }
  })

  it('resolves no installed Electron executable when the switch is 1', async () => {
    const candidates = installedElectronCandidates(process.platform, '/home/test', {
      [SWITCH]: '1'
    })
    await expect(resolveInstalledElectronExecutable(candidates)).resolves.toBeNull()
  })
})
