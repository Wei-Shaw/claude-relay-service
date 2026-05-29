const { createResponsePayloadCapture } = require('../src/utils/responsePayloadCapture')

describe('responsePayloadCapture', () => {
  test('captures full response text up to max bytes and marks truncation', () => {
    const capture = createResponsePayloadCapture({
      mode: 'full',
      maxBytes: 10,
      previewChars: 5,
      captureHeaders: true
    })

    capture.setHeaders({
      'content-type': 'text/event-stream',
      'set-cookie': 'session=secret'
    })
    capture.appendChunk('hello')
    capture.appendChunk(' world')

    expect(capture.toRequestDetailMeta()).toEqual({
      responseHeaders: {
        'content-type': 'text/event-stream'
      },
      responseBodySizeBytes: 11,
      responseBodyTruncated: true,
      responseTextPreview: 'hello',
      responseBodySnapshot: 'hello worl',
      responseMetadata: {
        captureMode: 'full',
        captureMaxBytes: 10,
        capturedBytes: 10,
        totalBytes: 11
      }
    })
  })

  test('preview mode omits response body snapshot', () => {
    const capture = createResponsePayloadCapture({
      mode: 'preview',
      maxBytes: 32,
      previewChars: 8,
      captureHeaders: false
    })

    capture.appendChunk('complete response')

    const meta = capture.toRequestDetailMeta()
    expect(meta.responseTextPreview).toBe('complete')
    expect(meta.responseBodySnapshot).toBeUndefined()
    expect(meta.responseBodyTruncated).toBe(false)
  })
})
