const adminSecurity = [{ AdminBearerAuth: [] }]

const idParam = (name, description) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description
})

const paginationQueryParams = [
  {
    name: 'page',
    in: 'query',
    required: false,
    schema: { type: 'integer', minimum: 1, default: 1 }
  },
  {
    name: 'pageSize',
    in: 'query',
    required: false,
    schema: { type: 'integer', enum: [10, 20, 50, 100], default: 20 }
  }
]

const genericResponses = {
  '400': {
    description: 'Bad request',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' }
      }
    }
  },
  '401': {
    description: 'Unauthorized',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' }
      }
    }
  },
  '500': {
    description: 'Internal server error',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' }
      }
    }
  }
}

const successEnvelopeResponse = (description) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/SuccessEnvelope' }
    }
  }
})

const objectSchema = {
  type: 'object',
  additionalProperties: true
}

const arrayOfStringsSchema = {
  type: 'array',
  items: { type: 'string' }
}

const adminAgentOpenApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'CRS Admin Agent OpenAPI',
    version: '1.0.0',
    description:
      'OpenAPI for admin API key management and usage statistics. Login first, then call /admin endpoints with Bearer token.'
  },
  servers: [
    {
      url: '/',
      description: 'Current CRS service'
    }
  ],
  tags: [
    { name: 'Auth', description: 'Admin session authentication' },
    { name: 'ApiKeyManagement', description: 'API key management endpoints' },
    { name: 'UsageStats', description: 'Usage and cost statistics endpoints' }
  ],
  security: adminSecurity,
  paths: {
    '/web/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Admin login',
        description: 'Get admin session token for subsequent /admin calls.',
        operationId: 'adminLogin',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminLoginRequest' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Login success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminLoginResponse' }
              }
            }
          },
          ...genericResponses
        }
      }
    },
    '/admin/users': {
      get: {
        tags: ['ApiKeyManagement'],
        summary: 'List users for API key assignment',
        operationId: 'listUsersForApiKeys',
        parameters: [
          {
            name: 'role',
            in: 'query',
            required: false,
            schema: { type: 'string' }
          },
          {
            name: 'isActive',
            in: 'query',
            required: false,
            schema: { type: 'boolean' }
          }
        ],
        responses: {
          '200': successEnvelopeResponse('User list'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/used-models': {
      get: {
        tags: ['ApiKeyManagement'],
        summary: 'List used models',
        operationId: 'listApiKeyUsedModels',
        responses: {
          '200': successEnvelopeResponse('Used model list'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys': {
      get: {
        tags: ['ApiKeyManagement'],
        summary: 'List API keys',
        operationId: 'listApiKeys',
        parameters: [
          ...paginationQueryParams,
          { name: 'searchMode', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'search', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'tag', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'isActive', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'models', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'sortBy', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'sortOrder', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'costTimeRange', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'costStartDate', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'costEndDate', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'timeRange', in: 'query', schema: { type: 'string' }, required: false }
        ],
        responses: {
          '200': successEnvelopeResponse('API key list'),
          ...genericResponses
        }
      },
      post: {
        tags: ['ApiKeyManagement'],
        summary: 'Create API key',
        operationId: 'createApiKey',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiKeyCreateRequest' }
            }
          }
        },
        responses: {
          '200': successEnvelopeResponse('API key created'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/cost-sort-status': {
      get: {
        tags: ['ApiKeyManagement'],
        summary: 'Get cost ranking index status',
        operationId: 'getApiKeyCostSortStatus',
        responses: {
          '200': successEnvelopeResponse('Cost sort status'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/index-status': {
      get: {
        tags: ['ApiKeyManagement'],
        summary: 'Get API key index status',
        operationId: 'getApiKeyIndexStatus',
        responses: {
          '200': successEnvelopeResponse('Index status'),
          ...genericResponses
        }
      }
    },
    '/admin/supported-clients': {
      get: {
        tags: ['ApiKeyManagement'],
        summary: 'List supported clients',
        operationId: 'listSupportedClients',
        responses: {
          '200': successEnvelopeResponse('Supported clients'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/tags': {
      get: {
        tags: ['ApiKeyManagement'],
        summary: 'List API key tags',
        operationId: 'listApiKeyTags',
        responses: {
          '200': successEnvelopeResponse('Tag list'),
          ...genericResponses
        }
      },
      post: {
        tags: ['ApiKeyManagement'],
        summary: 'Create API key tag',
        operationId: 'createApiKeyTag',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' }
                },
                required: ['name']
              }
            }
          }
        },
        responses: {
          '200': successEnvelopeResponse('Tag created'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/tags/details': {
      get: {
        tags: ['ApiKeyManagement'],
        summary: 'List API key tags with counts',
        operationId: 'listApiKeyTagDetails',
        responses: {
          '200': successEnvelopeResponse('Tag details'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/tags/{tagName}': {
      put: {
        tags: ['ApiKeyManagement'],
        summary: 'Rename API key tag',
        operationId: 'renameApiKeyTag',
        parameters: [idParam('tagName', 'Current tag name')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  newName: { type: 'string' }
                },
                required: ['newName']
              }
            }
          }
        },
        responses: {
          '200': successEnvelopeResponse('Tag renamed'),
          ...genericResponses
        }
      },
      delete: {
        tags: ['ApiKeyManagement'],
        summary: 'Delete API key tag from all keys',
        operationId: 'deleteApiKeyTag',
        parameters: [idParam('tagName', 'Tag name')],
        responses: {
          '200': successEnvelopeResponse('Tag deleted'),
          ...genericResponses
        }
      }
    },
    '/admin/accounts/binding-counts': {
      get: {
        tags: ['ApiKeyManagement'],
        summary: 'Get account binding counts',
        operationId: 'getAccountBindingCounts',
        responses: {
          '200': successEnvelopeResponse('Binding counts'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/batch-stats': {
      post: {
        tags: ['ApiKeyManagement'],
        summary: 'Batch get API key stats',
        operationId: 'batchGetApiKeyStats',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BatchStatsRequest' }
            }
          }
        },
        responses: {
          '200': successEnvelopeResponse('Batch stats'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/batch-last-usage': {
      post: {
        tags: ['ApiKeyManagement'],
        summary: 'Batch get API key last usage account',
        operationId: 'batchGetApiKeyLastUsage',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BatchIdsRequest' }
            }
          }
        },
        responses: {
          '200': successEnvelopeResponse('Batch last usage'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/batch': {
      post: {
        tags: ['ApiKeyManagement'],
        summary: 'Batch create API keys',
        operationId: 'batchCreateApiKeys',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiKeyBatchCreateRequest' }
            }
          }
        },
        responses: {
          '200': successEnvelopeResponse('Batch created API keys'),
          ...genericResponses
        }
      },
      put: {
        tags: ['ApiKeyManagement'],
        summary: 'Batch update API keys',
        operationId: 'batchUpdateApiKeys',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiKeyBatchUpdateRequest' }
            }
          }
        },
        responses: {
          '200': successEnvelopeResponse('Batch updated API keys'),
          ...genericResponses
        }
      },
      delete: {
        tags: ['ApiKeyManagement'],
        summary: 'Batch soft delete API keys',
        operationId: 'batchDeleteApiKeys',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BatchIdsRequest' }
            }
          }
        },
        responses: {
          '200': successEnvelopeResponse('Batch deleted API keys'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/{keyId}': {
      put: {
        tags: ['ApiKeyManagement'],
        summary: 'Update API key',
        operationId: 'updateApiKey',
        parameters: [idParam('keyId', 'API key ID')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiKeyUpdateRequest' }
            }
          }
        },
        responses: {
          '200': successEnvelopeResponse('API key updated'),
          ...genericResponses
        }
      },
      delete: {
        tags: ['ApiKeyManagement'],
        summary: 'Soft delete API key',
        operationId: 'deleteApiKey',
        parameters: [idParam('keyId', 'API key ID')],
        responses: {
          '200': successEnvelopeResponse('API key deleted'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/{keyId}/expiration': {
      patch: {
        tags: ['ApiKeyManagement'],
        summary: 'Update API key expiration',
        operationId: 'updateApiKeyExpiration',
        parameters: [idParam('keyId', 'API key ID')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiKeyExpirationRequest' }
            }
          }
        },
        responses: {
          '200': successEnvelopeResponse('API key expiration updated'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/deleted': {
      get: {
        tags: ['ApiKeyManagement'],
        summary: 'List deleted API keys',
        operationId: 'listDeletedApiKeys',
        responses: {
          '200': successEnvelopeResponse('Deleted API keys'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/{keyId}/restore': {
      post: {
        tags: ['ApiKeyManagement'],
        summary: 'Restore deleted API key',
        operationId: 'restoreApiKey',
        parameters: [idParam('keyId', 'API key ID')],
        responses: {
          '200': successEnvelopeResponse('API key restored'),
          ...genericResponses
        }
      }
    },
    '/admin/accounts/usage-stats': {
      get: {
        tags: ['UsageStats'],
        summary: 'Get usage stats for all accounts',
        operationId: 'listAccountUsageStats',
        responses: {
          '200': successEnvelopeResponse('Account usage stats'),
          ...genericResponses
        }
      }
    },
    '/admin/accounts/{accountId}/usage-stats': {
      get: {
        tags: ['UsageStats'],
        summary: 'Get usage stats for one account',
        operationId: 'getAccountUsageStats',
        parameters: [idParam('accountId', 'Account ID')],
        responses: {
          '200': successEnvelopeResponse('Account usage stats'),
          ...genericResponses
        }
      }
    },
    '/admin/accounts/{accountId}/usage-history': {
      get: {
        tags: ['UsageStats'],
        summary: 'Get account usage history',
        operationId: 'getAccountUsageHistory',
        parameters: [
          idParam('accountId', 'Account ID'),
          {
            name: 'platform',
            in: 'query',
            required: false,
            schema: { type: 'string' }
          },
          {
            name: 'days',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, default: 30 }
          }
        ],
        responses: {
          '200': successEnvelopeResponse('Account usage history'),
          ...genericResponses
        }
      }
    },
    '/admin/usage-trend': {
      get: {
        tags: ['UsageStats'],
        summary: 'Get usage trend',
        operationId: 'getUsageTrend',
        parameters: [
          {
            name: 'days',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, default: 7 }
          },
          {
            name: 'granularity',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['day', 'hour'], default: 'day' }
          },
          {
            name: 'startDate',
            in: 'query',
            required: false,
            schema: { type: 'string' }
          },
          {
            name: 'endDate',
            in: 'query',
            required: false,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': successEnvelopeResponse('Usage trend'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/{keyId}/model-stats': {
      get: {
        tags: ['UsageStats'],
        summary: 'Get API key model stats',
        operationId: 'getApiKeyModelStats',
        parameters: [idParam('keyId', 'API key ID')],
        responses: {
          '200': successEnvelopeResponse('API key model stats'),
          ...genericResponses
        }
      }
    },
    '/admin/account-usage-trend': {
      get: {
        tags: ['UsageStats'],
        summary: 'Get account usage trend',
        operationId: 'getAccountUsageTrend',
        parameters: [
          {
            name: 'granularity',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['day', 'hour'], default: 'day' }
          },
          {
            name: 'group',
            in: 'query',
            required: false,
            schema: { type: 'string', default: 'claude' }
          },
          {
            name: 'days',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, default: 7 }
          },
          { name: 'startDate', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'endDate', in: 'query', required: false, schema: { type: 'string' } }
        ],
        responses: {
          '200': successEnvelopeResponse('Account usage trend'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys-usage-trend': {
      get: {
        tags: ['UsageStats'],
        summary: 'Get API keys usage trend',
        operationId: 'getApiKeysUsageTrend',
        parameters: [
          {
            name: 'granularity',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['day', 'hour'], default: 'day' }
          },
          {
            name: 'days',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, default: 7 }
          },
          { name: 'startDate', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'endDate', in: 'query', required: false, schema: { type: 'string' } }
        ],
        responses: {
          '200': successEnvelopeResponse('API keys usage trend'),
          ...genericResponses
        }
      }
    },
    '/admin/usage-costs': {
      get: {
        tags: ['UsageStats'],
        summary: 'Get aggregated usage costs',
        operationId: 'getUsageCosts',
        parameters: [
          {
            name: 'period',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['all', 'today', 'monthly', '7days'],
              default: 'all'
            }
          }
        ],
        responses: {
          '200': successEnvelopeResponse('Usage costs'),
          ...genericResponses
        }
      }
    },
    '/admin/api-keys/{keyId}/usage-records': {
      get: {
        tags: ['UsageStats'],
        summary: 'Get API key usage records',
        operationId: 'getApiKeyUsageRecords',
        parameters: [
          idParam('keyId', 'API key ID'),
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1 }
          }
        ],
        responses: {
          '200': successEnvelopeResponse('API key usage records'),
          ...genericResponses
        }
      }
    },
    '/admin/accounts/{accountId}/usage-records': {
      get: {
        tags: ['UsageStats'],
        summary: 'Get account usage records',
        operationId: 'getAccountUsageRecords',
        parameters: [
          idParam('accountId', 'Account ID'),
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1 }
          },
          {
            name: 'platform',
            in: 'query',
            required: false,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': successEnvelopeResponse('Account usage records'),
          ...genericResponses
        }
      }
    }
  },
  components: {
    securitySchemes: {
      AdminBearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'SessionToken',
        description:
          'Admin session token returned by POST /web/auth/login. Use Authorization: Bearer <token>.'
      }
    },
    schemas: {
      AdminLoginRequest: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          password: { type: 'string' }
        },
        required: ['username', 'password']
      },
      AdminLoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          token: { type: 'string' },
          expiresIn: { type: 'integer' },
          username: { type: 'string' }
        },
        required: ['success', 'token', 'expiresIn', 'username']
      },
      SuccessEnvelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: objectSchema,
          total: { type: 'integer' },
          timestamp: { type: 'string', format: 'date-time' }
        },
        additionalProperties: true
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'string' },
          message: { type: 'string' }
        },
        additionalProperties: true
      },
      BatchIdsRequest: {
        type: 'object',
        properties: {
          keyIds: arrayOfStringsSchema
        },
        required: ['keyIds']
      },
      BatchStatsRequest: {
        type: 'object',
        properties: {
          keyIds: arrayOfStringsSchema,
          timeRange: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' }
        },
        required: ['keyIds']
      },
      ApiKeyCreateRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          tokenLimit: { type: 'integer' },
          expiresAt: { type: 'string' },
          claudeAccountId: { type: 'string' },
          claudeConsoleAccountId: { type: 'string' },
          geminiAccountId: { type: 'string' },
          openaiAccountId: { type: 'string' },
          bedrockAccountId: { type: 'string' },
          droidAccountId: { type: 'string' },
          permissions: arrayOfStringsSchema,
          concurrencyLimit: { type: 'integer' },
          rateLimitWindow: { type: 'integer' },
          rateLimitRequests: { type: 'integer' },
          rateLimitCost: { type: 'number' },
          enableModelRestriction: { type: 'boolean' },
          restrictedModels: arrayOfStringsSchema,
          enableClientRestriction: { type: 'boolean' },
          allowedClients: arrayOfStringsSchema,
          allow1mContext: { type: 'boolean' },
          dailyCostLimit: { type: 'number' },
          totalCostLimit: { type: 'number' },
          weeklyOpusCostLimit: { type: 'number' },
          tags: arrayOfStringsSchema,
          activationDays: { type: 'integer' },
          activationUnit: { type: 'string', enum: ['hours', 'days'] },
          expirationMode: { type: 'string', enum: ['fixed', 'activation'] },
          icon: { type: 'string' },
          serviceRates: objectSchema,
          weeklyResetDay: { type: 'integer', minimum: 1, maximum: 7 },
          weeklyResetHour: { type: 'integer', minimum: 0, maximum: 23 }
        },
        required: ['name'],
        additionalProperties: false
      },
      ApiKeyBatchCreateRequest: {
        type: 'object',
        properties: {
          baseName: { type: 'string' },
          count: { type: 'integer' },
          description: { type: 'string' },
          tokenLimit: { type: 'integer' },
          expiresAt: { type: 'string' },
          claudeAccountId: { type: 'string' },
          claudeConsoleAccountId: { type: 'string' },
          geminiAccountId: { type: 'string' },
          openaiAccountId: { type: 'string' },
          bedrockAccountId: { type: 'string' },
          droidAccountId: { type: 'string' },
          permissions: arrayOfStringsSchema,
          concurrencyLimit: { type: 'integer' },
          rateLimitWindow: { type: 'integer' },
          rateLimitRequests: { type: 'integer' },
          rateLimitCost: { type: 'number' },
          enableModelRestriction: { type: 'boolean' },
          restrictedModels: arrayOfStringsSchema,
          enableClientRestriction: { type: 'boolean' },
          allowedClients: arrayOfStringsSchema,
          allow1mContext: { type: 'boolean' },
          dailyCostLimit: { type: 'number' },
          totalCostLimit: { type: 'number' },
          weeklyOpusCostLimit: { type: 'number' },
          tags: arrayOfStringsSchema,
          activationDays: { type: 'integer' },
          activationUnit: { type: 'string', enum: ['hours', 'days'] },
          expirationMode: { type: 'string', enum: ['fixed', 'activation'] },
          icon: { type: 'string' },
          serviceRates: objectSchema
        },
        required: ['baseName', 'count'],
        additionalProperties: false
      },
      ApiKeyBatchUpdateRequest: {
        type: 'object',
        properties: {
          keyIds: arrayOfStringsSchema,
          updates: objectSchema
        },
        required: ['keyIds', 'updates'],
        additionalProperties: false
      },
      ApiKeyUpdateRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          tokenLimit: { type: 'integer' },
          concurrencyLimit: { type: 'integer' },
          rateLimitWindow: { type: 'integer' },
          rateLimitRequests: { type: 'integer' },
          rateLimitCost: { type: 'number' },
          isActive: { type: 'boolean' },
          claudeAccountId: { type: 'string' },
          claudeConsoleAccountId: { type: 'string' },
          geminiAccountId: { type: 'string' },
          openaiAccountId: { type: 'string' },
          bedrockAccountId: { type: 'string' },
          droidAccountId: { type: 'string' },
          permissions: arrayOfStringsSchema,
          enableModelRestriction: { type: 'boolean' },
          restrictedModels: arrayOfStringsSchema,
          enableClientRestriction: { type: 'boolean' },
          allowedClients: arrayOfStringsSchema,
          allow1mContext: { type: 'boolean' },
          expiresAt: { type: ['string', 'null'] },
          dailyCostLimit: { type: 'number' },
          totalCostLimit: { type: 'number' },
          weeklyOpusCostLimit: { type: 'number' },
          tags: arrayOfStringsSchema,
          ownerId: { type: 'string' },
          serviceRates: objectSchema,
          weeklyResetDay: { type: 'integer', minimum: 1, maximum: 7 },
          weeklyResetHour: { type: 'integer', minimum: 0, maximum: 23 }
        },
        additionalProperties: false
      },
      ApiKeyExpirationRequest: {
        type: 'object',
        properties: {
          expiresAt: { type: ['string', 'null'] },
          activateNow: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  }
}

const formatYamlScalar = (value) => {
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value === null) {
    return 'null'
  }
  return JSON.stringify(value)
}

const toYaml = (value, indent = 0) => {
  const padding = ' '.repeat(indent)

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${padding}[]`
    }

    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          const nested = toYaml(item, indent + 2)
          const nestedLines = nested.split('\n')
          const head = `${padding}- ${nestedLines[0].trimStart()}`
          if (nestedLines.length === 1) {
            return head
          }
          const tail = nestedLines.slice(1).join('\n')
          return `${head}\n${tail}`
        }

        return `${padding}- ${formatYamlScalar(item)}`
      })
      .join('\n')
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return `${padding}{}`
    }

    return entries
      .map(([key, childValue]) => {
        const quotedKey = JSON.stringify(key)
        if (childValue && typeof childValue === 'object') {
          return `${padding}${quotedKey}:\n${toYaml(childValue, indent + 2)}`
        }

        return `${padding}${quotedKey}: ${formatYamlScalar(childValue)}`
      })
      .join('\n')
  }

  return `${padding}${formatYamlScalar(value)}`
}

module.exports = {
  adminAgentOpenApiSpec,
  toYaml
}
