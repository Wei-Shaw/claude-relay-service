jest.mock('../src/services/accountPoolAutomationService', () => ({
  runPolicySweep: jest.fn()
}))

jest.mock('../src/services/serverStateService', () => ({
  getAccountMirror: jest.fn(),
  runAccountAction: jest.fn()
}))

jest.mock('child_process', () => ({
  execFile: jest.fn()
}))

const accountPoolAutomationService = require('../src/services/accountPoolAutomationService')
const serverStateService = require('../src/services/serverStateService')
const { execFile } = require('child_process')
const carherAdminSkillService = require('../src/services/carherAdminSkillService')

describe('carherAdminSkillService', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    delete process.env.SERVER_STATE_LIVE_MUTATION_ENABLED
    delete process.env.CARHER_ADMIN_RESET_BANK_SCRIPT
    delete process.env.SERVER_STATE_WSL_BIN
    delete process.env.CARHER_ADMIN_RESET_BANK_SWEEP_LIMIT
    delete process.env.CARHER_ADMIN_RESET_BANK_CACHE_TTL_MS
    carherAdminSkillService.__resetForTest()
  })

  test('runs server dry-run sweep through existing automation service', async () => {
    accountPoolAutomationService.runPolicySweep.mockResolvedValue({
      mode: 'server-mirror',
      dryRun: true,
      totals: { scanned: 2 }
    })

    const result = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_sweep_dry_run'
    })

    expect(accountPoolAutomationService.runPolicySweep).toHaveBeenCalledWith({
      dryRun: true,
      source: 'server'
    })
    expect(result).toMatchObject({
      provider: 'openai',
      action: 'openai_sweep_dry_run',
      dryRun: true,
      mutationEnabled: false,
      success: true
    })
    expect(result.data.totals.scanned).toBe(2)
  })

  test('refreshes one OpenAI account through serverStateService', async () => {
    serverStateService.runAccountAction.mockResolvedValue({
      ok: true,
      accountId: 'acct-29',
      action: 'refresh'
    })

    const result = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_refresh_account',
      accountId: 'acct-29'
    })

    expect(serverStateService.runAccountAction).toHaveBeenCalledWith({
      provider: 'openai',
      accountId: 'acct-29',
      action: 'refresh'
    })
    expect(result).toMatchObject({
      success: true,
      provider: 'openai',
      accountId: 'acct-29',
      action: 'openai_refresh_account'
    })
  })

  test('refreshes the server account mirror without mutating accounts', async () => {
    serverStateService.getAccountMirror.mockResolvedValue({
      target: 'JSZX-AI-03',
      source: {
        kind: 'carher_admin_quota_script',
        accurate: true,
        count: 58
      },
      accounts: [
        { id: 'acct-29', provider: 'openai', schedulable: true },
        { id: 'acct-1', provider: 'openai', schedulable: false }
      ],
      totals: {
        openai: { total: 2, schedulable: 1, stopped: 1 },
        claude: { total: 0, schedulable: 0, stopped: 0 }
      }
    })

    const result = await carherAdminSkillService.runAdminSkillAction({
      action: 'refresh_mirror'
    })

    expect(serverStateService.getAccountMirror).toHaveBeenCalledTimes(1)
    expect(serverStateService.runAccountAction).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      success: true,
      provider: 'all',
      action: 'refresh_mirror',
      dryRun: true,
      mutationEnabled: false,
      data: {
        target: 'JSZX-AI-03',
        source: {
          kind: 'carher_admin_quota_script',
          accurate: true,
          count: 58
        },
        totals: {
          scanned: 2,
          schedulable: 1,
          stopped: 1
        }
      }
    })
  })

  test('blocks live pause by default', async () => {
    await expect(
      carherAdminSkillService.runAdminSkillAction({
        action: 'openai_pause_account',
        accountId: 'acct-29'
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Live server account mutation is disabled'
    })
    expect(serverStateService.runAccountAction).not.toHaveBeenCalled()
  })

  test('probes OpenAI reset bank credits for selected accounts through carher-admin script', async () => {
    process.env.CARHER_ADMIN_RESET_BANK_SCRIPT = '/opt/carher-admin/scripts/chatgpt-acct-reset-bank.sh'
    execFile.mockImplementation((_file, args, _options, callback) => {
      expect(args.slice(1)).toEqual(['probe', '29', '30'])
      callback(
        null,
        [
          'acct-29  {"email":"acct29@example.com","plan":"pro","5h":3,"7d":9,"allowed":true,"credits":1,"5h_reset_at":"2026-07-09T12:00:00Z","7d_reset_at":"2026-07-15T12:00:00Z","addl":[]}',
          'acct-30  {"email":"acct30@example.com","plan":"pro","5h":100,"7d":100,"allowed":false,"credits":0,"5h_reset_at":"2026-07-09T13:00:00Z","7d_reset_at":"2026-07-15T13:00:00Z","addl":[{"name":"codex","5h":100,"7d":80}]}'
        ].join('\n'),
        ''
      )
    })

    const result = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_probe',
      accountIds: ['acct-29', '30']
    })

    expect(result).toMatchObject({
      success: true,
      provider: 'openai',
      action: 'openai_reset_bank_probe',
      dryRun: true,
      mutationEnabled: false,
      data: {
        totals: {
          scanned: 2,
          withCredits: 1,
          exhausted: 1
        }
      }
    })
    expect(result.data.accounts[0]).toMatchObject({
      id: 'acct-29',
      credits: 1,
      fiveHourPercent: 3,
      sevenDayPercent: 9,
      allowed: true
    })
  })

  test('sweeps reset bank by probing priority server mirror accounts first', async () => {
    process.env.CARHER_ADMIN_RESET_BANK_SCRIPT = '/opt/carher-admin/scripts/chatgpt-acct-reset-bank.sh'
    process.env.CARHER_ADMIN_RESET_BANK_SWEEP_LIMIT = '3'
    serverStateService.getAccountMirror.mockResolvedValue({
      accounts: [
        { id: 'acct-1', provider: 'openai', schedulable: true, usage: { sevenDayPercent: 9 } },
        { id: 'acct-25', provider: 'openai', schedulable: true, usage: { sevenDayPercent: 60 } },
        { id: 'acct-26', provider: 'openai', schedulable: true, usage: { sevenDayPercent: 10 } },
        { id: 'acct-2', provider: 'openai', schedulable: false, usage: { sevenDayPercent: 0 } },
        { id: 'claude-1', provider: 'claude', schedulable: true, usage: { sevenDayPercent: 80 } }
      ]
    })
    execFile.mockImplementation((_file, args, _options, callback) => {
      expect(args.slice(1)).toEqual(['probe', '2', '25', '26'])
      callback(
        null,
        [
          'acct-30  {"email":"acct30@example.com","plan":"pro","5h":3,"7d":9,"allowed":true,"credits":1,"reset_card_expires_at":"2026-07-20T00:00:00Z","addl":[]}',
          'acct-29  {"email":"acct29@example.com","plan":"pro","5h":3,"7d":9,"allowed":true,"credits":1,"reset_card_expires_at":"2026-07-10T00:00:00Z","addl":[]}',
          'acct-28  {"email":"acct28@example.com","plan":"pro","5h":3,"7d":9,"allowed":true,"credits":0,"addl":[]}'
        ].join('\n'),
        ''
      )
    })

    const result = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_sweep'
    })

    expect(serverStateService.getAccountMirror).toHaveBeenCalledTimes(1)
    expect(result.data.accounts.map((account) => account.id)).toEqual([
      'acct-29',
      'acct-30',
      'acct-28'
    ])
    expect(result.data.accounts[0]).toMatchObject({
      id: 'acct-29',
      resetCardExpiresAt: '2026-07-10T00:00:00Z',
      dispatchWeight: {
        resetCardCredits: 1,
        hasResetCard: true,
        resetCardExpiresAt: '2026-07-10T00:00:00Z'
      }
    })
  })

  test('sweeps reset bank against quota-stopped high-value accounts, not only schedulable accounts', async () => {
    process.env.CARHER_ADMIN_RESET_BANK_SCRIPT = '/opt/carher-admin/scripts/chatgpt-acct-reset-bank.sh'
    process.env.CARHER_ADMIN_RESET_BANK_SWEEP_LIMIT = '3'
    serverStateService.getAccountMirror.mockResolvedValue({
      accounts: [
        {
          id: 'acct-1',
          provider: 'openai',
          schedulable: true,
          usage: { sevenDayPercent: 9, fiveHourPercent: 1 }
        },
        {
          id: 'acct-29',
          provider: 'openai',
          schedulable: false,
          stopSource: 'quota',
          usage: { sevenDayPercent: 100, fiveHourPercent: 2 }
        },
        {
          id: 'acct-30',
          provider: 'openai',
          schedulable: false,
          stopTrigger: 'scaled_down_reset_elapsed',
          usage: { sevenDayPercent: 20, fiveHourPercent: 100 }
        },
        {
          id: 'acct-2',
          provider: 'openai',
          schedulable: false,
          stopSource: 'remote',
          usage: { sevenDayPercent: 99, fiveHourPercent: 99 }
        }
      ]
    })
    execFile.mockImplementation((_file, args, _options, callback) => {
      expect(args.slice(1)).toEqual(['probe', '29', '30', '2'])
      callback(
        null,
        [
          'acct-29  {"email":"acct29@example.com","plan":"pro","5h":2,"7d":100,"allowed":false,"credits":1,"reset_card_expires_at":"2026-07-10T00:00:00Z","addl":[]}',
          'acct-30  {"email":"acct30@example.com","plan":"pro","5h":100,"7d":20,"allowed":false,"credits":0,"addl":[]}',
          'acct-2   {"email":"acct2@example.com","plan":"pro","5h":99,"7d":99,"allowed":false,"credits":0,"addl":[]}'
        ].join('\n'),
        ''
      )
    })

    const result = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_sweep'
    })

    expect(result.data.totals.scanned).toBe(3)
    expect(result.data.accounts[0]).toMatchObject({
      id: 'acct-29',
      credits: 1
    })
  })

  test('reuses recent reset bank sweep cache to avoid repeating slow probes', async () => {
    process.env.CARHER_ADMIN_RESET_BANK_SCRIPT = '/opt/carher-admin/scripts/chatgpt-acct-reset-bank.sh'
    process.env.CARHER_ADMIN_RESET_BANK_CACHE_TTL_MS = '60000'
    serverStateService.getAccountMirror.mockResolvedValue({
      accounts: [{ id: 'acct-29', provider: 'openai', schedulable: true }]
    })
    execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(
        null,
        'acct-29  {"email":"acct29@example.com","plan":"pro","5h":3,"7d":9,"allowed":true,"credits":1,"addl":[]}',
        ''
      )
    })

    const first = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_sweep'
    })
    const second = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_sweep'
    })

    expect(execFile).toHaveBeenCalledTimes(1)
    expect(first.data.cache.cached).toBe(false)
    expect(second.data.cache.cached).toBe(true)
    expect(second.data.accounts[0].id).toBe('acct-29')
  })

  test('builds full reset bank view from the server mirror and probes priority reset cards', async () => {
    process.env.CARHER_ADMIN_RESET_BANK_SCRIPT = '/opt/carher-admin/scripts/chatgpt-acct-reset-bank.sh'
    serverStateService.getAccountMirror.mockResolvedValue({
      accounts: [
        {
          id: 'acct-1',
          provider: 'openai',
          schedulable: false,
          usage: { fiveHourPercent: 100, sevenDayPercent: 100 },
          recovery: { fiveHourResetAt: 1783505207, sevenDayResetAt: 1783702963 },
          stopSource: 'quota',
          stopTrigger: 'five_hour_limit'
        },
        {
          id: 'acct-29',
          provider: 'openai',
          schedulable: true,
          usage: { fiveHourPercent: 3, sevenDayPercent: 9 }
        }
      ]
    })
    execFile.mockImplementation((_file, args, _options, callback) => {
      expect(args.slice(1)).toEqual(['probe', '1', '29'])
      callback(
        null,
        'acct-29  {"email":"acct29@example.com","plan":"pro","5h":3,"7d":9,"allowed":true,"credits":1,"reset_card_expires_at":"2026-07-10T00:00:00Z","addl":[]}',
        ''
      )
    })

    const result = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_full_sweep'
    })

    expect(serverStateService.getAccountMirror).toHaveBeenCalledTimes(1)
    expect(result.data.scanMode).toBe('full-mirror-priority-probe')
    expect(result.data.totals.scanned).toBe(2)
    expect(result.data.totals.withCredits).toBe(1)
    expect(result.data.totals.probed).toBe(1)
    expect(result.data.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-29',
        available: true,
        credits: 1,
        resetCardProbeStatus: 'probed'
      }),
      expect.objectContaining({
        id: 'acct-1',
        available: false,
        credits: null,
        resetCardProbeStatus: 'not_probed',
        fiveHourPercent: 100,
        sevenDayPercent: 100
      })
    ])
  })

  test('gives full reset bank probe a longer inner timeout than priority probing', async () => {
    process.env.CARHER_ADMIN_RESET_BANK_SCRIPT =
      'C:\\Users\\zhangkairui\\Documents\\Codex\\2026-07-08\\refs\\carher-admin\\scripts\\chatgpt-acct-reset-bank.sh'
    process.env.SERVER_STATE_WSL_BIN = 'wsl-test.exe'
    const commands = []
    execFile.mockImplementation((_file, args, _options, callback) => {
      commands.push(args[3])
      callback(
        null,
        'acct-29  {"email":"acct29@example.com","plan":"pro","5h":3,"7d":9,"allowed":true,"credits":1,"addl":[]}',
        ''
      )
    })

    await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_sweep'
    })
    await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_full_sweep'
    })

    expect(commands[0]).toContain('timeout 20s')
    expect(commands[1]).toContain('timeout 240s')
  })

  test('keeps full reset bank sweep cache separate from priority sweep cache', async () => {
    process.env.CARHER_ADMIN_RESET_BANK_SCRIPT = '/opt/carher-admin/scripts/chatgpt-acct-reset-bank.sh'
    process.env.CARHER_ADMIN_RESET_BANK_CACHE_TTL_MS = '60000'
    serverStateService.getAccountMirror.mockResolvedValue({
      accounts: [{ id: 'acct-29', provider: 'openai', schedulable: true }]
    })
    execFile.mockImplementation((_file, args, _options, callback) => {
      const mode = args.slice(1).join(' ')
      callback(
        null,
        mode === 'sweep'
          ? 'acct-1 {"email":"acct1@example.com","plan":"pro","5h":1,"7d":1,"allowed":true,"credits":0,"addl":[]}'
          : 'acct-29 {"email":"acct29@example.com","plan":"pro","5h":3,"7d":9,"allowed":true,"credits":1,"addl":[]}',
        ''
      )
    })

    const priority = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_sweep'
    })
    const full = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_full_sweep'
    })

    expect(execFile).toHaveBeenCalledTimes(2)
    expect(priority.data.scanMode).toBe('priority-probe')
    expect(full.data.scanMode).toBe('full-mirror-priority-probe')
    expect(full.data.accounts.map((account) => account.id)).toEqual(['acct-29'])
  })

  test('keeps reset bank sweep rows when pods are stopped or auth is expired', async () => {
    process.env.CARHER_ADMIN_RESET_BANK_SCRIPT = '/opt/carher-admin/scripts/chatgpt-acct-reset-bank.sh'
    execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(
        null,
        [
          'acct-1   {"email":"acct1@example.com","plan":"free","5h":100,"7d":null,"allowed":false,"credits":0,"addl":[]}',
          'acct-2   NO_POD scale=0',
          'acct-3   HTTP_401 {',
          '  "error": {',
          '    "message": "Provided authentication token is expired."',
          '  }',
          '}',
          'command terminated with exit code 3'
        ].join('\n'),
        ''
      )
    })

    const result = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_sweep'
    })

    expect(result.data.totals.scanned).toBe(3)
    expect(result.data.totals.available).toBe(1)
    expect(result.data.accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'acct-1', available: true, credits: 0 }),
        expect.objectContaining({ id: 'acct-2', available: false, unavailableReason: 'no_pod' }),
        expect.objectContaining({ id: 'acct-3', available: false, unavailableReason: 'http_401' })
      ])
    )
  })

  test('returns partial reset bank rows when the script exits non-zero after printing accounts', async () => {
    process.env.CARHER_ADMIN_RESET_BANK_SCRIPT = '/opt/carher-admin/scripts/chatgpt-acct-reset-bank.sh'
    execFile.mockImplementation((_file, _args, _options, callback) => {
      const error = new Error('Command failed')
      error.code = 3
      callback(
        error,
        'acct-1   {"email":"acct1@example.com","plan":"free","5h":100,"7d":null,"allowed":false,"credits":0,"addl":[]}\nacct-2   NO_POD scale=0\n',
        'command terminated with exit code 3'
      )
    })

    const result = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_sweep'
    })

    expect(result.data.totals.scanned).toBe(2)
    expect(result.data.accounts.map((account) => account.id)).toEqual(['acct-1', 'acct-2'])
  })

  test('runs reset bank scripts through WSL when configured with a Windows path', async () => {
    process.env.CARHER_ADMIN_RESET_BANK_SCRIPT =
      'C:\\Users\\zhangkairui\\Documents\\Codex\\2026-07-08\\refs\\carher-admin\\scripts\\chatgpt-acct-reset-bank.sh'
    process.env.SERVER_STATE_WSL_BIN = 'wsl-test.exe'
    let capturedFile = ''
    let capturedArgs = []
    execFile.mockImplementation((file, args, _options, callback) => {
      capturedFile = file
      capturedArgs = args
      callback(
        null,
        'acct-29  {"email":"acct29@example.com","plan":"pro","5h":3,"7d":9,"allowed":true,"credits":1,"addl":[]}',
        ''
      )
    })

    const result = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_reset_bank_sweep'
    })

    expect(capturedFile).toBe('wsl-test.exe')
    expect(capturedArgs).toEqual([
      '-e',
      'bash',
      '-lc',
      expect.stringContaining('/mnt/c/Users/zhangkairui/Documents/Codex/2026-07-08/refs/carher-admin/scripts')
    ])
    expect(capturedArgs[3]).toContain("tr -d '\\r'")
    expect(capturedArgs[3]).toContain('tr -d \'\\r\' < jms')
    expect(capturedArgs[3]).toContain('timeout 20s bash "$tmpdir/chatgpt-acct-reset-bank.sh" \'sweep\'')
    expect(result.data.accounts[0].id).toBe('acct-29')
  })
})
