const MAX_EDIT_IMAGES = 5

function captureImageResult(event, images) {
  if (event && typeof event.partial_image_b64 === 'string') {
    const index = Number.isInteger(event.partial_image_index) ? event.partial_image_index : 0
    if (!images[index] || event.partial_image_b64.length >= images[index].length) {
      images[index] = event.partial_image_b64
    }
  }

  if (
    event?.type === 'response.output_item.done' &&
    event.item?.type === 'image_generation_call' &&
    typeof event.item.result === 'string'
  ) {
    const index = Number.isInteger(event.output_index)
      ? event.output_index
      : Object.keys(images).length
    images[index] = event.item.result
    return event.item
  }

  if (event?.type === 'response.completed' && Array.isArray(event.response?.output)) {
    const completedImages = event.response.output
      .filter(
        (outputItem) =>
          outputItem?.type === 'image_generation_call' && typeof outputItem.result === 'string'
      )
      .map((outputItem) => outputItem.result)

    if (completedImages.length > 0) {
      for (const index of Object.keys(images)) {
        delete images[index]
      }
      completedImages.forEach((image, index) => {
        images[index] = image
      })
    }
  }

  return null
}

function normalizeEditImages(images) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('images must contain at least one image')
  }
  if (images.length > MAX_EDIT_IMAGES) {
    throw new Error(`images must contain at most ${MAX_EDIT_IMAGES} images`)
  }

  return images.map((image, index) => {
    const imageUrl = typeof image?.image_url === 'string' ? image.image_url.trim() : ''
    const isDataUrl = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+$/i.test(imageUrl)
    const isRemoteUrl = /^https?:\/\/\S+$/i.test(imageUrl)
    if (!isDataUrl && !isRemoteUrl) {
      throw new Error(`images[${index}].image_url must be an image data URL or HTTP(S) URL`)
    }
    return imageUrl
  })
}

function createImageInput(prompt, imageUrls = []) {
  return [
    {
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: prompt },
        ...imageUrls.map((imageUrl) => ({
          type: 'input_image',
          image_url: imageUrl,
          detail: 'auto'
        }))
      ]
    }
  ]
}

module.exports = { captureImageResult, normalizeEditImages, createImageInput, MAX_EDIT_IMAGES }
