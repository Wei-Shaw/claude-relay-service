/* eslint-env jest */
const {
  captureImageResult,
  normalizeEditImages,
  createImageInput
} = require('../src/services/codexImageBridgeService')

describe('Codex image bridge service', () => {
  test('keeps the longest partial image for each index', () => {
    const images = {}

    captureImageResult({ partial_image_index: 0, partial_image_b64: 'long-value' }, images)
    captureImageResult({ partial_image_index: 0, partial_image_b64: 'short' }, images)

    expect(images).toEqual({ 0: 'long-value' })
  })

  test('captures output_item.done image results and returns their metadata', () => {
    const images = {}
    const item = {
      type: 'image_generation_call',
      result: 'finished-image',
      size: '1024x1024'
    }

    const captured = captureImageResult(
      { type: 'response.output_item.done', output_index: 2, item },
      images
    )

    expect(images).toEqual({ 2: 'finished-image' })
    expect(captured).toBe(item)
  })

  test('captures multiple images from response.completed output', () => {
    const images = { 0: 'partial', 2: 'output-item-result' }

    captureImageResult(
      {
        type: 'response.completed',
        response: {
          output: [
            { type: 'reasoning', content: [] },
            { type: 'image_generation_call', result: 'first-image' },
            { type: 'image_generation_call', result: 'second-image' }
          ]
        }
      },
      images
    )

    expect(images).toEqual({ 0: 'first-image', 1: 'second-image' })
  })

  test('ignores non-image output items', () => {
    const images = {}

    const captured = captureImageResult(
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: { type: 'message', result: 'not-an-image' }
      },
      images
    )

    expect(images).toEqual({})
    expect(captured).toBeNull()
  })

  test('normalizes Codex image edit inputs', () => {
    const imageUrls = normalizeEditImages([
      { image_url: 'data:image/png;base64,aGVsbG8=' },
      { image_url: 'https://example.com/reference.webp' }
    ])

    expect(imageUrls).toEqual([
      'data:image/png;base64,aGVsbG8=',
      'https://example.com/reference.webp'
    ])
    expect(createImageInput('edit this', imageUrls)).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'edit this' },
          {
            type: 'input_image',
            image_url: 'data:image/png;base64,aGVsbG8=',
            detail: 'auto'
          },
          {
            type: 'input_image',
            image_url: 'https://example.com/reference.webp',
            detail: 'auto'
          }
        ]
      }
    ])
  })

  test.each([
    [undefined, 'at least one'],
    [[], 'at least one'],
    [[{ image_url: 'not-an-image' }], 'images[0].image_url'],
    [Array.from({ length: 6 }, () => ({ image_url: 'https://example.com/image.png' })), 'at most 5']
  ])('rejects invalid Codex image edit inputs', (images, expectedMessage) => {
    expect(() => normalizeEditImages(images)).toThrow(expectedMessage)
  })
})
