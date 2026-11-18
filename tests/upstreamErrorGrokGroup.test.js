// Regression test: grok accounts joined account groups (accountGroupService accepts
// platform 'grok' and grokScheduler handles 'group:' bindings) but upstreamErrorHelper
// never learned about the platform — the group-platform maps and the pause-decision
// account loader all lacked grok entries, so a grok group's enabled-member count was
// always 0 and group-level temp-unavailable decisions were made against bogus data.

const mockGetGroup = jest.fn(async () => ({ id: 'grp-1', platform: 'grok' }))
const mockGetGroupMembers = jest.fn(async () => ['grok-m1', 'grok-m2'])
const mockGetGrokAccount = jest.fn(async (accountId) => ({
  id: accountId,
  isActive: true,
  schedulable: true,
  status: 'active'
}))

jest.mock('../src/models/redis', () => ({
  getClientSafe: () => ({}),
  getRedis: () => ({})
}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))
jest.mock('../config/config', () => ({ upstreamError: {} }))
jest.mock('../src/services/accountGroupService', () => ({
  getGroup: mockGetGroup,
  getGroupMembers: mockGetGroupMembers
}))
jest.mock('../src/services/account/grokAccountService', () => ({
  getAccount: mockGetGrokAccount
}))

const upstreamErrorHelper = require('../src/utils/upstreamErrorHelper')

const context = (groupId = 'grp-1') => ({ schedulingMode: 'group', groupId })

describe('grok group temp-unavailable decisions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetGroup.mockResolvedValue({ id: 'grp-1', platform: 'grok' })
  })

  it('enumerates grok group members and keeps group pause active with 2 enabled members', async () => {
    const result = await upstreamErrorHelper.shouldSkipTempUnavailableForScheduling(
      'grok-m1',
      'grok',
      context()
    )

    // both members must be loaded through the grok account service
    expect(mockGetGrokAccount).toHaveBeenCalledTimes(2)
    expect(mockGetGrokAccount).toHaveBeenCalledWith('grok-m1')
    expect(mockGetGrokAccount).toHaveBeenCalledWith('grok-m2')
    expect(result).toEqual({ skip: false })
  })

  it('skips temp-unavailable when the group has a single enabled member', async () => {
    mockGetGrokAccount.mockResolvedValueOnce({
      id: 'grok-m1',
      isActive: true,
      schedulable: true,
      status: 'active'
    })
    mockGetGrokAccount.mockResolvedValueOnce(null)

    const result = await upstreamErrorHelper.shouldSkipTempUnavailableForScheduling(
      'grok-m1',
      'grok',
      context()
    )

    expect(result).toEqual({ skip: true, reason: 'single_enabled_group_account' })
  })

  it('falls back to the account-type map when the group record has no platform', async () => {
    mockGetGroup.mockResolvedValue({ id: 'grp-1' })

    const result = await upstreamErrorHelper.shouldSkipTempUnavailableForScheduling(
      'grok-m1',
      'grok',
      context()
    )

    // platform resolved via ACCOUNT_TYPE_TO_GROUP_PLATFORM['grok'], members still enumerated
    expect(mockGetGrokAccount).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ skip: false })
  })
})
