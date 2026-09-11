const fs = require('fs')
const path = require('path')

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')

describe('API stats billing privacy UI wiring', () => {
  it('keeps the model cost label conditional instead of changing the default wording', () => {
    const component = read('web/admin-spa/src/components/apistats/ModelUsageStats.vue')

    expect(component).toContain('billingDetailsHidden')
    expect(component).toContain('costLabel')
    expect(component).toContain("billingDetailsHidden.value ? '使用费用' : '官方API'")
  })

  it('tracks the backend billingDetailsHidden response flag in the API stats store', () => {
    const store = read('web/admin-spa/src/stores/apistats.js')

    expect(store).toContain('const billingDetailsHidden = ref(false)')
    expect(store).toContain('result?.billingDetailsHidden === true')
    expect(store).toContain('billingDetailsHidden,')
  })
})
