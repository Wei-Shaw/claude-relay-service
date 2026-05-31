const fs = require('fs')
const path = require('path')

describe('frontend toast escaping guard', () => {
  it('does not assign caller-controlled toast content through HTML sinks', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'admin-spa', 'src', 'utils', 'tools.js'),
      'utf8'
    )

    expect(source).not.toMatch(/\.innerHTML\s*=/)
    expect(source).not.toMatch(/onclick=/)
    expect(source).toMatch(/createTextNode/)
    expect(source).toMatch(/textContent/)
  })
})
